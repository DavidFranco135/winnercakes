from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from src.application.festival import use_cases
from src.domain.auth.roles import Role
from src.domain.shared.exceptions import DomainError
from src.interfaces.http.dependencies import get_db, require_org_role
from src.interfaces.http.errors import as_http_exception
from src.interfaces.http.v1.schemas import (
    FestivalLiveConfig,
    FestivalLiveState,
    FestivalOrderCreate,
    FestivalRedeemRequest,
    FestivalRedeemResult,
    FestivalSaleCreate,
    MercadoPagoSettingsIn,
    MercadoPagoSettingsOut,
    PublicFestivalLiveResponse,
    PublicFestivalOrder,
)

router = APIRouter(
    prefix="/organizations/{organization_id}/festival-live", tags=["festival"]
)
public_router = APIRouter(prefix="/public", tags=["public"])


def _run(fn, response: Response | None = None):
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
    try:
        return fn()
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get(
    "/{day}",
    response_model=FestivalLiveState,
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def get_festival(
    organization_id: UUID, day: str, response: Response, db: Session = Depends(get_db)
) -> FestivalLiveState:
    def run():
        # Confere no Mercado Pago os Pix ainda abertos (o painel atualiza a cada 10 s).
        try:
            use_cases.sync_pending(db, organization_id=organization_id, day=day)
        except DomainError:
            pass
        return use_cases.get_state(db, organization_id=organization_id, day=day)

    return _run(run, response)


@router.put(
    "/{day}",
    response_model=FestivalLiveState,
    dependencies=[Depends(require_org_role(Role.MANAGER))],
)
def save_festival(
    organization_id: UUID, day: str, payload: FestivalLiveConfig, db: Session = Depends(get_db)
) -> FestivalLiveState:
    return _run(
        lambda: use_cases.save_config(db, organization_id=organization_id, day=day, config=payload)
    )


@router.post(
    "/{day}/sales",
    response_model=FestivalLiveState,
    dependencies=[Depends(require_org_role(Role.OPERATOR))],
)
def create_festival_sale(
    organization_id: UUID, day: str, payload: FestivalSaleCreate, db: Session = Depends(get_db)
) -> FestivalLiveState:
    return _run(
        lambda: use_cases.create_sale(db, organization_id=organization_id, day=day, payload=payload)
    )


@router.post(
    "/{day}/sales/{sale_id}/cancel",
    response_model=FestivalLiveState,
    dependencies=[Depends(require_org_role(Role.OPERATOR))],
)
def cancel_festival_sale(
    organization_id: UUID, day: str, sale_id: str, db: Session = Depends(get_db)
) -> FestivalLiveState:
    return _run(
        lambda: use_cases.cancel_sale(db, organization_id=organization_id, day=day, sale_id=sale_id)
    )


@router.post(
    "/{day}/redeem",
    response_model=FestivalRedeemResult,
    dependencies=[Depends(require_org_role(Role.OPERATOR))],
)
def redeem_festival_ticket(
    organization_id: UUID, day: str, payload: FestivalRedeemRequest, db: Session = Depends(get_db)
) -> FestivalRedeemResult:
    return _run(
        lambda: use_cases.redeem(db, organization_id=organization_id, day=day, code=payload.code)
    )


payments_router = APIRouter(
    prefix="/organizations/{organization_id}/payments", tags=["festival"]
)


@payments_router.get(
    "/mercadopago",
    response_model=MercadoPagoSettingsOut,
    dependencies=[Depends(require_org_role(Role.MANAGER))],
)
def get_mercadopago(organization_id: UUID, db: Session = Depends(get_db)) -> MercadoPagoSettingsOut:
    return _run(lambda: use_cases.get_mp_settings(db, organization_id=organization_id))


@payments_router.put(
    "/mercadopago",
    response_model=MercadoPagoSettingsOut,
    dependencies=[Depends(require_org_role(Role.ADMIN))],
)
def save_mercadopago(
    organization_id: UUID, payload: MercadoPagoSettingsIn, db: Session = Depends(get_db)
) -> MercadoPagoSettingsOut:
    return _run(
        lambda: use_cases.save_mp_settings(db, organization_id=organization_id, payload=payload)
    )


@public_router.post("/stores/{slug}/festival-orders", response_model=PublicFestivalOrder)
def create_public_order(
    slug: str, payload: FestivalOrderCreate, request: Request, db: Session = Depends(get_db)
) -> PublicFestivalOrder:
    forwarded = request.headers.get("x-forwarded-for", "")
    client = forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")
    return _run(
        lambda: use_cases.create_online_order(
            db, slug=slug, payload=payload, client_key=client
        )
    )


@public_router.get("/stores/{slug}/festival-orders/{token}", response_model=PublicFestivalOrder)
def get_public_order(
    slug: str, token: str, response: Response, db: Session = Depends(get_db)
) -> PublicFestivalOrder:
    return _run(lambda: use_cases.get_public_order(db, slug=slug, token=token), response)


@public_router.post(
    "/stores/{slug}/festival-orders/{token}/cancel", response_model=PublicFestivalOrder
)
def cancel_public_order(
    slug: str, token: str, db: Session = Depends(get_db)
) -> PublicFestivalOrder:
    return _run(lambda: use_cases.cancel_public_order(db, slug=slug, token=token))


@public_router.get("/stores/{slug}/festival-live", response_model=PublicFestivalLiveResponse)
def get_public_festival(
    slug: str, response: Response, db: Session = Depends(get_db)
) -> PublicFestivalLiveResponse:
    result = _run(lambda: use_cases.get_public_live(db, slug=slug))
    response.headers["Cache-Control"] = "public, max-age=5"
    return result
