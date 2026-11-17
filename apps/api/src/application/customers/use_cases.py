from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from src.domain.shared.exceptions import CustomerNotFoundError
from src.infrastructure.db.models import Customer
from src.infrastructure.repositories import (
    CustomerRepository,
    OrderRepository,
    ProjectRepository,
    QuoteRepository,
)


def create_customer(
    db: Session,
    *,
    organization_id: UUID,
    name: str,
    email: str | None,
    phone: str | None,
    document: str | None,
    address: dict | None,
    notes: str | None,
    birth_date: str | None = None,
) -> Customer:
    customer = CustomerRepository(db).create(
        organization_id=organization_id,
        name=name,
        email=email,
        phone=phone,
        document=document,
        address=address,
        notes=notes,
    )
    if birth_date:
        customer.birth_date = _valid_birth(birth_date)
    db.commit()
    return customer


def list_customers(db: Session, *, organization_id: UUID) -> list[Customer]:
    return CustomerRepository(db).list_for_org(organization_id)


def get_customer(db: Session, *, organization_id: UUID, customer_id: UUID) -> Customer:
    customer = CustomerRepository(db).get(organization_id, customer_id)
    if customer is None:
        raise CustomerNotFoundError(str(customer_id))
    return customer


def update_customer(
    db: Session,
    *,
    organization_id: UUID,
    customer_id: UUID,
    name: str | None,
    email: str | None,
    phone: str | None,
    document: str | None,
    address: dict | None,
    notes: str | None,
    birth_date: str | None = None,
) -> Customer:
    customer = get_customer(db, organization_id=organization_id, customer_id=customer_id)
    if name is not None:
        customer.name = name
    if email is not None:
        customer.email = email
    if phone is not None:
        customer.phone = phone
    if document is not None:
        customer.document = document
    if address is not None:
        customer.address = address
    if notes is not None:
        customer.notes = notes
    if birth_date is not None:
        customer.birth_date = _valid_birth(birth_date) if birth_date else None
    db.commit()
    return customer


def delete_customer(db: Session, *, organization_id: UUID, customer_id: UUID) -> None:
    customer = get_customer(db, organization_id=organization_id, customer_id=customer_id)
    CustomerRepository(db).soft_delete(customer)
    db.commit()


def get_customer_history(db: Session, *, organization_id: UUID, customer_id: UUID) -> dict:
    """Passou a incluir `orders` na Fase 14 — antes disso (Fase 13) só havia

    orçamentos e projetos vinculados.
    """
    get_customer(db, organization_id=organization_id, customer_id=customer_id)
    return {
        "quotes": QuoteRepository(db).list_for_customer(organization_id, customer_id),
        "projects": ProjectRepository(db).list_for_customer(organization_id, customer_id),
        "orders": OrderRepository(db).list_for_customer(organization_id, customer_id),
    }


def _valid_birth(value: str) -> str:
    try:
        d = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Data de nascimento inválida.") from exc
    if d > date.today() or d.year < 1900:
        raise ValueError("Data de nascimento inválida.")
    return d.isoformat()


def _next_birthday(born: date, today: date) -> date:
    for year in (today.year, today.year + 1):
        try:
            candidate = date(year, born.month, born.day)
        except ValueError:  # 29/02 em ano não bissexto → 28/02
            candidate = date(year, 2, 28)
        if candidate >= today:
            return candidate
    return date(today.year + 1, born.month, min(born.day, 28))


def upcoming_birthdays(db: Session, *, organization_id: UUID, days: int = 30) -> list[dict]:
    """Clientes que fazem aniversário de hoje até `days` dias à frente."""
    today = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    result = []
    for c in CustomerRepository(db).list_for_org(organization_id):
        if not c.birth_date:
            continue
        try:
            born = date.fromisoformat(c.birth_date)
        except ValueError:
            continue
        nxt = _next_birthday(born, today)
        until = (nxt - today).days
        if until > days:
            continue
        result.append(
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "birth_date": c.birth_date,
                "next_date": nxt.isoformat(),
                "days_until": until,
                "turning": nxt.year - born.year if born.year > 1900 else None,
            }
        )
    result.sort(key=lambda r: (r["days_until"], r["name"].lower()))
    return result
