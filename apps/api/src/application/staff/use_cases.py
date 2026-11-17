"""Funcionários do caixa: contas que só acessam o PDV do festival.

A dona cria o login (e-mail + senha) de cada funcionário; o papel CAIXA não
passa em nenhuma rota do sistema além das do PDV.
"""
from uuid import UUID

from sqlalchemy.orm import Session

from src.domain.auth.roles import Role
from src.domain.shared.exceptions import (
    EmailAlreadyRegisteredError,
    OrganizationNotFoundError,
    UserNotFoundError,
)
from src.domain.shared.security import hash_password
from src.infrastructure.repositories import (
    OrganizationRepository,
    OrgMemberRepository,
    UserRepository,
)


def _view(db: Session, member) -> dict:
    user = UserRepository(db).get_by_id(member.user_id)
    return {
        "user_id": member.user_id,
        "email": user.email if user else "",
        "full_name": user.full_name if user else None,
        "active": bool(user and user.is_active),
        "created_at": member.created_at,
    }


def list_staff(db: Session, *, organization_id: UUID) -> list[dict]:
    members = OrgMemberRepository(db).list_for_org(organization_id)
    return [_view(db, m) for m in members if m.role == Role.CAIXA.value]


def create_staff(
    db: Session,
    *,
    organization_id: UUID,
    full_name: str,
    email: str,
    password: str,
    invited_by: UUID,
) -> dict:
    if OrganizationRepository(db).get_by_id(organization_id) is None:
        raise OrganizationNotFoundError(str(organization_id))
    email = email.strip().lower()
    users = UserRepository(db)
    members = OrgMemberRepository(db)
    user = users.get_by_email(email)
    if user is not None:
        # E-mail já usado: só reaproveita se a pessoa não tem outro papel aqui.
        existing = members.get(organization_id, user.id)
        if existing is not None:
            raise EmailAlreadyRegisteredError(email)
        if any_membership(db, user.id, exclude=organization_id):
            raise EmailAlreadyRegisteredError(email)
        user.password_hash = hash_password(password)
        user.full_name = full_name
        user.is_active = True
    else:
        user = users.create(email=email, password_hash=hash_password(password), full_name=full_name)
    member = members.create(
        organization_id=organization_id,
        user_id=user.id,
        role=Role.CAIXA.value,
        invited_by=invited_by,
    )
    db.commit()
    return _view(db, member)


def any_membership(db: Session, user_id: UUID, *, exclude: UUID) -> bool:
    orgs = OrganizationRepository(db).list_for_user(user_id)
    return any(str(o.id) != str(exclude) for o in orgs)


def _staff_member(db: Session, organization_id: UUID, user_id: UUID):
    member = OrgMemberRepository(db).get(organization_id, user_id)
    if member is None or member.role != Role.CAIXA.value:
        raise UserNotFoundError(str(user_id))
    return member


def reset_staff_password(
    db: Session, *, organization_id: UUID, user_id: UUID, password: str
) -> dict:
    member = _staff_member(db, organization_id, user_id)
    user = UserRepository(db).get_by_id(user_id)
    if user is None:
        raise UserNotFoundError(str(user_id))
    user.password_hash = hash_password(password)
    db.commit()
    return _view(db, member)


def remove_staff(db: Session, *, organization_id: UUID, user_id: UUID) -> None:
    member = _staff_member(db, organization_id, user_id)
    OrgMemberRepository(db).delete(member)
    user = UserRepository(db).get_by_id(user_id)
    if user is not None:
        user.is_active = False  # sem acesso a nada, nem para tentar entrar
    db.commit()
