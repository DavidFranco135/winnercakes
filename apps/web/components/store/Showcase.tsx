"use client";

// Quadro de sabores (fatias do festival) e galeria de fotos das encomendas.

import { useEffect, useState } from "react";
import type { StoreCakeTable, StoreFaq, StoreFlavor, StoreGalleryPhoto } from "@/lib/store";
import { formatBRL } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { IconClose, IconPlus, IconWhatsapp, Reveal } from "./ui";

export function FlavorsSection({
  flavors,
  heading,
  footer,
}: {
  flavors?: StoreFlavor[];
  heading: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const list = (flavors ?? []).filter((f) => f.name.trim());
  if (list.length === 0) return null;
  return (
    <section className="space-y-7">
      <Reveal>{heading}</Reveal>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6 xl:grid-cols-7">
        {list.map((f, i) => (
          <Reveal key={`${f.name}-${i}`} delay={(i % 6) * 50}>
            <div className="group h-full overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm transition duration-500 hover:-translate-y-1 hover:shadow-xl">
              {f.photo_url ? (
                <div className="aspect-square overflow-hidden bg-[var(--accent-soft)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc(f.photo_url, IMG_WIDTH.card)}
                    alt={f.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                  />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center bg-[var(--accent-soft)] text-3xl">🍰</div>
              )}
              <p className="bg-[var(--accent)] px-2 py-2 text-center text-[11px] font-bold uppercase leading-tight tracking-wide text-[var(--accent-ink)] sm:text-xs">
                {f.name}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
      {footer}
    </section>
  );
}

export function GallerySection({ photos, heading }: { photos?: StoreGalleryPhoto[]; heading: React.ReactNode }) {
  const list = (photos ?? []).filter((p) => p.url);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % list.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + list.length) % list.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, list.length]);

  if (list.length === 0) return null;
  const current = open !== null ? list[open] : null;

  return (
    <section className="space-y-7">
      <Reveal>{heading}</Reveal>
      {/* Celular: carrossel com deslize; computador: mosaico. */}
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:block sm:columns-3 sm:gap-4 sm:space-y-4 sm:overflow-visible sm:px-0 lg:columns-4 [&::-webkit-scrollbar]:hidden"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {list.map((p, i) => (
          <button
            key={`${p.url}-${i}`}
            onClick={() => setOpen(i)}
            className="group relative w-[72%] shrink-0 snap-center overflow-hidden rounded-3xl bg-[var(--accent-soft)] text-left shadow-sm transition hover:shadow-xl sm:mb-4 sm:block sm:w-full sm:break-inside-avoid"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc(p.url, IMG_WIDTH.large)}
              alt={p.caption || "Foto da confeitaria"}
              loading="lazy"
              className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-[1.04] sm:aspect-auto"
            />
            {p.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-sm font-medium text-white">
                {p.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(null)}
        >
          <button
            aria-label="Fechar"
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <IconClose className="h-5 w-5" />
          </button>
          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc(current.url, IMG_WIDTH.hero)} alt={current.caption || ""} className="max-h-[82vh] w-auto rounded-2xl object-contain" />
            {current.caption && <figcaption className="pt-3 text-center text-sm text-white/85">{current.caption}</figcaption>}
          </figure>
        </div>
      )}
    </section>
  );
}

// Tabela de bolos: um cartão por formato (Redondos, Quadrados…), com foto,
// tamanhos, rendimento e preço; cada linha abre o WhatsApp já com o pedido.
export function CakeTablesSection({
  tables,
  note,
  heading,
  orderLink,
}: {
  tables?: StoreCakeTable[];
  note?: string;
  heading: React.ReactNode;
  orderLink: (text: string) => string;
}) {
  const list = (tables ?? []).filter((t) => t.title.trim() && t.sizes.length > 0);
  if (list.length === 0) return null;
  return (
    <section className="space-y-7">
      <Reveal>{heading}</Reveal>
      <div className="grid gap-5 lg:grid-cols-2">
        {list.map((t, i) => (
          <Reveal key={`${t.title}-${i}`} delay={i * 100}>
            <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
              {t.photo_url && (
                <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-[var(--accent-soft)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgSrc(t.photo_url, IMG_WIDTH.card)} alt={`Bolo ${t.title}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute left-4 top-4 rounded-full bg-[var(--accent)] px-4 py-1.5 font-[family-name:var(--font-display)] text-lg font-semibold italic text-[var(--accent-ink)] shadow-lg">
                    {t.title}
                  </span>
                </div>
              )}
              <ul className="flex flex-1 flex-col justify-center gap-2.5 p-4 sm:p-6">
                {!t.photo_url && (
                  <li className="font-[family-name:var(--font-display)] text-2xl font-semibold italic text-[var(--accent-text)]">{t.title}</li>
                )}
                {t.sizes.map((size, j) => (
                  <li key={j}>
                    <a
                      href={orderLink(
                        `Olá! Quero encomendar um bolo ${t.title.toLowerCase().replace(/s$/, "")} ${size.label}${
                          size.detail ? ` (${size.detail})` : ""
                        } — ${formatBRL(size.price)}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 transition hover:border-[var(--accent)] hover:shadow-md"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold uppercase tracking-wide">{size.label}</span>
                        {size.detail && <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">{size.detail}</span>}
                      </span>
                      <span className="shrink-0 rounded-xl bg-[#ffc72c] px-3 py-1.5 font-[family-name:var(--font-display)] text-lg font-bold text-[#3b1a10]">
                        {formatBRL(size.price)}
                      </span>
                      <IconWhatsapp className="hidden h-5 w-5 shrink-0 text-[#25d366] opacity-60 transition group-hover:opacity-100 sm:block" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
      {note?.trim() && <p className="text-center text-xs text-[var(--muted)]">{note}</p>}
    </section>
  );
}

// Perguntas frequentes (sanfona): uma aberta por vez.
export function FaqSection({ items, heading }: { items?: StoreFaq[]; heading: React.ReactNode }) {
  const list = (items ?? []).filter((f) => f.question.trim());
  const [open, setOpen] = useState<number | null>(0);
  if (list.length === 0) return null;
  return (
    <section className="space-y-7">
      <Reveal>{heading}</Reveal>
      <div className="mx-auto max-w-3xl space-y-3">
        {list.map((f, i) => {
          const isOpen = open === i;
          return (
            <Reveal key={`${f.question}-${i}`} delay={(i % 5) * 60}>
              <div className={`overflow-hidden rounded-3xl border bg-[var(--surface)] transition ${isOpen ? "border-[var(--accent)] shadow-lg" : "border-[var(--line)]"}`}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]">
                    {i + 1}
                  </span>
                  <span className="flex-1 font-semibold">{f.question}</span>
                  <IconPlus className={`h-5 w-5 shrink-0 text-[var(--accent-text)] transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 pl-[4.5rem] text-sm leading-relaxed text-[var(--muted)]">{f.answer}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
