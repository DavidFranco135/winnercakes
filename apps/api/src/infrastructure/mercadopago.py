"""Cliente mínimo da API de Orders do Mercado Pago (Pix).

Só duas chamadas: criar a cobrança Pix e consultar se ela foi paga. O "pago"
vale apenas quando o próprio Mercado Pago diz que a order foi processada e
creditada — comprovante, print ou aviso do cliente nunca contam.
"""
from dataclasses import dataclass

import requests

from src.domain.shared.exceptions import PaymentProviderError

_BASE = "https://api.mercadopago.com"
_TIMEOUT = 15


@dataclass
class PixCharge:
    id: str
    pix_code: str
    pix_url: str
    status: str


@dataclass
class OrderStatus:
    status: str
    status_detail: str
    total_amount: float
    external_reference: str

    @property
    def paid(self) -> bool:
        return self.status == "processed" and self.status_detail == "accredited"

    @property
    def dead(self) -> bool:
        return self.status in {"canceled", "expired", "failed", "refunded"}


def _headers(token: str, idempotency_key: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if idempotency_key:
        h["X-Idempotency-Key"] = idempotency_key
    return h


def create_pix(
    token: str,
    *,
    reference: str,
    amount: float,
    payer_email: str,
    payer_name: str,
    description: str,
    idempotency_key: str,
    test_mode: bool,
) -> PixCharge:
    value = f"{amount:.2f}"
    body = {
        "type": "online",
        "external_reference": reference,
        "total_amount": value,
        "processing_mode": "automatic",
        "description": description[:120],
        "payer": {
            "email": payer_email,
            # No ambiente de teste, "APRO" faz o Mercado Pago aprovar sozinho.
            "first_name": "APRO" if test_mode else payer_name[:40],
        },
        "transactions": {
            "payments": [
                {
                    "amount": value,
                    "payment_method": {"id": "pix", "type": "bank_transfer"},
                    "expiration_time": "PT30M",
                }
            ]
        },
    }
    try:
        res = requests.post(
            f"{_BASE}/v1/orders",
            json=body,
            headers=_headers(token, idempotency_key),
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise PaymentProviderError("Não foi possível falar com o Mercado Pago.") from exc
    if res.status_code >= 300:
        raise PaymentProviderError(f"Mercado Pago recusou a cobrança ({res.status_code}).")
    data = res.json()
    payment = ((data.get("transactions") or {}).get("payments") or [{}])[0]
    method = payment.get("payment_method") or {}
    return PixCharge(
        id=str(data.get("id", "")),
        pix_code=method.get("qr_code", "") or "",
        pix_url=method.get("ticket_url", "") or "",
        status=str(data.get("status", "")),
    )


def get_order(token: str, order_id: str) -> OrderStatus:
    try:
        res = requests.get(
            f"{_BASE}/v1/orders/{order_id}", headers=_headers(token), timeout=_TIMEOUT
        )
    except requests.RequestException as exc:
        raise PaymentProviderError("Não foi possível falar com o Mercado Pago.") from exc
    if res.status_code >= 300:
        raise PaymentProviderError(f"Mercado Pago não encontrou a cobrança ({res.status_code}).")
    data = res.json()
    try:
        total = float(data.get("total_amount") or 0)
    except (TypeError, ValueError):
        total = 0.0
    return OrderStatus(
        status=str(data.get("status", "")),
        status_detail=str(data.get("status_detail", "")),
        total_amount=total,
        external_reference=str(data.get("external_reference", "")),
    )


def cancel_order(token: str, order_id: str) -> None:
    try:
        requests.post(
            f"{_BASE}/v1/orders/{order_id}/cancel",
            headers=_headers(token, f"cancel-{order_id}"),
            timeout=_TIMEOUT,
        )
    except requests.RequestException:
        pass  # melhor esforço: a cobrança expira sozinha em 30 min
