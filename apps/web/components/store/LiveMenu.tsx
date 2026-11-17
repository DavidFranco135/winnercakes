"use client";

// Cardápio do festival AO VIVO: aparece na loja só no dia do festival, quando a
// dona liga "Mostrar no site". Mostra quantas fatias restam de cada sabor e
// atualiza sozinho a cada poucos segundos.

import { useEffect, useState } from "react";
import { loadPublicFestival, type PublicFestivalLive } from "@/lib/festival";
import { formatBRL } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { Reveal } from "./ui";

const REFRESH_MS = 15000;

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

function countLabel(n: number): string {
  if (n <= 0) return "Esgotado";
  if (n <= 3) return n === 1 ? "Última fatia!" : `Últimas ${n}`;
  return `${n} fatias`;
}

export function LiveMenu({ live }: { live: PublicFestivalLive | null }) {
  if (!live || live.items.length === 0) return null;
  const closed = live.status === "encerrado";
  const preparing = live.status === "preparando";
  const items = [...live.items].sort((a, b) => Number(a.sold_out) - Number(b.sold_out));

  return (
    <section className="space-y-5">
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
                <div className="aspect-square w-full bg-[var(--accent-soft)]" />
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
                {countLabel(it.remaining)}
              </span>
              <div className="space-y-0.5 p-3">
                <p className="text-sm font-semibold leading-snug">{it.flavor}</p>
                {it.price > 0 && <p className="text-sm text-[var(--accent-text)]">{formatBRL(it.price)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
