"use client";

// Calendário dos Festivais de Fatias e "Onde estamos": o próximo festival em
// destaque (vermelho da marca), as datas seguintes em cartões e os locais
// fixos, cada um com o botão "Como chegar" (Google Maps).

import type { StoreFestival, StoreLocation } from "@/lib/store";
import { festivalDateParts, festivalMapsUrl, locationMapsUrl, upcomingFestivals } from "@/lib/store";
import { IconArrowRight, IconClock, IconPin, Reveal } from "./ui";

export function FestivalsSection({
  festivals,
  locations,
  heading,
  note,
  max = 9,
}: {
  note?: string;
  festivals?: StoreFestival[];
  locations?: StoreLocation[];
  heading: React.ReactNode;
  max?: number;
}) {
  const list = upcomingFestivals(festivals).slice(0, max);
  const places = locations ?? [];
  if (list.length === 0 && places.length === 0) return null;
  const [next, ...rest] = list;

  return (
    <section className="space-y-7">
      <Reveal>{heading}</Reveal>
      {note?.trim() && (
        <Reveal>
          <p className="-mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{note}</p>
        </Reveal>
      )}

      {next && (
        <Reveal>
          <a
            href={festivalMapsUrl(next, places)}
            target="_blank"
            rel="noopener noreferrer"
            className="fx-festival group relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-[var(--accent)] p-5 text-[var(--accent-ink)] shadow-[0_30px_70px_-35px_var(--accent)] transition hover:-translate-y-1 sm:flex-row sm:items-center sm:p-9"
          >
            <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <span className="relative flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-3xl bg-white text-[var(--accent-text)] shadow-lg sm:h-28 sm:w-28">
              <span className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none sm:text-5xl">
                {festivalDateParts(next.date).day}
              </span>
              <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em]">{festivalDateParts(next.date).month}</span>
            </span>
            <span className="relative min-w-0 flex-1 space-y-1.5">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffd54a]" />
                {festivalDateParts(next.date).relative || "Próximo festival"} · {festivalDateParts(next.date).weekday}
              </span>
              <span className="block font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight sm:text-3xl">
                {next.place}
              </span>
              {(next.time || next.note) && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-90">
                  {next.time && (
                    <span className="inline-flex items-center gap-1.5">
                      <IconClock className="h-4 w-4" />
                      {next.time}
                    </span>
                  )}
                  {next.note && <span>{next.note}</span>}
                </span>
              )}
            </span>
            <span className="relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--accent-text)] shadow-lg transition group-hover:shadow-xl">
              <IconPin className="h-4 w-4" />
              Como chegar
              <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </a>
        </Reveal>
      )}

      {rest.length > 0 && (
        <Reveal>
          <div className="space-y-2">
            <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
              <span>Próximas datas</span>
              <span className="normal-case tracking-normal text-[var(--muted)] sm:hidden">arraste →</span>
            </p>
            {/* Uma faixa só, rolando para o lado: ocupa pouco espaço no celular. */}
            <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {rest.map((f, i) => {
                const p = festivalDateParts(f.date);
                const sameTime = f.time && f.time === next?.time;
                return (
                  <a
                    key={`${f.date}-${f.place}-${i}`}
                    href={festivalMapsUrl(f, places)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={[f.place, f.time, f.note].filter(Boolean).join(" · ")}
                    className="group flex w-[132px] shrink-0 snap-start flex-col gap-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg sm:w-[150px]"
                  >
                    <span className="flex items-baseline gap-1.5 text-[var(--accent-text)]">
                      <span className="font-[family-name:var(--font-display)] text-2xl font-bold leading-none">{p.day}</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider">{p.month}</span>
                      <span className="ml-auto text-[10px] font-semibold uppercase">{p.weekday.slice(0, 3)}</span>
                    </span>
                    <span className="line-clamp-2 text-xs font-semibold leading-snug">{f.place.replace(/^Festival\s+/i, "")}</span>
                    {(f.note || (f.time && !sameTime)) && (
                      <span className="line-clamp-1 text-[11px] text-[var(--muted)]">{[sameTime ? "" : f.time, f.note].filter(Boolean).join(" · ")}</span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        </Reveal>
      )}

      {places.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">Onde estamos</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {places.map((l, i) => (
              <Reveal key={`${l.name}-${i}`} delay={(i % 2) * 80}>
                <a
                  href={locationMapsUrl(l)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)]">
                    <IconPin className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{l.name}</span>
                    {l.address && <span className="block text-sm text-[var(--muted)]">{l.address}</span>}
                    {l.schedule && <span className="block text-xs text-[var(--muted)]">{l.schedule}</span>}
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent-text)] sm:inline-flex">
                    Como chegar
                    <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Texto curto para a faixa do topo: "Próximo festival: qua 18/11 · Bay Market".
export function nextFestivalNotice(festivals?: StoreFestival[]): string | null {
  const next = upcomingFestivals(festivals)[0];
  if (!next) return null;
  const p = festivalDateParts(next.date);
  return `Próximo Festival de Fatias: ${p.relative ? p.relative.toLowerCase() : `${p.weekday} ${p.short}`} · ${next.place}`;
}
