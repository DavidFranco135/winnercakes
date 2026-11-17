"use client";

// Aniversários dos clientes: hoje e nos próximos dias, com botão para mandar
// parabéns no WhatsApp. Usado no Painel e na página de Clientes.

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

export interface Birthday {
  id: string;
  name: string;
  phone: string | null;
  birth_date: string;
  next_date: string;
  days_until: number;
  turning: number | null;
}

function whenLabel(d: number): string {
  if (d === 0) return "Hoje!";
  if (d === 1) return "Amanhã";
  return `em ${d} dias`;
}

function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function waLink(b: Birthday): string | null {
  const digits = (b.phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const first = b.name.split(" ")[0];
  const msg =
    b.days_until === 0
      ? `Oi, ${first}! 🎉 A Winner Cakes deseja um feliz aniversário! Que tal comemorar com um bolo especial? 🎂`
      : `Oi, ${first}! Seu aniversário está chegando (${dayMonth(b.next_date)}) 🎂 Que tal já encomendar o bolo da comemoração com a Winner Cakes?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function useBirthdays(orgPath: string, accessToken: string | null, days = 30) {
  const [list, setList] = useState<Birthday[] | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    apiFetch<Birthday[]>(`${orgPath}/customers/birthdays?days=${days}`, { accessToken })
      .then((r) => alive && setList(r))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [orgPath, accessToken, days]);
  return list;
}

export function BirthdaysCard({
  list,
  showLink = true,
  limit = 8,
}: {
  list: Birthday[] | null;
  showLink?: boolean;
  limit?: number;
}) {
  if (!list || list.length === 0) return null;
  const soon = list.filter((b) => b.days_until <= 7).length;
  const today = list.filter((b) => b.days_until === 0);
  return (
    <section className="space-y-3 rounded-xl border border-pink-900/60 bg-pink-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-xl">🎂</span>
          Aniversários próximos
          {soon > 0 && <span className="rounded-full bg-pink-600 px-2 py-0.5 text-xs text-white">{soon} nesta semana</span>}
        </h2>
        {showLink && (
          <Link href="/clientes" className="text-sm text-pink-300 hover:underline">
            Ver clientes
          </Link>
        )}
      </div>
      {today.length > 0 && (
        <p className="rounded-lg bg-pink-600/90 px-3 py-2 text-sm font-medium text-white">
          🎉 Hoje é aniversário de {today.map((b) => b.name.split(" ")[0]).join(", ")}! Mande os parabéns.
        </p>
      )}
      <ul className="divide-y divide-neutral-800">
        {list.slice(0, limit).map((b) => {
          const link = waLink(b);
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className={`w-16 shrink-0 font-semibold ${b.days_until <= 7 ? "text-pink-300" : "text-neutral-400"}`}>
                {dayMonth(b.next_date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{b.name}</span>
                <span className="text-neutral-400">
                  {" "}· {whenLabel(b.days_until)}
                  {b.turning ? ` · faz ${b.turning} anos` : ""}
                </span>
              </span>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600"
                >
                  {b.days_until === 0 ? "Mandar parabéns" : "Chamar no WhatsApp"}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > limit && <p className="text-xs text-neutral-500">+ {list.length - limit} nos próximos 30 dias</p>}
    </section>
  );
}
