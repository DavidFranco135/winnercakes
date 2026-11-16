"use client";

import { useEffect, useState } from "react";
import { formatPercent } from "@/lib/store";

// Avisos de desconto da loja: faixa logo abaixo da capa, aba lateral
// "Ganhe até X% OFF" e a caixa que abre sozinha ao entrar no site (uma vez
// por dia). Não há cupom nem cadastro: o desconto entra sozinho no carrinho.

const POPUP_KEY = "winner-promo-popup-dia";
const TAB_KEY = "winner-promo-aba-fechada";

function safeGet(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function safeSet(storage: "local" | "session", key: string, value: string) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // armazenamento indisponível
  }
}

// Faixa fina logo abaixo da capa, na cor de destaque escolhida em Minha Loja.
export function PromoStrip({ notices, onClick }: { notices: string[]; onClick: () => void }) {
  if (notices.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="fx-promo-strip group flex w-full flex-col items-center justify-center gap-x-3 gap-y-0.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-center text-xs font-semibold leading-snug text-[var(--accent-ink)] shadow-sm transition hover:brightness-110 sm:flex-row sm:flex-wrap sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm"
    >
      {notices.map((n, i) => (
        <span key={n} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden className="hidden opacity-60 sm:inline">•</span>}
          {n}
        </span>
      ))}
      <span className="text-[10px] font-normal opacity-80 sm:text-xs">(desconto automático no carrinho)</span>
    </button>
  );
}

// Aba lateral fixa, com X para esconder (volta na próxima visita).
export function PromoSideTab({ maxPercent, onOpen }: { maxPercent: number; onOpen: () => void }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setHidden(safeGet("session", TAB_KEY) === "1"), 0);
    return () => clearTimeout(id);
  }, []);
  if (maxPercent <= 0 || hidden) return null;
  return (
    <div className="fixed left-0 top-1/2 z-40 -translate-y-1/2 animate-fade-in">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center rounded-r-lg bg-[var(--brand-2)] py-2 pl-1 pr-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--brand-2-ink)] shadow-lg transition hover:pl-1.5"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        Ganhe até {formatPercent(maxPercent)} OFF
      </button>
      <button
        type="button"
        aria-label="Esconder aviso de desconto"
        onClick={() => {
          safeSet("session", TAB_KEY, "1");
          setHidden(true);
        }}
        className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[10px] leading-none text-neutral-800 shadow"
      >
        ×
      </button>
    </div>
  );
}

// Caixa de boas-vindas com os descontos. Abre sozinha depois da abertura
// animada, no máximo uma vez por dia; também abre pela aba/faixa.
export function PromoPopup({
  notices,
  open,
  onClose,
  onShop,
  stack,
}: {
  notices: string[];
  open: boolean;
  onClose: () => void;
  onShop: () => void;
  stack: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || notices.length === 0) return null;
  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Descontos da loja"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-lg animate-sheet-up overflow-y-auto overflow-x-hidden rounded-[28px] bg-[var(--surface)] text-[var(--ink)] shadow-2xl"
      >
        <div className="relative overflow-hidden bg-[var(--brand-2)] px-7 pb-7 pt-8 text-center text-[var(--brand-2-ink)]">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[#c47a5a]/40 blur-3xl" />
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-[var(--accent-ink)]/80 transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--accent-ink)] opacity-75">Boas-vindas à Winner Cakes</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight sm:text-4xl">
            Descontos <em className="font-normal italic">especiais</em> para você
          </h2>
        </div>
        <div className="space-y-5 px-7 py-7">
          <ul className="space-y-3">
            {notices.map((n) => {
              const pct = n.match(/(\d+(?:,\d+)?)%/)?.[1];
              return (
                <li key={n} className="flex items-center gap-4 rounded-2xl bg-white/60 p-3.5">
                  <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)]">
                    <span className="text-lg font-bold leading-none">{pct ?? "%"}%</span>
                    <span className="text-[9px] font-semibold tracking-widest">OFF</span>
                  </span>
                  <span className="text-[15px] font-medium leading-snug">{n}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-center text-sm text-[var(--muted)]">
            Sem cupom e sem cadastro: o desconto é aplicado automaticamente no carrinho, mostrando o preço antigo e o
            novo.{notices.length > 1 && !stack ? " Os descontos não se acumulam: vale sempre o maior." : ""}
          </p>
          <button
            type="button"
            onClick={onShop}
            className="fx-btn h-12 w-full rounded-full bg-[var(--accent)] text-sm font-semibold uppercase tracking-wider text-[var(--accent-ink)] shadow-lg transition hover:-translate-y-0.5"
          >
            Ver produtos com desconto
          </button>
        </div>
      </div>
    </div>
  );
}

// Abre a caixa sozinha (uma vez por dia), depois da abertura animada.
export function usePromoAutoOpen(enabled: boolean, open: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const today = new Date().toDateString();
    if (safeGet("local", POPUP_KEY) === today) return;
    // Espera a abertura animada terminar (~5 s desde que a página começou a carregar).
    const id = setTimeout(
      () => {
        safeSet("local", POPUP_KEY, today);
        open();
      },
      Math.max(1800, 5200 - performance.now())
    );
    return () => clearTimeout(id);
  }, [enabled, open]);
}
