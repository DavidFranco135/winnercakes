from enum import StrEnum


class Role(StrEnum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"
    # Funcionário do caixa: só o PDV do festival (vender, retirada, resumo).
    CAIXA = "CAIXA"


_ROLE_RANK: dict[Role, int] = {
    Role.CAIXA: 0,  # abaixo de VIEWER: não enxerga o resto do sistema
    Role.VIEWER: 1,
    Role.OPERATOR: 2,
    Role.MANAGER: 3,
    Role.ADMIN: 4,
    Role.OWNER: 5,
}


def role_at_least(role: Role, minimum: Role) -> bool:
    return _ROLE_RANK[role] >= _ROLE_RANK[minimum]
