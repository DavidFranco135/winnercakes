from fastapi.testclient import TestClient

from tests.api.conftest import auth_headers, register_user


def _org_id(client: TestClient, headers: dict) -> str:
    return client.get("/api/v1/organizations", headers=headers).json()[0]["id"]


def _create_customer(client: TestClient, org_id: str, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Carlos Souza",
        "email": "carlos@example.com",
        "phone": "+55 11 99999-0000",
        "document": "123.456.789-00",
        "notes": "Cliente recorrente",
    }
    payload.update(overrides)
    response = client.post(
        f"/api/v1/organizations/{org_id}/customers", json=payload, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_list_and_get_customer(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)

    customer = _create_customer(client, org_id, headers)

    response = client.get(f"/api/v1/organizations/{org_id}/customers", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get(
        f"/api/v1/organizations/{org_id}/customers/{customer['id']}", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Carlos Souza"


def test_update_customer(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)
    customer = _create_customer(client, org_id, headers)

    response = client.patch(
        f"/api/v1/organizations/{org_id}/customers/{customer['id']}",
        json={"phone": "+55 11 98888-1111"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["phone"] == "+55 11 98888-1111"
    assert response.json()["name"] == "Carlos Souza"


def test_soft_deleted_customer_disappears_from_list_and_get(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)
    customer = _create_customer(client, org_id, headers)

    response = client.delete(
        f"/api/v1/organizations/{org_id}/customers/{customer['id']}", headers=headers
    )
    assert response.status_code == 204

    assert client.get(f"/api/v1/organizations/{org_id}/customers", headers=headers).json() == []
    response = client.get(
        f"/api/v1/organizations/{org_id}/customers/{customer['id']}", headers=headers
    )
    assert response.status_code == 404


def test_project_can_be_linked_to_a_customer(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)
    customer = _create_customer(client, org_id, headers)

    response = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        json={"name": "Chaveiro Carlos", "customer_id": customer["id"]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["customer_id"] == customer["id"]


def test_rejects_project_with_unknown_customer(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)

    response = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        json={"name": "Sem cliente", "customer_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert response.status_code == 404


def test_customer_history_lists_linked_projects_and_quotes(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)
    customer = _create_customer(client, org_id, headers)

    project = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        json={"name": "Chaveiro Carlos", "customer_id": customer["id"]},
        headers=headers,
    ).json()

    profile = client.post(
        f"/api/v1/organizations/{org_id}/cost-profiles",
        json={
            "name": "Padrão",
            "energy_cost_per_kwh": 0.9,
            "labor_cost_per_hour": 20.0,
            "packaging_cost_flat": 3.0,
            "waste_percentage": 5.0,
            "fees_percentage": 3.0,
            "profit_margin_percentage": 40.0,
            "is_default": True,
        },
        headers=headers,
    ).json()
    quote = client.post(
        f"/api/v1/organizations/{org_id}/quotes",
        json={
            "cost_profile_id": profile["id"],
            "customer_id": customer["id"],
            "material_cost": 10.0,
            "print_time_hours": 1.0,
            "machine_cost_per_hour": 1.0,
            "energy_kwh": 0.1,
            "labor_hours": 0.2,
        },
        headers=headers,
    ).json()

    response = client.get(
        f"/api/v1/organizations/{org_id}/customers/{customer['id']}/history", headers=headers
    )
    assert response.status_code == 200
    history = response.json()
    assert [p["id"] for p in history["projects"]] == [project["id"]]
    assert [q["id"] for q in history["quotes"]] == [quote["id"]]


def test_rejects_quote_with_unknown_customer(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, headers)
    profile = client.post(
        f"/api/v1/organizations/{org_id}/cost-profiles",
        json={
            "name": "Padrão",
            "energy_cost_per_kwh": 0.9,
            "labor_cost_per_hour": 20.0,
            "packaging_cost_flat": 3.0,
            "waste_percentage": 5.0,
            "fees_percentage": 3.0,
            "profit_margin_percentage": 40.0,
            "is_default": True,
        },
        headers=headers,
    ).json()

    response = client.post(
        f"/api/v1/organizations/{org_id}/quotes",
        json={
            "cost_profile_id": profile["id"],
            "customer_id": "00000000-0000-0000-0000-000000000000",
            "material_cost": 10.0,
            "print_time_hours": 1.0,
            "machine_cost_per_hour": 1.0,
            "energy_kwh": 0.1,
            "labor_hours": 0.2,
        },
        headers=headers,
    )
    assert response.status_code == 404


def test_viewer_cannot_create_customer(client: TestClient):
    owner = register_user(client, organization_name="Acme Prints", email="owner@acme.io")
    owner_headers = auth_headers(owner["access_token"])
    org_id = _org_id(client, owner_headers)

    viewer = register_user(client, organization_name="Solo Org", email="viewer@acme.io")
    client.post(
        f"/api/v1/organizations/{org_id}/members",
        json={"email": "viewer@acme.io", "role": "VIEWER"},
        headers=owner_headers,
    )

    response = client.post(
        f"/api/v1/organizations/{org_id}/customers",
        json={"name": "Not allowed"},
        headers=auth_headers(viewer["access_token"]),
    )
    assert response.status_code == 403


def test_birthdays_upcoming(client, monkeypatch):
    from datetime import date

    from src.application.customers import use_cases as cu

    owner = register_user(client, organization_name="Doces", email="aniver@doces.io")
    headers = auth_headers(owner["access_token"])
    org = client.get("/api/v1/organizations", headers=headers).json()[0]["id"]
    base = f"/api/v1/organizations/{org}/customers"

    class FakeDT:
        @staticmethod
        def now(tz=None):
            from datetime import datetime

            return datetime(2026, 11, 17, 12, 0)

    monkeypatch.setattr(cu, "datetime", FakeDT)
    r = client.post(base, json={"name": "Ana", "phone": "21999", "birth_date": "1990-11-17"}, headers=headers)
    assert r.status_code == 201 and r.json()["birth_date"] == "1990-11-17"
    client.post(base, json={"name": "Bia", "birth_date": "2000-11-30"}, headers=headers)
    client.post(base, json={"name": "Caio", "birth_date": "1985-03-01"}, headers=headers)
    client.post(base, json={"name": "Sem data"}, headers=headers)
    assert client.post(base, json={"name": "X", "birth_date": "2026-13-40"}, headers=headers).status_code == 422

    rows = client.get(f"{base}/birthdays?days=30", headers=headers).json()
    assert [(r["name"], r["days_until"], r["turning"]) for r in rows] == [("Ana", 0, 36), ("Bia", 13, 26)]
    assert date.fromisoformat(rows[1]["next_date"]) == date(2026, 11, 30)

    cid = rows[0]["id"]
    r = client.patch(f"{base}/{cid}", json={"birth_date": ""}, headers=headers)
    assert r.json()["birth_date"] is None


def test_public_signup_creates_and_completes_customer(client: TestClient):
    owner = register_user(client, organization_name="Doce Teste", email="dona@doce.io")
    headers = auth_headers(owner["access_token"])
    org = client.get("/api/v1/organizations", headers=headers).json()[0]
    org_id, slug = org["id"], org["slug"]
    url = f"/api/v1/public/stores/{slug}/customers"

    r = client.post(url, json={"name": "Ana Lima", "phone": "(21) 99876-5432", "neighborhood": "Mutondo", "birth_date": "1990-05-04"})
    assert r.status_code == 204, r.text
    # Mesmo telefone (com 55 na frente): não duplica, só completa o aniversário.
    r = client.post(url, json={"name": "Outra", "phone": "5521998765432", "birth_date": "1991-06-07", "email": "ana@x.io", "source": "pedido"})
    assert r.status_code == 204, r.text
    # Sem aniversário não cadastra.
    assert client.post(url, json={"name": "Sem Data", "phone": "21933334444"}).status_code == 422
    # Robô (campo escondido preenchido) é ignorado.
    assert client.post(url, json={"name": "Bot", "phone": "21911112222", "birth_date": "1990-01-01", "website": "x"}).status_code == 204
    # Telefone inválido.
    assert client.post(url, json={"name": "Zé", "phone": "123", "birth_date": "1990-01-01"}).status_code == 422

    customers = client.get(f"/api/v1/organizations/{org_id}/customers", headers=headers).json()
    assert len(customers) == 1
    c = customers[0]
    assert c["name"] == "Ana Lima"
    assert c["birth_date"] == "1990-05-04"  # a data que já existia não é trocada
    assert c["email"] == "ana@x.io"
    assert c["address"] == {"bairro": "Mutondo"}
    assert "link de cadastro" in c["notes"]

    assert client.post("/api/v1/public/stores/nao-existe/customers", json={"name": "Ana", "phone": "21998765432", "birth_date": "1990-01-01"}).status_code == 404
