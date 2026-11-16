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
  max = 9,
}: {
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

      {next && (
        <Reveal>
          <a
            href={festivalMapsUrl(next, places)}
            target="_blank"
            rel="noopener noreferrer"
            className="fx-festival group relative flex flex-col gap-5 overflow-hidden rounded-[32px] bg-[var(--accent)] p-6 text-[var(--accent-ink)] shadow-[0_30px_70px_-35px_var(--accent)] transition hover:-translate-y-1 sm:flex-row sm:items-center sm:p-9"
          >
            <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <span className="relative flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-3xl bg-white text-[var(--accent-text)] shadow-lg sm:h-28 sm:w-28">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rest.map((f, i) => {
            const p = festivalDateParts(f.date);
            return (
              <Reveal key={`${f.date}-${f.place}-${i}`} delay={(i % 4) * 70}>
                <a
                  href={festivalMapsUrl(f, places)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full items-center gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-3.5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg sm:p-4"
                >
                  <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                    <span className="font-[family-name:var(--font-display)] text-xl font-bold leading-none">{p.day}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{p.month}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                      {p.relative || p.weekday}
                    </span>
                    <span className="block text-sm font-semibold leading-snug">{f.place}</span>
                    {(f.time || f.note) && (
                      <span className="block text-xs leading-snug text-[var(--muted)]">
                        {[f.time, f.note].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </a>
              </Reveal>
            );
          })}
        </div>
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
