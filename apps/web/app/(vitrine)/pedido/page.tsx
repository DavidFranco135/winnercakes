"use client";

// Ticket do pedido feito na fila: primeiro mostra o Pix; quando o Mercado Pago
// confirma, vira o QR de retirada (vale uma vez só, conferido no balcão).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ApiError } from "@/lib/api-client";
import { cancelFestivalOrder, getFestivalOrder, saveTicket, type PublicFestivalOrder } from "@/lib/festival";
import { formatBRL, themeVars } from "@/lib/store";
import { playChime, unlockChime } from "@/lib/chime";

function useQr(text: string | null | undefined, dark = "#1f1410") {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!text) return;
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: 520, errorCorrectionLevel: "M", color: { dark, light: "#ffffff" } })
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [text, dark]);
  return text ? url : "";
}

function hhmm(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className="font-semibold tabular-nums">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function Ticket() {
  const params = useSearchParams();
  const slug = params.get("s") ?? "";
  const token = params.get("t") ?? "";
  const [order, setOrder] = useState<PublicFestivalOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async () => {
    if (!slug || !token) return;
    try {
      const o = await getFestivalOrder(slug, token);
      setOrder(o);
      setError(null);
      saveTicket({ slug, token, code: o.code, date: o.date });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão. Tentando de novo…");
    }
  }, [slug, token]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await load();
      if (alive) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  // Pix confirmado enquanto a tela estava aberta: sininho + vibração.
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    if (lastStatus.current === "aguardando" && order.status === "pago") playChime();
    lastStatus.current = order.status;
  }, [order]);
  useEffect(() => {
    const on = () => unlockChime();
    window.addEventListener("pointerdown", on, { once: true });
    return () => window.removeEventListener("pointerdown", on);
  }, []);

  // Tela acesa enquanto o cliente mostra o QR na banca.
  useEffect(() => {
    if (order?.status !== "pago") return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [order?.status]);

  const pixQr = useQr(order?.status === "aguardando" ? order.pix_code : null);
  const ticketQr = useQr(order?.status === "pago" ? order.token : null);
  const back = slug ? `/loja?s=${encodeURIComponent(slug)}` : "/";

  async function copyPix() {
    if (!order?.pix_code) return;
    try {
      await navigator.clipboard.writeText(order.pix_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copie o código Pix:", order.pix_code);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancelar este pedido? As fatias voltam para venda.")) return;
    setCanceling(true);
    try {
      setOrder(await cancelFestivalOrder(slug, token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão para cancelar agora.");
    } finally {
      setCanceling(false);
    }
  }

  if (!slug || !token) {
    return <p className="p-10 text-center">Link de pedido incompleto.</p>;
  }

  return (
    <div style={themeVars("vermelho", "winner")} className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--ink)]">
      <div className="mx-auto max-w-md space-y-5">
        <a href={back} className="text-sm text-[var(--muted)]">← Voltar para a loja</a>

        {!order && !error && <p className="py-20 text-center text-[var(--muted)]">Carregando pedido…</p>}
        {error && !order && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {order && (
          <div className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-xl">
            {/* Cabeçalho do ticket */}
            <div
              className={`px-6 py-5 text-center ${
                order.status === "pago"
                  ? "bg-emerald-600 text-white"
                  : order.status === "retirado"
                    ? "bg-neutral-700 text-white"
                    : order.status === "aguardando"
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "bg-neutral-200 text-neutral-700"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Pedido</p>
              <p className="font-[family-name:var(--font-display)] text-5xl font-bold">{order.code}</p>
              <p className="mt-1 text-sm opacity-90">{order.name}</p>
            </div>

            <div className="space-y-5 p-6">
              {order.status === "aguardando" && (
                <>
                  {order.test_mode && (
                    <p className="rounded-xl bg-amber-100 p-3 text-xs text-amber-900">
                      MODO TESTE: nenhum dinheiro é cobrado e o pagamento é aprovado sozinho em alguns segundos.
                    </p>
                  )}
                  <p className="text-center text-sm">
                    Pague o Pix para garantir suas fatias. Elas ficam guardadas por <Countdown until={order.hold_until} />.
                  </p>
                  {pixQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pixQr} alt="QR code do Pix" className="mx-auto w-64 rounded-2xl" />
                  ) : (
                    <div className="mx-auto h-64 w-64 animate-pulse rounded-2xl bg-[var(--accent-soft)]" />
                  )}
                  <button onClick={copyPix} className="w-full rounded-full bg-[var(--accent)] py-3.5 font-semibold text-[var(--accent-ink)]">
                    {copied ? "Código copiado!" : "Copiar código Pix (copia e cola)"}
                  </button>
                  <p className="text-center text-xs text-[var(--muted)]">
                    Abra o app do seu banco → Pix → Copia e cola. Esta tela muda sozinha quando o pagamento cair.
                  </p>
                  <button onClick={cancel} disabled={canceling} className="w-full text-center text-sm text-[var(--muted)] underline">
                    Cancelar pedido
                  </button>
                </>
              )}

              {order.status === "pago" && (
                <>
                  <p className="text-center text-lg font-bold text-emerald-700">✓ Compra concluída! Mostre este QR na banca.</p>
                  {ticketQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ticketQr} alt="QR code do ticket" className="mx-auto w-72 rounded-2xl" />
                  ) : (
                    <div className="mx-auto h-72 w-72 animate-pulse rounded-2xl bg-emerald-50" />
                  )}
                  <p className="text-center text-xs text-[var(--muted)]">
                    O QR vale uma única retirada. Não mande print para outras pessoas.
                  </p>
                </>
              )}

              {order.status === "retirado" && (
                <p className="py-4 text-center text-lg font-semibold">Retirado às {hhmm(order.redeemed_at)}. Bom apetite! 🍰</p>
              )}
              {order.status === "pago_sem_estoque" && (
                <p className="rounded-xl bg-amber-100 p-4 text-sm text-amber-900">
                  Recebemos seu Pix, mas a fatia acabou antes da confirmação. Mostre esta tela na banca para a devolução.
                </p>
              )}
              {(order.status === "expirado" || order.status === "cancelado") && (
                <div className="space-y-3 text-center">
                  <p className="text-sm">
                    {order.status === "expirado" ? "O tempo para pagar acabou e as fatias voltaram para venda." : "Pedido cancelado."}
                  </p>
                  <a href={back} className="inline-block rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-ink)]">
                    Fazer outro pedido
                  </a>
                </div>
              )}

              <ul className="space-y-1 border-t border-[var(--line)] pt-4 text-sm">
                {order.lines.map((l) => (
                  <li key={l.item_id} className="flex justify-between">
                    <span>{l.qty}× {l.flavor}</span>
                    <span>{formatBRL(l.qty * l.price)}</span>
                  </li>
                ))}
                <li className="flex justify-between pt-1 font-semibold">
                  <span>Total</span>
                  <span>{formatBRL(order.total)}</span>
                </li>
              </ul>
            </div>
          </div>
        )}
        {error && order && <p className="text-center text-xs text-[var(--muted)]">{error}</p>}
      </div>
    </div>
  );
}

export default function PedidoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50" />}>
      <Ticket />
    </Suspense>
  );
}
