"use client";

// Quadro de sabores (fatias do festival) e galeria de fotos das encomendas.

import { useEffect, useState } from "react";
import type { StoreFlavor, StoreGalleryPhoto } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { IconClose, Reveal } from "./ui";

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
