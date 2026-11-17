"""Festival ao vivo: cardápio do dia com estoque de fatias e PDV no balcão.

Tudo de um dia de festival fica num único documento (sabores, fatias
preparadas, fatias vendidas e a lista de vendas). Cada alteração passa por
`FestivalLiveRepository.update`, que lê e grava de uma vez só — o estoque
nunca fica negativo, mesmo com dois tablets vendendo juntos.
"""
import re
import time
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from src.application.store.use_cases import _load_settings
from src.domain.shared.exceptions import (
    FestivalSaleNotFoundError,
    InsufficientStockError,
    OrganizationNotFoundError,
)
from src.infrastructure.repositories import FestivalLiveRepository, OrganizationRepository
from src.interfaces.http.v1.schemas import (
    FestivalLiveConfig,
    FestivalLiveItemState,
    FestivalLiveState,
    FestivalSale,
    FestivalSaleCreate,
    FestivalSaleLine,
    PublicFestivalLive,
    PublicFestivalLiveItem,
    PublicFestivalLiveResponse,
)

_BRT = ZoneInfo("America/Sao_Paulo")
_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MAX_SALES = 5000


def today_brt() -> str:
    return datetime.now(_BRT).date().isoformat()


def _check_day(day: str) -> str:
    if not _DAY_RE.match(day):
        raise ValueError("Data inválida (use AAAA-MM-DD).")
    return day


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _slug_id(name: str, used: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:30] or "sabor"
    candidate, n = base, 2
    while candidate in used:
        candidate = f"{base}-{n}"
        n += 1
    used.add(candidate)
    return candidate


def _default_state(db: Session, organization_id: UUID, day: str) -> FestivalLiveState:
    """Primeiro acesso ao dia: já vem com os sabores cadastrados na loja, só
    falta a dona dizer quantas fatias e o preço."""
    org = OrganizationRepository(db).get_by_id(organization_id)
    if org is None:
        raise OrganizationNotFoundError(str(organization_id))
    settings = _load_settings(org.settings)
    used: set[str] = set()
    items = [
        FestivalLiveItemState(
            id=_slug_id(f.name, used), flavor=f.name, photo_url=f.photo_url, price=0, slices_total=0
        )
        for f in settings.flavors
        if f.name.strip()
    ]
    return FestivalLiveState(date=day, items=items)


def _parse(day: str, data: dict | None) -> FestivalLiveState | None:
    if not data:
        return None
    return FestivalLiveState.model_validate({**data, "date": day})


def get_state(db: Session, *, organization_id: UUID, day: str) -> FestivalLiveState:
    _check_day(day)
    state = _parse(day, FestivalLiveRepository(db).get(organization_id, day))
    return state or _default_state(db, organization_id, day)


def _mutate(db: Session, organization_id: UUID, day: str, change) -> FestivalLiveState:
    """Aplica `change(state)` de forma atômica e devolve o estado novo."""
    _check_day(day)
    fallback = _default_state(db, organization_id, day)

    def fn(current: dict | None):
        state = _parse(day, current) or fallback.model_copy(deep=True)
        change(state)
        state.updated_at = _now_iso()
        data = state.model_dump(mode="json")
        return data, state

    return FestivalLiveRepository(db).update(organization_id, day, fn)


def save_config(
    db: Session, *, organization_id: UUID, day: str, config: FestivalLiveConfig
) -> FestivalLiveState:
    def change(state: FestivalLiveState) -> None:
        sold_by_id = {i.id: i.sold for i in state.items}
        seen: set[str] = set()
        items: list[FestivalLiveItemState] = []
        for item in config.items:
            if item.id in seen:
                continue
            seen.add(item.id)
            sold = sold_by_id.get(item.id, 0)
            items.append(FestivalLiveItemState(**item.model_dump(), sold=sold))
        state.items = items
        state.public_enabled = config.public_enabled
        state.status = config.status
        state.counter_reserve_pct = config.counter_reserve_pct
        state.max_per_order = config.max_per_order

    return _mutate(db, organization_id, day, change)


def create_sale(
    db: Session, *, organization_id: UUID, day: str, payload: FestivalSaleCreate
) -> FestivalLiveState:
    def change(state: FestivalLiveState) -> None:
        # Mesma venda reenviada (o tablet não recebeu a resposta): não duplica.
        if any(s.id == payload.id for s in state.sales):
            return
        items = {i.id: i for i in state.items}
        wanted: dict[str, int] = {}
        for line in payload.lines:
            if line.item_id not in items:
                raise InsufficientStockError("Um dos sabores não está mais no cardápio.")
            wanted[line.item_id] = wanted.get(line.item_id, 0) + line.qty
        for item_id, qty in wanted.items():
            item = items[item_id]
            remaining = max(0, item.slices_total - item.sold)
            if qty > remaining:
                if remaining == 0:
                    raise InsufficientStockError(f"{item.flavor} esgotou.")
                raise InsufficientStockError(
                    f"Só {'resta' if remaining == 1 else 'restam'} {remaining} "
                    f"{'fatia' if remaining == 1 else 'fatias'} de {item.flavor}."
                )
        lines = []
        for item_id, qty in wanted.items():
            item = items[item_id]
            item.sold += qty
            lines.append(
                FestivalSaleLine(item_id=item_id, flavor=item.flavor, qty=qty, price=item.price)
            )
        total = round(sum(line.qty * line.price for line in lines), 2)
        state.sales.append(
            FestivalSale(
                id=payload.id,
                at=_now_iso(),
                lines=lines,
                total=total,
                method=payload.method,
                received=payload.received,
            )
        )
        if len(state.sales) > _MAX_SALES:
            state.sales = state.sales[-_MAX_SALES:]

    return _mutate(db, organization_id, day, change)


def cancel_sale(
    db: Session, *, organization_id: UUID, day: str, sale_id: str
) -> FestivalLiveState:
    def change(state: FestivalLiveState) -> None:
        sale = next((s for s in state.sales if s.id == sale_id), None)
        if sale is None:
            raise FestivalSaleNotFoundError(sale_id)
        if sale.canceled:
            return
        items = {i.id: i for i in state.items}
        for line in sale.lines:
            item = items.get(line.item_id)
            if item is not None:
                item.sold = max(0, item.sold - line.qty)
        sale.canceled = True
        sale.canceled_at = _now_iso()

    return _mutate(db, organization_id, day, change)


# slug → (quando guardou, resposta). Curto: o cardápio muda a cada venda.
_PUBLIC_TTL_SECONDS = 5.0
_public_cache: dict[str, tuple[float, PublicFestivalLiveResponse]] = {}


def get_public_live(db: Session, *, slug: str) -> PublicFestivalLiveResponse:
    cached = _public_cache.get(slug)
    if cached is not None and time.monotonic() - cached[0] < _PUBLIC_TTL_SECONDS:
        return cached[1]
    org = OrganizationRepository(db).get_by_slug(slug)
    if org is None:
        raise OrganizationNotFoundError(slug)
    org_id = org.id if isinstance(org.id, UUID) else UUID(str(org.id))
    day = today_brt()
    state = _parse(day, FestivalLiveRepository(db).get(org_id, day))
    live = None
    if state is not None and state.public_enabled:
        live = PublicFestivalLive(
            date=day,
            status=state.status,
            updated_at=state.updated_at,
            items=[
                PublicFestivalLiveItem(
                    flavor=i.flavor,
                    photo_url=i.photo_url,
                    price=i.price,
                    remaining=max(0, i.slices_total - i.sold),
                    sold_out=i.slices_total - i.sold <= 0,
                )
                for i in state.items
                if i.slices_total > 0
            ],
        )
    response = PublicFestivalLiveResponse(live=live)
    _public_cache[slug] = (time.monotonic(), response)
    return response
