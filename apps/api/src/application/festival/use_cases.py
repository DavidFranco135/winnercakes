"""Festival ao vivo: cardápio do dia com estoque de fatias e PDV no balcão.

Tudo de um dia de festival fica num único documento (sabores, fatias
preparadas, fatias vendidas e a lista de vendas). Cada alteração passa por
`FestivalLiveRepository.update`, que lê e grava de uma vez só — o estoque
nunca fica negativo, mesmo com dois tablets vendendo juntos.
"""
import math
import re
import secrets
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from src.application.store.use_cases import _load_settings
from src.domain.shared.exceptions import (
    FestivalOrderError,
    FestivalSaleNotFoundError,
    InsufficientStockError,
    OrganizationNotFoundError,
    PaymentProviderError,
    TooManyRequestsError,
)
from src.infrastructure import mercadopago
from src.infrastructure.repositories import FestivalLiveRepository, OrganizationRepository
from src.interfaces.http.v1.schemas import (
    FestivalLiveConfig,
    FestivalLiveItemState,
    FestivalLiveState,
    FestivalOnlineOrder,
    FestivalOrderCreate,
    FestivalRedeemResult,
    FestivalSale,
    FestivalSaleCreate,
    FestivalSaleLine,
    MercadoPagoSettingsIn,
    MercadoPagoSettingsOut,
    PublicFestivalLive,
    PublicFestivalLiveItem,
    PublicFestivalLiveResponse,
    PublicFestivalOrder,
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


HOLD_MINUTES = 15


def _held(state: FestivalLiveState, now: datetime | None = None) -> dict[str, int]:
    """Fatias seguradas por pedidos do celular que ainda esperam o Pix."""
    moment = (now or datetime.now(UTC)).isoformat()
    held: dict[str, int] = {}
    for o in state.orders:
        if o.status == "aguardando" and o.hold_until > moment:
            for line in o.lines:
                held[line.item_id] = held.get(line.item_id, 0) + line.qty
    return held


def _counter_left(item: FestivalLiveItemState, held: dict[str, int]) -> int:
    return max(0, item.slices_total - item.sold - held.get(item.id, 0))


def _online_left(
    state: FestivalLiveState, item: FestivalLiveItemState, held: dict[str, int]
) -> int:
    """O celular nunca passa da cota dele: o resto fica garantido para o balcão."""
    cap = math.floor(item.slices_total * (100 - state.counter_reserve_pct) / 100)
    used = item.sold_online + held.get(item.id, 0)
    return max(0, min(_counter_left(item, held), cap - used))


def _unit(item: FestivalLiveItemState, n: int) -> str:
    if item.kind == "produto":
        return "unidade" if n == 1 else "unidades"
    return "fatia" if n == 1 else "fatias"


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
        sold_by_id = {i.id: (i.sold, i.sold_online) for i in state.items}
        seen: set[str] = set()
        items: list[FestivalLiveItemState] = []
        for item in config.items:
            if item.id in seen:
                continue
            seen.add(item.id)
            sold, sold_online = sold_by_id.get(item.id, (0, 0))
            items.append(
                FestivalLiveItemState(**item.model_dump(), sold=sold, sold_online=sold_online)
            )
        state.items = items
        state.public_enabled = config.public_enabled
        state.online_enabled = config.online_enabled
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
        held = _held(state)
        wanted: dict[str, int] = {}
        for line in payload.lines:
            if line.item_id not in items:
                raise InsufficientStockError("Um dos sabores não está mais no cardápio.")
            wanted[line.item_id] = wanted.get(line.item_id, 0) + line.qty
        for item_id, qty in wanted.items():
            item = items[item_id]
            remaining = _counter_left(item, held)
            if qty > remaining:
                if remaining == 0:
                    raise InsufficientStockError(f"{item.flavor} esgotou.")
                raise InsufficientStockError(
                    f"Só {'resta' if remaining == 1 else 'restam'} {remaining} "
                    f"{_unit(item, remaining)} de {item.flavor}."
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
_PUBLIC_TTL_SECONDS = 2.0
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
        held = _held(state)
        online = state.online_enabled and state.status == "aberto" and _mp_configured(db, org_id)
        live = PublicFestivalLive(
            date=day,
            status=state.status,
            updated_at=state.updated_at,
            online_enabled=online,
            max_per_order=state.max_per_order,
            items=[
                PublicFestivalLiveItem(
                    id=i.id,
                    kind=i.kind,
                    flavor=i.flavor,
                    photo_url=i.photo_url,
                    price=i.price,
                    remaining=_counter_left(i, held),
                    sold_out=i.slices_total - i.sold <= 0,
                    online_available=_online_left(state, i, held) if online else 0,
                )
                for i in state.items
                if i.slices_total > 0
            ],
        )
    response = PublicFestivalLiveResponse(live=live)
    _public_cache[slug] = (time.monotonic(), response)
    return response


# ---------------------------------------------------------------------------
# Mercado Pago (credencial guardada à parte, nunca devolvida ao navegador)
# ---------------------------------------------------------------------------

_MP_KEY = "_mercadopago"  # documento reservado, fora do padrão AAAA-MM-DD


def _mp_settings(db: Session, organization_id: UUID) -> dict:
    return FestivalLiveRepository(db).get(organization_id, _MP_KEY) or {}


def _mp_configured(db: Session, organization_id: UUID) -> bool:
    return bool(_mp_settings(db, organization_id).get("access_token"))


def get_mp_settings(db: Session, *, organization_id: UUID) -> MercadoPagoSettingsOut:
    data = _mp_settings(db, organization_id)
    token = data.get("access_token") or ""
    return MercadoPagoSettingsOut(
        configured=bool(token),
        test_mode=bool(data.get("test_mode", True)),
        token_hint=f"…{token[-4:]}" if token else "",
    )


def save_mp_settings(
    db: Session, *, organization_id: UUID, payload: MercadoPagoSettingsIn
) -> MercadoPagoSettingsOut:
    def fn(current: dict | None):
        data = dict(current or {})
        if payload.access_token is not None:
            data["access_token"] = payload.access_token.strip()
        data["test_mode"] = payload.test_mode
        return data, None

    FestivalLiveRepository(db).update(organization_id, _MP_KEY, fn)
    return get_mp_settings(db, organization_id=organization_id)


# ---------------------------------------------------------------------------
# Pedido pelo celular: segura as fatias, gera o Pix, vira ticket quando paga
# ---------------------------------------------------------------------------

_RATE_WINDOW_SECONDS = 600
_RATE_MAX = 6
_rate: dict[str, list[float]] = {}
_last_sync: dict[str, float] = {}
_SYNC_EVERY_SECONDS = 3.0


def _check_rate(key: str) -> None:
    now = time.monotonic()
    hits = [t for t in _rate.get(key, []) if now - t < _RATE_WINDOW_SECONDS]
    if len(hits) >= _RATE_MAX:
        raise TooManyRequestsError("Muitos pedidos seguidos. Espere alguns minutos.")
    hits.append(now)
    _rate[key] = hits


def _org_for_slug(db: Session, slug: str):
    org = OrganizationRepository(db).get_by_slug(slug)
    if org is None:
        raise OrganizationNotFoundError(slug)
    org_id = org.id if isinstance(org.id, UUID) else UUID(str(org.id))
    return org, org_id


def _day_from_token(token: str) -> str:
    if len(token) < 20 or not token[:8].isdigit():
        raise FestivalOrderError("Pedido não encontrado.")
    return f"{token[:4]}-{token[4:6]}-{token[6:8]}"


def _find_by_token(state: FestivalLiveState, token: str) -> FestivalOnlineOrder | None:
    for o in state.orders:
        if secrets.compare_digest(o.token, token):
            return o
    return None


def _public_view(day: str, o: FestivalOnlineOrder) -> PublicFestivalOrder:
    return PublicFestivalOrder(
        token=o.token,
        code=o.code,
        name=o.name,
        lines=o.lines,
        total=o.total,
        status=o.status,
        created_at=o.created_at,
        hold_until=o.hold_until,
        paid_at=o.paid_at,
        redeemed_at=o.redeemed_at,
        pix_code=o.pix_code if o.status == "aguardando" else "",
        pix_url=o.pix_url if o.status == "aguardando" else "",
        test_mode=o.test_mode,
        date=day,
    )


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone)


def create_online_order(
    db: Session, *, slug: str, payload: FestivalOrderCreate, client_key: str
) -> PublicFestivalOrder:
    org, org_id = _org_for_slug(db, slug)
    mp = _mp_settings(db, org_id)
    if not mp.get("access_token"):
        raise FestivalOrderError("A venda pelo celular não está ligada.")
    _check_rate(f"{slug}:{client_key}")
    day = today_brt()
    phone = _digits(payload.phone)
    if len(phone) < 10:
        raise FestivalOrderError("Confira o número do WhatsApp.")
    name = " ".join(payload.name.split())
    order_id = secrets.token_hex(12)
    token = day.replace("-", "") + secrets.token_urlsafe(24)
    prefix = (re.sub(r"[^A-Za-z]", "", org.name or "W")[:1] or "W").upper()
    test_mode = bool(mp.get("test_mode", True))
    created: dict = {}

    def change(state: FestivalLiveState) -> None:
        if not (state.online_enabled and state.status == "aberto"):
            raise FestivalOrderError("A venda pelo celular está fechada agora.")
        now = datetime.now(UTC)
        moment = now.isoformat()
        for o in state.orders:
            if o.phone == phone and o.status == "aguardando" and o.hold_until > moment:
                raise FestivalOrderError(
                    "Você já tem um pedido esperando o Pix. Pague ou cancele ele primeiro."
                )
        items = {i.id: i for i in state.items}
        wanted: dict[str, int] = {}
        for line in payload.lines:
            if line.item_id not in items:
                raise InsufficientStockError("Um dos sabores não está mais no cardápio.")
            wanted[line.item_id] = wanted.get(line.item_id, 0) + line.qty
        slices = sum(q for i, q in wanted.items() if items[i].kind == "fatia")
        if slices > state.max_per_order:
            raise FestivalOrderError(f"Máximo de {state.max_per_order} fatias por pedido.")
        held = _held(state, now)
        for item_id, qty in wanted.items():
            left = _online_left(state, items[item_id], held)
            if qty > left:
                flavor = items[item_id].flavor
                raise InsufficientStockError(
                    f"{flavor} esgotou para o celular."
                    if left == 0
                    else f"Pelo celular só {'resta' if left == 1 else 'restam'} {left} de {flavor}."
                )
        lines = [
            FestivalSaleLine(item_id=i, flavor=items[i].flavor, qty=q, price=items[i].price)
            for i, q in wanted.items()
        ]
        total = round(sum(line.qty * line.price for line in lines), 2)
        if total <= 0:
            raise FestivalOrderError("Esses sabores estão sem preço. Peça no balcão.")
        state.order_seq += 1
        order = FestivalOnlineOrder(
            id=order_id,
            token=token,
            code=f"{prefix}-{state.order_seq}",
            name=name,
            phone=phone,
            lines=lines,
            total=total,
            created_at=moment,
            hold_until=(now + timedelta(minutes=HOLD_MINUTES)).isoformat(),
            test_mode=test_mode,
        )
        state.orders.append(order)
        created["order"] = order

    _mutate(db, org_id, day, change)
    order: FestivalOnlineOrder = created["order"]

    try:
        charge = mercadopago.create_pix(
            mp["access_token"],
            reference=order.id,
            amount=order.total,
            payer_email=f"pedido.{order.id[:10]}@{slug}.pages.dev",
            payer_name=name,
            description=f"{org.name} - Festival de Fatias {order.code}",
            idempotency_key=order.id,
            test_mode=test_mode,
        )
    except PaymentProviderError:
        _mutate(db, org_id, day, lambda st: _set_status(st, order.id, "cancelado"))
        raise

    def attach(state: FestivalLiveState) -> None:
        for o in state.orders:
            if o.id == order.id:
                o.mp_order_id = charge.id
                o.pix_code = charge.pix_code
                o.pix_url = charge.pix_url
                created["order"] = o

    _mutate(db, org_id, day, attach)
    return _public_view(day, created["order"])


def _set_status(state: FestivalLiveState, order_id: str, status: str) -> None:
    for o in state.orders:
        if o.id == order_id and o.status == "aguardando":
            o.status = status


def _apply_paid(state: FestivalLiveState, order: FestivalOnlineOrder) -> None:
    """Pix confirmado: as fatias seguradas viram vendidas. Se a reserva já tinha
    vencido e o estoque acabou nesse meio tempo, marca para devolver o Pix."""
    items = {i.id: i for i in state.items}
    now = datetime.now(UTC)
    if order.status == "expirado" or order.hold_until <= now.isoformat():
        held = _held(state, now)
        ok = all(
            line.item_id in items and _counter_left(items[line.item_id], held) >= line.qty
            for line in order.lines
        )
        if not ok:
            order.status = "pago_sem_estoque"
            order.paid_at = now.isoformat()
            return
    for line in order.lines:
        item = items.get(line.item_id)
        if item is not None:
            item.sold += line.qty
            item.sold_online += line.qty
    order.status = "pago"
    order.paid_at = now.isoformat()


def _sync_order(db: Session, org_id: UUID, day: str, order: FestivalOnlineOrder, *, force=False):
    """Pergunta ao Mercado Pago se o Pix caiu. Devolve o pedido atualizado."""
    if order.status not in ("aguardando", "expirado") or not order.mp_order_id:
        return order
    key = f"{org_id}:{order.id}"
    if not force and time.monotonic() - _last_sync.get(key, 0) < _SYNC_EVERY_SECONDS:
        return order
    _last_sync[key] = time.monotonic()
    mp = _mp_settings(db, org_id)
    if not mp.get("access_token"):
        return order
    try:
        remote = mercadopago.get_order(mp["access_token"], order.mp_order_id)
    except PaymentProviderError:
        return order
    if remote.external_reference and remote.external_reference != order.id:
        return order
    result: dict = {"order": order}

    def change(state: FestivalLiveState) -> None:
        for o in state.orders:
            if o.id != order.id:
                continue
            if remote.paid and abs(remote.total_amount - o.total) < 0.01:
                if o.status in ("aguardando", "expirado"):
                    _apply_paid(state, o)
            elif remote.dead and o.status == "aguardando":
                o.status = "expirado"
            result["order"] = o

    _mutate(db, org_id, day, change)
    return result["order"]


def get_public_order(db: Session, *, slug: str, token: str) -> PublicFestivalOrder:
    _org, org_id = _org_for_slug(db, slug)
    day = _day_from_token(token)
    state = _parse(day, FestivalLiveRepository(db).get(org_id, day))
    order = _find_by_token(state, token) if state else None
    if order is None:
        raise FestivalOrderError("Pedido não encontrado.")
    order = _sync_order(db, org_id, day, order)
    return _public_view(day, order)


def cancel_public_order(db: Session, *, slug: str, token: str) -> PublicFestivalOrder:
    _org, org_id = _org_for_slug(db, slug)
    day = _day_from_token(token)
    state = _parse(day, FestivalLiveRepository(db).get(org_id, day))
    order = _find_by_token(state, token) if state else None
    if order is None:
        raise FestivalOrderError("Pedido não encontrado.")
    order = _sync_order(db, org_id, day, order, force=True)
    if order.status != "aguardando":
        return _public_view(day, order)
    _mutate(db, org_id, day, lambda st: _set_status(st, order.id, "cancelado"))
    mp = _mp_settings(db, org_id)
    if order.mp_order_id and mp.get("access_token"):
        mercadopago.cancel_order(mp["access_token"], order.mp_order_id)
    order.status = "cancelado"
    return _public_view(day, order)


def sync_pending(db: Session, *, organization_id: UUID, day: str) -> None:
    """Chamado pelo painel: confere no Mercado Pago os Pix ainda em aberto."""
    _check_day(day)
    state = _parse(day, FestivalLiveRepository(db).get(organization_id, day))
    if state is None:
        return
    limit = (datetime.now(UTC) - timedelta(minutes=45)).isoformat()
    for o in state.orders:
        if o.status in ("aguardando", "expirado") and o.mp_order_id and o.created_at > limit:
            _sync_order(db, organization_id, day, o)


def redeem(db: Session, *, organization_id: UUID, day: str, code: str) -> FestivalRedeemResult:
    """Leitura do ticket no balcão: entrega uma vez só."""
    _check_day(day)
    raw = code.strip()
    state = get_state(db, organization_id=organization_id, day=day)
    order = _find_by_token(state, raw) if len(raw) >= 20 else None
    if order is None and len(raw) >= 20 and raw[:8].isdigit() and _day_from_token(raw) != day:
        return FestivalRedeemResult(
            result="nao_encontrado", message="Esse ticket é de outro dia de festival."
        )
    if order is None:
        digits = re.sub(r"\D", "", raw)
        order = next(
            (o for o in state.orders if digits and o.code.split("-")[-1] == digits), None
        )
    if order is None:
        return FestivalRedeemResult(result="nao_encontrado", message="Ticket não encontrado.")
    order = _sync_order(db, organization_id, day, order, force=True)
    outcome: dict = {}

    def change(st: FestivalLiveState) -> None:
        o = next(x for x in st.orders if x.id == order.id)
        outcome["order"] = o
        if o.status == "pago":
            o.status = "retirado"
            o.redeemed_at = _now_iso()
            outcome["result"] = "entregar"
        elif o.status == "retirado":
            outcome["result"] = "ja_retirado"
        elif o.status == "pago_sem_estoque":
            outcome["result"] = "sem_estoque"
        else:
            outcome["result"] = "nao_pago"

    new_state = _mutate(db, organization_id, day, change)
    o: FestivalOnlineOrder = outcome["order"]
    result = outcome["result"]
    messages = {
        "entregar": f"PAGO — entregar para {o.name}",
        "ja_retirado": f"JÁ RETIRADO às {_hhmm(o.redeemed_at)}",
        "sem_estoque": "Pago, mas a fatia acabou antes da confirmação: devolva o Pix.",
        "nao_pago": "Ainda não pago — não entregar.",
    }
    return FestivalRedeemResult(result=result, message=messages[result], order=o, state=new_state)


def _hhmm(iso: str | None) -> str:
    if not iso:
        return "—"
    return datetime.fromisoformat(iso).astimezone(_BRT).strftime("%H:%M")
