from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from src.application.festival import use_cases
from src.domain.auth.roles import Role
from src.domain.shared.exceptions import DomainError
from src.interfaces.http.dependencies import get_db, require_org_role
from src.interfaces.http.errors import as_http_exception
from src.interfaces.http.v1.schemas import (
    FestivalLiveConfig,
    FestivalLiveState,
    FestivalSaleCreate,
    PublicFestivalLiveResponse,
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
    return _run(
        lambda: use_cases.get_state(db, organization_id=organization_id, day=day), response
    )


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


@public_router.get("/stores/{slug}/festival-live", response_model=PublicFestivalLiveResponse)
def get_public_festival(
    slug: str, response: Response, db: Session = Depends(get_db)
) -> PublicFestivalLiveResponse:
    result = _run(lambda: use_cases.get_public_live(db, slug=slug))
    response.headers["Cache-Control"] = "public, max-age=5"
    return result
