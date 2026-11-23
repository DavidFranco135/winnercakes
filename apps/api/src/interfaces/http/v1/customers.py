from uuid import UUID

import time
from collections import deque

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from src.application.customers import use_cases as customer_use_cases
from src.domain.auth.roles import Role
from src.domain.shared.exceptions import DomainError
from src.interfaces.http.dependencies import get_db, require_org_role
from src.interfaces.http.errors import as_http_exception
from src.interfaces.http.v1.schemas import (
    CreateCustomerRequest,
    CustomerBirthday,
    CustomerHistoryResponse,
    CustomerResponse,
    OrderResponse,
    PublicSignupRequest,
    ProjectResponse,
    QuoteResponse,
    UpdateCustomerRequest,
)

router = APIRouter(prefix="/organizations/{organization_id}/customers", tags=["customers"])
public_router = APIRouter(prefix="/public", tags=["public"])

# Limite simples por IP para o cadastro público (por instância).
_SIGNUP_WINDOW_SECONDS = 3600
_SIGNUP_MAX_PER_WINDOW = 12
_signups: dict[str, deque[float]] = {}


def _too_many(ip: str) -> bool:
    now = time.monotonic()
    hits = _signups.setdefault(ip, deque())
    while hits and now - hits[0] > _SIGNUP_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= _SIGNUP_MAX_PER_WINDOW:
        return True
    hits.append(now)
    if len(_signups) > 5000:
        _signups.clear()
    return False


@public_router.post("/stores/{slug}/customers", status_code=status.HTTP_204_NO_CONTENT)
def public_signup(
    slug: str, payload: PublicSignupRequest, request: Request, db: Session = Depends(get_db)
) -> Response:
    """Cadastro do cliente pelo site. Sempre responde 204 (não revela se o
    telefone já estava cadastrado)."""
    if payload.website:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")
    if _too_many(ip):
        return Response(status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    try:
        customer_use_cases.public_signup(
            db,
            slug=slug,
            name=payload.name,
            phone=payload.phone,
            birth_date=payload.birth_date or None,
            neighborhood=payload.neighborhood or None,
            email=payload.email,
            source=payload.source,
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_role(Role.OPERATOR))],
)
def create_customer(
    organization_id: UUID, payload: CreateCustomerRequest, db: Session = Depends(get_db)
) -> CustomerResponse:
    customer = customer_use_cases.create_customer(
        db,
        organization_id=organization_id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        document=payload.document,
        address=payload.address,
        notes=payload.notes,
        birth_date=payload.birth_date,
    )
    return CustomerResponse.model_validate(customer)


@router.get(
    "",
    response_model=list[CustomerResponse],
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def list_customers(organization_id: UUID, db: Session = Depends(get_db)) -> list[CustomerResponse]:
    customers = customer_use_cases.list_customers(db, organization_id=organization_id)
    return [CustomerResponse.model_validate(c) for c in customers]


@router.get(
    "/birthdays",
    response_model=list[CustomerBirthday],
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def list_birthdays(
    organization_id: UUID, days: int = 30, db: Session = Depends(get_db)
) -> list[CustomerBirthday]:
    rows = customer_use_cases.upcoming_birthdays(
        db, organization_id=organization_id, days=max(0, min(days, 366))
    )
    return [CustomerBirthday(**r) for r in rows]


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def get_customer(
    organization_id: UUID, customer_id: UUID, db: Session = Depends(get_db)
) -> CustomerResponse:
    try:
        customer = customer_use_cases.get_customer(
            db, organization_id=organization_id, customer_id=customer_id
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    return CustomerResponse.model_validate(customer)


@router.patch(
    "/{customer_id}",
    response_model=CustomerResponse,
    dependencies=[Depends(require_org_role(Role.OPERATOR))],
)
def update_customer(
    organization_id: UUID,
    customer_id: UUID,
    payload: UpdateCustomerRequest,
    db: Session = Depends(get_db),
) -> CustomerResponse:
    try:
        customer = customer_use_cases.update_customer(
            db,
            organization_id=organization_id,
            customer_id=customer_id,
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            document=payload.document,
            address=payload.address,
            notes=payload.notes,
            birth_date=payload.birth_date,
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    return CustomerResponse.model_validate(customer)


@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_role(Role.MANAGER))],
)
def delete_customer(
    organization_id: UUID, customer_id: UUID, db: Session = Depends(get_db)
) -> None:
    try:
        customer_use_cases.delete_customer(
            db, organization_id=organization_id, customer_id=customer_id
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc


@router.get(
    "/{customer_id}/history",
    response_model=CustomerHistoryResponse,
    dependencies=[Depends(require_org_role(Role.VIEWER))],
)
def get_customer_history(
    organization_id: UUID, customer_id: UUID, db: Session = Depends(get_db)
) -> CustomerHistoryResponse:
    try:
        history = customer_use_cases.get_customer_history(
            db, organization_id=organization_id, customer_id=customer_id
        )
    except DomainError as exc:
        raise as_http_exception(exc) from exc
    return CustomerHistoryResponse(
        quotes=[QuoteResponse.model_validate(q) for q in history["quotes"]],
        projects=[ProjectResponse.model_validate(p) for p in history["projects"]],
        orders=[OrderResponse.model_validate(o) for o in history["orders"]],
    )
