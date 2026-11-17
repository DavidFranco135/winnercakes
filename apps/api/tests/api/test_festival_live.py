import uuid

import pytest
from fastapi.testclient import TestClient

from src.application.festival import use_cases as festival_use_cases
from tests.api.conftest import auth_headers, register_user


@pytest.fixture(autouse=True)
def _clear_cache():
    festival_use_cases._public_cache.clear()


def _setup(client: TestClient):
    owner = register_user(client, organization_name="Doces", email="dona@doces.io")
    headers = auth_headers(owner["access_token"])
    org = client.get("/api/v1/organizations", headers=headers).json()[0]
    return org["id"], org["slug"], headers


def _config(day_items=None, **kw):
    payload = {
        "public_enabled": True,
        "status": "aberto",
        "items": day_items
        or [
            {"id": "ninho", "flavor": "Ninho com morango", "price": 15, "slices_total": 3},
            {"id": "red", "flavor": "Red Velvet", "price": 14, "slices_total": 10},
        ],
    }
    payload.update(kw)
    return payload


def _sale(lines, method="dinheiro", sale_id=None):
    return {"id": sale_id or uuid.uuid4().hex, "lines": lines, "method": method}


def test_default_menu_uses_store_flavors(client: TestClient):
    org_id, _slug, headers = _setup(client)
    r = client.get(f"/api/v1/organizations/{org_id}/festival-live/2026-12-05", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date"] == "2026-12-05"
    assert len(body["items"]) > 0
    assert all(i["slices_total"] == 0 and i["sold"] == 0 for i in body["items"])
    assert body["sales"] == []


def test_sale_decrements_stock_and_is_idempotent(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    assert client.put(base, json=_config(), headers=headers).status_code == 200

    sale = _sale([{"item_id": "ninho", "qty": 2}, {"item_id": "red", "qty": 1}], sale_id="venda-000001")
    r = client.post(f"{base}/sales", json=sale, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    sold = {i["id"]: i["sold"] for i in body["items"]}
    assert sold == {"ninho": 2, "red": 1}
    assert body["sales"][0]["total"] == 44

    # Reenvio da mesma venda (internet caiu na resposta): não vende de novo.
    again = client.post(f"{base}/sales", json=sale, headers=headers).json()
    assert {i["id"]: i["sold"] for i in again["items"]} == {"ninho": 2, "red": 1}
    assert len(again["sales"]) == 1


def test_cannot_sell_more_than_remaining(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    client.put(base, json=_config(), headers=headers)
    r = client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 4}]), headers=headers)
    assert r.status_code == 409
    assert "restam 3" in r.json()["detail"]
    client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 3}]), headers=headers)
    r = client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 1}]), headers=headers)
    assert r.status_code == 409
    assert "esgotou" in r.json()["detail"]


def test_cancel_returns_slices(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    client.put(base, json=_config(), headers=headers)
    client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 3}], sale_id="venda-cancel1"), headers=headers)
    r = client.post(f"{base}/sales/venda-cancel1/cancel", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["items"][0]["sold"] == 0
    assert body["sales"][0]["canceled"] is True
    assert client.post(f"{base}/sales/nao-existe/cancel", headers=headers).status_code == 404


def test_config_keeps_sold_counts(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    client.put(base, json=_config(), headers=headers)
    client.post(f"{base}/sales", json=_sale([{"item_id": "red", "qty": 2}]), headers=headers)
    items = [
        {"id": "red", "flavor": "Red Velvet", "price": 14, "slices_total": 20},
        {"id": "pistache", "flavor": "Pistache", "price": 18, "slices_total": 8},
    ]
    body = client.put(base, json=_config(items), headers=headers).json()
    assert {i["id"]: (i["slices_total"], i["sold"]) for i in body["items"]} == {
        "red": (20, 2),
        "pistache": (8, 0),
    }


def test_public_live_menu_only_today_and_enabled(client: TestClient, monkeypatch):
    org_id, slug, headers = _setup(client)
    monkeypatch.setattr(festival_use_cases, "today_brt", lambda: "2026-12-05")
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"

    assert client.get(f"/api/v1/public/stores/{slug}/festival-live").json() == {"live": None}

    client.put(base, json=_config(public_enabled=False), headers=headers)
    festival_use_cases._public_cache.clear()
    assert client.get(f"/api/v1/public/stores/{slug}/festival-live").json() == {"live": None}

    client.put(base, json=_config(), headers=headers)
    client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 3}]), headers=headers)
    festival_use_cases._public_cache.clear()
    live = client.get(f"/api/v1/public/stores/{slug}/festival-live").json()["live"]
    assert live["status"] == "aberto"
    by = {i["flavor"]: i for i in live["items"]}
    assert by["Ninho com morango"]["sold_out"] is True
    assert by["Red Velvet"]["remaining"] == 10
    assert "sold" not in by["Red Velvet"]


def test_invalid_day(client: TestClient):
    org_id, _slug, headers = _setup(client)
    r = client.get(f"/api/v1/organizations/{org_id}/festival-live/amanha", headers=headers)
    assert r.status_code == 422


# --------------------------- venda pelo celular ---------------------------

class FakeMP:
    def __init__(self):
        self.created = []
        self.paid: set[str] = set()
        self.amounts: dict[str, float] = {}
        self.refs: dict[str, str] = {}

    def create_pix(self, token, *, reference, amount, idempotency_key, test_mode, **kw):
        from src.infrastructure.mercadopago import PixCharge

        mp_id = f"ORD{len(self.created) + 1}"
        self.created.append((token, reference, amount, test_mode))
        self.amounts[mp_id] = amount
        self.refs[mp_id] = reference
        return PixCharge(id=mp_id, pix_code="000201PIX", pix_url="https://mp/ticket", status="action_required")

    def get_order(self, token, order_id):
        from src.infrastructure.mercadopago import OrderStatus

        paid = order_id in self.paid
        return OrderStatus(
            status="processed" if paid else "action_required",
            status_detail="accredited" if paid else "waiting_transfer",
            total_amount=self.amounts[order_id],
            external_reference=self.refs[order_id],
        )

    def cancel_order(self, token, order_id):
        pass


@pytest.fixture()
def online(client: TestClient, monkeypatch):
    fake = FakeMP()
    from src.infrastructure import mercadopago

    monkeypatch.setattr(mercadopago, "create_pix", fake.create_pix)
    monkeypatch.setattr(mercadopago, "get_order", fake.get_order)
    monkeypatch.setattr(mercadopago, "cancel_order", fake.cancel_order)
    monkeypatch.setattr(festival_use_cases, "today_brt", lambda: "2026-12-05")
    monkeypatch.setattr(festival_use_cases, "_SYNC_EVERY_SECONDS", 0)
    festival_use_cases._rate.clear()
    org_id, slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    r = client.put(
        f"/api/v1/organizations/{org_id}/payments/mercadopago",
        json={"access_token": "APP_USR-teste-1234", "test_mode": True},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"configured": True, "test_mode": True, "token_hint": "…1234"}
    items = [
        {"id": "ninho", "flavor": "Ninho com morango", "price": 15, "slices_total": 10},
        {"id": "red", "flavor": "Red Velvet", "price": 14, "slices_total": 10},
    ]
    client.put(base, json=_config(items, online_enabled=True, counter_reserve_pct=30, max_per_order=6), headers=headers)
    return {"fake": fake, "org": org_id, "slug": slug, "headers": headers, "base": base}


def _order(client, slug, lines, phone="21999990000", name="Ana Paula"):
    return client.post(
        f"/api/v1/public/stores/{slug}/festival-orders",
        json={"name": name, "phone": phone, "lines": lines},
    )


def test_online_quota_and_hold(client: TestClient, online):
    slug = online["slug"]
    live = client.get(f"/api/v1/public/stores/{slug}/festival-live").json()["live"]
    assert live["online_enabled"] is True
    assert {i["id"]: i["online_available"] for i in live["items"]} == {"ninho": 7, "red": 7}

    r = _order(client, slug, [{"item_id": "ninho", "qty": 5}])
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "aguardando" and o["pix_code"] == "000201PIX" and o["code"].endswith("-1")
    assert online["fake"].created[0][3] is True  # modo teste

    # Segurado: o balcão já não vende essas 5.
    festival_use_cases._public_cache.clear()
    live = client.get(f"/api/v1/public/stores/{slug}/festival-live").json()["live"]
    by = {i["id"]: i for i in live["items"]}
    assert by["ninho"]["remaining"] == 5 and by["ninho"]["online_available"] == 2

    # Cota do celular (70%): só restam 2 para outro cliente.
    r = _order(client, slug, [{"item_id": "ninho", "qty": 3}], phone="21988887777")
    assert r.status_code == 409 and "restam 2" in r.json()["detail"]
    # Mesmo telefone com pedido aberto: recusa.
    r = _order(client, slug, [{"item_id": "red", "qty": 1}])
    assert r.status_code == 409
    # Máximo por pedido.
    r = _order(client, slug, [{"item_id": "red", "qty": 7}], phone="21977776666")
    assert r.status_code == 409


def test_paid_ticket_redeems_once(client: TestClient, online):
    slug, base, headers = online["slug"], online["base"], online["headers"]
    o = _order(client, slug, [{"item_id": "red", "qty": 2}]).json()
    token = o["token"]

    # Antes de pagar: o balcão não entrega.
    r = client.post(f"{base}/redeem", json={"code": token}, headers=headers).json()
    assert r["result"] == "nao_pago"

    online["fake"].paid.add("ORD1")
    view = client.get(f"/api/v1/public/stores/{slug}/festival-orders/{token}").json()
    assert view["status"] == "pago" and view["pix_code"] == ""

    r = client.post(f"{base}/redeem", json={"code": token}, headers=headers).json()
    assert r["result"] == "entregar" and r["order"]["name"] == "Ana Paula"
    state = r["state"]
    red = next(i for i in state["items"] if i["id"] == "red")
    assert red["sold"] == 2 and red["sold_online"] == 2

    # Segunda leitura (print do QR repassado): não entrega de novo.
    r = client.post(f"{base}/redeem", json={"code": token}, headers=headers).json()
    assert r["result"] == "ja_retirado"
    # Pelo código curto também.
    r = client.post(f"{base}/redeem", json={"code": o["code"]}, headers=headers).json()
    assert r["result"] == "ja_retirado"


def test_customer_cancel_releases_hold(client: TestClient, online):
    slug = online["slug"]
    o = _order(client, slug, [{"item_id": "ninho", "qty": 6}]).json()
    r = client.post(f"/api/v1/public/stores/{slug}/festival-orders/{o['token']}/cancel")
    assert r.json()["status"] == "cancelado"
    festival_use_cases._public_cache.clear()
    live = client.get(f"/api/v1/public/stores/{slug}/festival-live").json()["live"]
    assert next(i for i in live["items"] if i["id"] == "ninho")["online_available"] == 7


def test_unknown_token(client: TestClient, online):
    slug = online["slug"]
    r = client.get(f"/api/v1/public/stores/{slug}/festival-orders/20261205naoexiste12345678")
    assert r.status_code == 409


def test_mp_token_never_returned(client: TestClient, online):
    r = client.get(f"/api/v1/organizations/{online['org']}/payments/mercadopago", headers=online["headers"])
    assert "APP_USR" not in r.text
    r = client.get(online["base"], headers=online["headers"])
    assert "APP_USR" not in r.text


def test_products_like_drinks(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    items = [
        {"id": "ninho", "flavor": "Ninho", "price": 15, "slices_total": 5},
        {"id": "coca", "kind": "produto", "flavor": "Coca-Cola lata", "price": 6, "slices_total": 2},
    ]
    body = client.put(base, json=_config(items), headers=headers).json()
    assert body["items"][1]["kind"] == "produto"
    r = client.post(f"{base}/sales", json=_sale([{"item_id": "coca", "qty": 3}]), headers=headers)
    assert r.status_code == 409 and "2 unidades" in r.json()["detail"]
    r = client.post(f"{base}/sales", json=_sale([{"item_id": "coca", "qty": 2}, {"item_id": "ninho", "qty": 1}]), headers=headers)
    assert r.json()["sales"][0]["total"] == 27
