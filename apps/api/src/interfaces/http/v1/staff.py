from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.application.staff import use_cases
from src.domain.auth.roles import Role
from src.domain.shared.exceptions import DomainError
from src.infrastructure.db.models import OrgMember
from src.interfaces.http.dependencies import get_db, require_org_role
from src.interfaces.http.errors import as_http_exception
from src.interfaces.http.v1.schemas import StaffCreate, StaffPassword, StaffResponse

router = APIRouter(prefix="/organizations/{organization_id}/staff", tags=["staff"])


@router.get(
    "",
    response_model=list[StaffResponse],
    dependencies=[Depends(require_org_role(Role.ADMIN))],
)
def list_staff(organization_id: UUID, db: Session = Depends(get_db)) -> list[StaffResponse]:
    return [StaffResponse(**s) for s in use_cases.list_staff(db, organization_id=organization_id)]


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
def create_staff(
    organization_id: UUID,
    payload: StaffCreate,
    db: Session = Depends(get_db),
    acting: OrgMember = Depends(require_org_role(Role.ADMIN)),
) -> StaffResponse:
    try:
        return StaffResponse(
            **use_cases.create_staff(
                db,
                organization_id=organization_id,
                full_name=payload.full_name.strip(),
                email=str(payload.email),
                password=payload.password,
                invited_by=acting.user_id,
            )
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc


@router.post(
    "/{user_id}/password",
    response_model=StaffResponse,
    dependencies=[Depends(require_org_role(Role.ADMIN))],
)
def reset_password(
    organization_id: UUID, user_id: UUID, payload: StaffPassword, db: Session = Depends(get_db)
) -> StaffResponse:
    try:
        return StaffResponse(
            **use_cases.reset_staff_password(
                db, organization_id=organization_id, user_id=user_id, password=payload.password
            )
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_role(Role.ADMIN))],
)
def remove_staff(organization_id: UUID, user_id: UUID, db: Session = Depends(get_db)) -> None:
    try:
        use_cases.remove_staff(db, organization_id=organization_id, user_id=user_id)
    except DomainError as exc:
        raise as_http_exception(exc) from exc
