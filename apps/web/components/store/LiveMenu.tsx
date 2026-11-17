"use client";

// Cardápio do festival AO VIVO: aparece na loja só no dia do festival, quando a
// dona liga "Mostrar no site". Mostra quantas fatias restam de cada sabor e
// atualiza sozinho a cada poucos segundos.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api-client";
import {
  createFestivalOrder,
  loadPublicFestival,
  saveTicket,
  savedTickets,
  ticketHref,
  type PublicFestivalLive,
  type SavedTicket,
} from "@/lib/festival";
import { formatBRL } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { Reveal } from "./ui";

const REFRESH_MS = 5000;

export function useLiveFestival(slug: string): PublicFestivalLive | null {
  const [live, setLive] = useState<PublicFestivalLive | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const data = await loadPublicFestival(slug);
        if (alive) setLive(data);
      } catch {
        // Sem internet: mantém o último cardápio na tela.
      }
      if (alive) timer = setTimeout(tick, document.hidden ? REFRESH_MS * 4 : REFRESH_MS);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [slug]);
  return live;
}

function countLabel(n: number, kind?: string): string {
  if (n <= 0) return "Esgotado";
  if (kind === "produto") return n <= 3 ? `Últimas ${n}` : `${n} unid.`;
  if (n <= 3) return n === 1 ? "Última fatia!" : `Últimas ${n}`;
  return `${n} fatias`;
}

export function LiveMenu({ live, slug }: { live: PublicFestivalLive | null; slug: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [tickets, setTickets] = useState<SavedTicket[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setTickets(savedTickets(slug)), 0);
    return () => clearTimeout(t);
  }, [slug]);

  const online = Boolean(live?.online_enabled);
  const byId = useMemo(() => new Map((live?.items ?? []).map((i) => [i.id, i])), [live]);
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && byId.has(id));
  const count = lines.reduce((s, [, q]) => s + q, 0);
  const sliceCount = lines.reduce((s, [id, q]) => s + ((byId.get(id)?.kind ?? "fatia") === "fatia" ? q : 0), 0);
  const total = lines.reduce((s, [id, q]) => s + q * (byId.get(id)?.price ?? 0), 0);
  const maxTotal = live?.max_per_order ?? 6;

  function bump(id: string, delta: number) {
    const it = byId.get(id);
    if (!it) return;
    setCart((c) => {
      const current = c[id] ?? 0;
      const isSlice = (it.kind ?? "fatia") === "fatia";
      const others = Object.entries(c).reduce(
        (s, [k, q]) => (k === id || (byId.get(k)?.kind ?? "fatia") !== "fatia" ? s : s + q),
        0
      );
      const limit = isSlice ? maxTotal - others : Number.POSITIVE_INFINITY;
      const next = Math.max(0, Math.min(current + delta, it.online_available, limit));
      return { ...c, [id]: next };
    });
  }

  // Veio pelo QR da fila (link com #ao-vivo): rola direto para o cardápio.
  const hasLive = Boolean(live && live.items.length > 0);
  useEffect(() => {
    if (!hasLive || window.location.hash !== "#ao-vivo") return;
    const t = setTimeout(() => document.getElementById("ao-vivo")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    return () => clearTimeout(t);
  }, [hasLive]);

  if (!live || live.items.length === 0) return null;
  const closed = live.status === "encerrado";
  const preparing = live.status === "preparando";
  const items = [...live.items].sort(
    (a, b) =>
      Number((a.kind ?? "fatia") === "produto") - Number((b.kind ?? "fatia") === "produto") ||
      Number(a.sold_out) - Number(b.sold_out)
  );

  return (
    <section id="ao-vivo" className="scroll-mt-32 space-y-5">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
              {!closed && <span className="h-2 w-2 animate-pulse rounded-full bg-[#e53935]" />}
              {closed ? "Festival de hoje" : "Ao vivo · Festival de hoje"}
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              {closed ? "Festival encerrado" : <>Fatias <em className="font-normal italic">disponíveis</em></>}
            </h2>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {preparing ? "Abrimos em breve. " : ""}Atualiza sozinho
          </p>
        </div>
      </Reveal>
      {tickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--muted)]">Seus pedidos de hoje:</span>
          {tickets.map((t) => (
            <a
              key={t.token}
              href={ticketHref(slug, t.token)}
              className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-[var(--accent-ink)]"
            >
              Ticket {t.code}
            </a>
          ))}
        </div>
      )}
      {online && !closed && (
        <p className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-text)]">
          <strong>Na fila?</strong> Escolha aqui, pague com Pix e retire na banca só mostrando o QR — sem esperar para pagar.
        </p>
      )}
      {closed ? (
        <p className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
          Obrigada por virem! Veja abaixo o próximo festival.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.flavor}
              className={`relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] ${it.sold_out ? "opacity-55" : ""}`}
            >
              {it.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgSrc(it.photo_url, IMG_WIDTH.card)}
                  alt={it.flavor}
                  loading="lazy"
                  className={`aspect-square w-full object-cover ${it.sold_out ? "grayscale" : ""}`}
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--accent-soft)] text-5xl">
                  {(it.kind ?? "fatia") === "produto" ? "🥤" : "🍰"}
                </div>
              )}
              <span
                className={`absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow ${
                  it.sold_out
                    ? "bg-neutral-800 text-white"
                    : it.remaining <= 3
                      ? "bg-[#e53935] text-white"
                      : "bg-white text-[var(--accent-text)]"
                }`}
              >
                {countLabel(it.remaining, it.kind)}
              </span>
              <div className="space-y-0.5 p-3">
                <p className="text-sm font-semibold leading-snug">{it.flavor}</p>
                {it.price > 0 && <p className="text-sm text-[var(--accent-text)]">{formatBRL(it.price)}</p>}
                {online && !it.sold_out && it.price > 0 && (
                  it.online_available > 0 ? (
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => bump(it.id, -1)}
                        disabled={!cart[it.id]}
                        aria-label={`Tirar ${it.flavor}`}
                        className="h-9 w-9 rounded-full border border-[var(--line)] text-lg font-semibold disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="text-base font-bold">{cart[it.id] ?? 0}</span>
                      <button
                        onClick={() => bump(it.id, 1)}
                        disabled={(cart[it.id] ?? 0) >= it.online_available || ((it.kind ?? "fatia") === "fatia" && sliceCount >= maxTotal)}
                        aria-label={`Adicionar ${it.flavor}`}
                        className="h-9 w-9 rounded-full bg-[var(--accent)] text-lg font-semibold text-[var(--accent-ink)] disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <p className="pt-2 text-xs text-[var(--muted)]">Só no balcão</p>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {online && count > 0 && !closed && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl items-center gap-3 rounded-full bg-[var(--ink)] p-2 pl-5 text-[var(--bg)] shadow-2xl">
            <span className="flex-1 text-sm">
              <strong>{count}</strong> {count === 1 ? "item" : "itens"} · <strong>{formatBRL(total)}</strong>
            </span>
            <button
              onClick={() => setCheckout(true)}
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)]"
            >
              Pagar com Pix
            </button>
          </div>,
          portalTarget()
        )}
      {checkout && (
        <CheckoutSheet
          slug={slug}
          lines={lines.map(([id, q]) => ({ item_id: id, qty: q, flavor: byId.get(id)?.flavor ?? "", price: byId.get(id)?.price ?? 0 }))}
          total={total}
          onClose={() => setCheckout(false)}
        />
      )}
    </section>
  );
}

function CheckoutSheet({
  slug,
  lines,
  total,
  onClose,
}: {
  slug: string;
  lines: { item_id: string; qty: number; flavor: string; price: number }[];
  total: number;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const order = await createFestivalOrder(slug, {
        name: name.trim(),
        phone: phone.replace(/\D/g, ""),
        lines: lines.map(({ item_id, qty }) => ({ item_id, qty })),
      });
      saveTicket({ slug, token: order.token, code: order.code, date: order.date });
      window.location.href = ticketHref(slug, order.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão. Tente de novo.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-t-[28px] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Seu pedido</h3>
          <button type="button" onClick={onClose} className="text-sm text-[var(--muted)]">Fechar</button>
        </div>
        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.item_id} className="flex justify-between">
              <span>{l.qty}× {l.flavor}</span>
              <span>{formatBRL(l.qty * l.price)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-[var(--line)] pt-2 font-semibold">
            <span>Total</span>
            <span>{formatBRL(total)}</span>
          </li>
        </ul>
        <input
          required
          minLength={2}
          maxLength={60}
          placeholder="Seu nome (para conferir na retirada)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm"
        />
        <input
          required
          inputMode="tel"
          placeholder="WhatsApp com DDD"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm"
        />
        <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--muted)]">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" required />
          As fatias ficam guardadas por 15 minutos para o Pix. Depois de pago, retire na banca mostrando o QR do ticket. Pedido pago e não retirado até o fim do festival não tem reembolso.
        </label>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button
          disabled={busy || !agree}
          className="w-full rounded-full bg-[var(--accent)] py-3.5 text-base font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        >
          {busy ? "Gerando Pix…" : `Gerar Pix de ${formatBRL(total)}`}
        </button>
      </form>
    </div>,
    portalTarget()
  );
}

// Dentro da raiz da loja (onde ficam as cores do tema), fora de qualquer
// elemento com animação — assim "fixed" vale para a tela inteira.
function portalTarget(): Element {
  return document.querySelector(".store-fx") ?? document.body;
}
