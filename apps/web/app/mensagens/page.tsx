"use client";

// Mensagens para clientes: escolhe quem recebe (aniversariantes, bairro,
// quem comprou um produto, cadastrados pelo site…), escreve uma vez com
// {nome} e envia um por um pelo WhatsApp — o gestor abre a conversa já com
// o texto e marca quem já recebeu. Não é disparo automático: quem aperta
// "Enviar" é a dona, então o número não corre risco de bloqueio.
// Marcações e modelos ficam guardados neste aparelho.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { Customer, Order, Product } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

type Segment =
  | "todos"
  | "aniv-semana"
  | "aniv-mes"
  | "aniv-proximo-mes"
  | "sem-aniv"
  | "bairro"
  | "produto"
  | "site"
  | "sem-pedido";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "todos", label: "Todos os clientes" },
  { key: "aniv-semana", label: "🎂 Aniversário nos próximos 7 dias" },
  { key: "aniv-mes", label: "🎂 Aniversariantes deste mês" },
  { key: "aniv-proximo-mes", label: "🎂 Aniversariantes do mês que vem" },
  { key: "bairro", label: "📍 De um bairro" },
  { key: "produto", label: "🍰 Já pediram um produto" },
  { key: "site", label: "🔗 Cadastrados pelo site" },
  { key: "sem-pedido", label: "Ainda não fizeram pedido" },
  { key: "sem-aniv", label: "Sem aniversário cadastrado" },
];

type Template = { title: string; text: string };

const BUILTIN: Template[] = [
  {
    title: "Aniversário",
    text: "Oi, {nome}! 🎉 A Winner Cakes deseja um feliz aniversário! Que tal comemorar com um bolo especial? Fale com a gente para encomendar 🎂",
  },
  {
    title: "Aniversário chegando",
    text: "Oi, {nome}! Seu aniversário está chegando 🎂 Que tal já garantir o bolo da comemoração? Encomendas com antecedência: winnercakes.pages.dev",
  },
  {
    title: "Festival de Fatias",
    text: "Oi, {nome}! 🍰 Essa semana tem Festival de Fatias da Winner Cakes! Abrimos às 13h e ficamos até acabarem as fatias. Veja os sabores: winnercakes.pages.dev",
  },
  {
    title: "Promoção",
    text: "Oi, {nome}! Temos uma promoção especial na Winner Cakes 🎁 Confira no site: winnercakes.pages.dev",
  },
  {
    title: "Natal",
    text: "Oi, {nome}! 🎄 As encomendas de Natal da Winner Cakes estão abertas! Garanta o seu bolo ou kit de doces: winnercakes.pages.dev",
  },
  {
    title: "Novos sabores",
    text: "Oi, {nome}! Chegaram sabores novos na Winner Cakes 😍 Veja todos com as camadas do recheio: winnercakes.pages.dev",
  },
];

const TEMPLATES_KEY = "msg-modelos";
const SENT_KEY = "msg-enviados";

function digits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

function waNumber(phone: string | null): string | null {
  const d = digits(phone);
  if (d.length < 10 || d.length > 13) return null;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

function firstName(name: string) {
  const f = name.trim().split(/\s+/)[0] ?? "";
  return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : "";
}

function fill(text: string, c: Customer) {
  return text.replace(/\{nome\}/gi, firstName(c.name));
}

function todaySP(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function birthParts(iso: string | null | undefined): { m: number; d: number } | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? { m, d } : null;
}

function daysUntilBirthday(iso: string | null | undefined, today: Date): number | null {
  const b = birthParts(iso);
  if (!b) return null;
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const day = b.m === 2 && b.d === 29 && new Date(year, 1, 29).getMonth() !== 1 ? 28 : b.d;
    const next = new Date(year, b.m - 1, day);
    if (next >= today) return Math.round((next.getTime() - today.getTime()) / 86400000);
  }
  return null;
}

function bairroOf(c: Customer): string {
  const b = c.address?.bairro;
  return typeof b === "string" ? b.trim() : "";
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Mesma mensagem = mesmo envio: as marcações "já recebeu" valem para ela.
function campaignKey(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `c${(h >>> 0).toString(36)}`;
}

function vcard(list: Customer[]): string {
  return list
    .map((c) => {
      const n = waNumber(c.phone);
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${c.name} (cliente Winner)`,
        `N:;${c.name} (cliente Winner);;;`,
        n ? `TEL;TYPE=CELL:+${n}` : "",
        c.birth_date ? `BDAY:${c.birth_date}` : "",
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");
}

export default function MensagensPage() {
  const { status, accessToken, currentOrganizationId } = useAuth();
  const router = useRouter();
  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [segment, setSegment] = useState<Segment>("aniv-mes");
  const [bairro, setBairro] = useState("");
  const [productId, setProductId] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [text, setText] = useState(BUILTIN[0].text);
  const [custom, setCustom] = useState<Template[]>([]);
  const [sent, setSent] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustom(readJson<Template[]>(TEMPLATES_KEY, []));
    setSent(readJson<Record<string, string[]>>(SENT_KEY, {}));
  }, []);

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId) return;
    setLoading(true);
    try {
      const [c, o, p] = await Promise.all([
        apiFetch<Customer[]>(`${orgPath}/customers`, { accessToken }),
        apiFetch<Order[]>(`${orgPath}/orders`, { accessToken }),
        apiFetch<Product[]>(`${orgPath}/products`, { accessToken }),
      ]);
      setCustomers(c);
      setOrders(o);
      setProducts(p);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, currentOrganizationId, orgPath]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [status, router, load]);

  const today = useMemo(() => todaySP(), []);
  const ordersBy = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of orders) m.set(o.customer_id, [...(m.get(o.customer_id) ?? []), o]);
    return m;
  }, [orders]);
  const bairros = useMemo(
    () => [...new Set(customers.map(bairroOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [customers]
  );
  const boughtProducts = useMemo(() => {
    const ids = new Set(orders.flatMap((o) => o.items.map((i) => i.product_id).filter(Boolean) as string[]));
    return products.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [orders, products]);

  const matches = useMemo(() => {
    const month = today.getMonth() + 1;
    const nextMonth = (month % 12) + 1;
    const list = customers.filter((c) => {
      switch (segment) {
        case "aniv-semana": {
          const d = daysUntilBirthday(c.birth_date, today);
          return d !== null && d <= 7;
        }
        case "aniv-mes":
          return birthParts(c.birth_date)?.m === month;
        case "aniv-proximo-mes":
          return birthParts(c.birth_date)?.m === nextMonth;
        case "sem-aniv":
          return !c.birth_date;
        case "bairro":
          return !!bairro && bairroOf(c).toLowerCase() === bairro.toLowerCase();
        case "produto":
          return !!productId && (ordersBy.get(c.id) ?? []).some((o) => o.items.some((i) => i.product_id === productId));
        case "site":
          return !!c.notes && /pelo site|link de cadastro/i.test(c.notes);
        case "sem-pedido":
          return !(ordersBy.get(c.id)?.length);
        default:
          return true;
      }
    });
    if (segment.startsWith("aniv")) {
      list.sort((a, b) => (daysUntilBirthday(a.birth_date, today) ?? 999) - (daysUntilBirthday(b.birth_date, today) ?? 999));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    return list;
  }, [customers, segment, bairro, productId, ordersBy, today]);

  const withPhone = matches.filter((c) => waNumber(c.phone));
  const noPhone = matches.length - withPhone.length;
  const selected = withPhone.filter((c) => !excluded.has(c.id));
  const key = campaignKey(text.trim());
  const sentIds = new Set(sent[key] ?? []);
  const pending = selected.filter((c) => !sentIds.has(c.id));
  const next = pending[0] ?? null;

  function markSent(id: string) {
    setSent((prev) => {
      const list = [...new Set([...(prev[key] ?? []), id])];
      const updated = { ...prev, [key]: list };
      writeJson(SENT_KEY, updated);
      return updated;
    });
  }

  function resetSent() {
    setSent((prev) => {
      const updated = { ...prev };
      delete updated[key];
      writeJson(SENT_KEY, updated);
      return updated;
    });
  }

  function openWhatsapp(c: Customer) {
    const n = waNumber(c.phone);
    if (!n) return;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(fill(text, c))}`, "_blank", "noopener");
    markSent(c.id);
  }

  function saveTemplate() {
    const title = window.prompt("Nome do modelo (ex.: Black Friday 2026):")?.trim();
    if (!title || !text.trim()) return;
    const list = [...custom.filter((t) => t.title !== title), { title, text: text.trim() }];
    setCustom(list);
    writeJson(TEMPLATES_KEY, list);
  }

  function deleteTemplate(title: string) {
    const list = custom.filter((t) => t.title !== title);
    setCustom(list);
    writeJson(TEMPLATES_KEY, list);
  }

  function downloadContacts() {
    const blob = new Blob([vcard(selected)], { type: "text/vcard" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clientes-winner-${selected.length}.vcf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const card = "rounded-xl border border-neutral-800 bg-neutral-950/50 p-4";
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-rose-500 bg-rose-600/20 text-rose-200" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"}`;

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Carregando…</p>
      </main>
    );
  }

  return (
    <AppShell title="Mensagens">
      <div className="mx-auto max-w-5xl space-y-5">
        <p className="text-sm text-neutral-400">
          Escolha quem recebe, escreva a mensagem e envie pelo WhatsApp um cliente por vez: o gestor abre a conversa já com o
          texto, você só aperta <b>Enviar</b> no WhatsApp e volta para o próximo. Nada é enviado sozinho — assim o número da
          Winner não corre risco de bloqueio.
        </p>
        {error && <p className="rounded bg-red-950 p-3 text-sm text-red-300">{error}</p>}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 1. Quem recebe */}
          <section className={`${card} space-y-3`}>
            <h2 className="font-semibold">1. Quem recebe</h2>
            <select
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value as Segment);
                setExcluded(new Set());
              }}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            >
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {segment === "bairro" && (
              <select value={bairro} onChange={(e) => setBairro(e.target.value)} className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2">
                <option value="">Escolha o bairro…</option>
                {bairros.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            {segment === "bairro" && bairros.length === 0 && (
              <p className="text-xs text-neutral-500">Ainda não há clientes com bairro (o bairro vem do link de cadastro).</p>
            )}
            {segment === "produto" && (
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2">
                <option value="">Escolha o produto…</option>
                {boughtProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-sm text-neutral-300">
              {loading ? (
                "Carregando clientes…"
              ) : (
                <>
                  <b className="text-white">{selected.length}</b> {selected.length === 1 ? "cliente selecionado" : "clientes selecionados"}
                  {noPhone > 0 && <span className="text-neutral-500"> · {noPhone} sem WhatsApp ficaram de fora</span>}
                </>
              )}
            </p>
            <ul className="max-h-72 divide-y divide-neutral-800 overflow-y-auto rounded-lg border border-neutral-800">
              {withPhone.length === 0 && !loading && <li className="p-3 text-sm text-neutral-500">Nenhum cliente nesse grupo.</li>}
              {withPhone.map((c) => {
                const d = daysUntilBirthday(c.birth_date, today);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!excluded.has(c.id)}
                      onChange={(e) =>
                        setExcluded((prev) => {
                          const s = new Set(prev);
                          if (e.target.checked) s.delete(c.id);
                          else s.add(c.id);
                          return s;
                        })
                      }
                      className="h-4 w-4 accent-rose-500"
                    />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {segment.startsWith("aniv") && d !== null && (
                      <span className="shrink-0 text-xs text-pink-300">
                        🎂 {c.birth_date!.slice(8, 10)}/{c.birth_date!.slice(5, 7)}
                        {d === 0 ? " · hoje" : d <= 7 ? ` · em ${d}d` : ""}
                      </span>
                    )}
                    {sentIds.has(c.id) && <span className="shrink-0 text-xs text-emerald-400">✓ enviada</span>}
                  </li>
                );
              })}
            </ul>
            <button
              onClick={downloadContacts}
              disabled={selected.length === 0}
              className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-40"
            >
              ⬇ Baixar contatos para salvar no celular (.vcf)
            </button>
            <p className="text-xs text-neutral-500">
              Abra o arquivo no celular para salvar todos de uma vez. Útil para montar listas de transmissão no WhatsApp Business
              (a transmissão só chega para quem salvou o número da Winner).
            </p>
          </section>

          {/* 2. Mensagem */}
          <section className={`${card} space-y-3`}>
            <h2 className="font-semibold">2. Mensagem</h2>
            <div className="flex flex-wrap gap-2">
              {BUILTIN.map((t) => (
                <button key={t.title} onClick={() => setText(t.text)} className={chip(text === t.text)}>
                  {t.title}
                </button>
              ))}
              {custom.map((t) => (
                <span key={t.title} className="inline-flex items-center">
                  <button onClick={() => setText(t.text)} className={chip(text === t.text)}>
                    ⭐ {t.title}
                  </button>
                  <button onClick={() => deleteTemplate(t.title)} aria-label={`Apagar modelo ${t.title}`} className="px-1.5 text-xs text-neutral-500 hover:text-red-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              maxLength={1500}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
              <span>
                Escreva <code className="rounded bg-neutral-800 px-1 text-neutral-300">{"{nome}"}</code> onde quiser o primeiro nome do cliente.
              </span>
              <button onClick={saveTemplate} className="text-blue-400 hover:underline">
                Salvar como modelo
              </button>
            </div>
            {selected[0] && (
              <div className="space-y-1">
                <p className="text-xs text-neutral-500">Como chega para {firstName(selected[0].name)}:</p>
                <p className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#005c4b] px-3 py-2 text-sm text-white">{fill(text, selected[0])}</p>
              </div>
            )}
          </section>
        </div>

        {/* 3. Enviar */}
        <section className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">3. Enviar</h2>
            <p className="text-sm text-neutral-400">
              {selected.length - pending.length} de {selected.length} enviadas
              {selected.length - pending.length > 0 && (
                <button onClick={resetSent} className="ml-3 text-xs text-neutral-500 hover:text-neutral-300 hover:underline">
                  recomeçar
                </button>
              )}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${selected.length ? ((selected.length - pending.length) / selected.length) * 100 : 0}%` }}
            />
          </div>
          {!text.trim() ? (
            <p className="text-sm text-neutral-500">Escreva a mensagem primeiro.</p>
          ) : next ? (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm">
                Próximo: <b className="text-white">{next.name}</b>
                {pending.length > 1 && <span className="text-neutral-500"> · depois mais {pending.length - 1}</span>}
              </p>
              <button
                onClick={() => {
                  setSending(true);
                  openWhatsapp(next);
                }}
                className="rounded-full bg-[#25d366] px-6 py-3 font-semibold text-white shadow hover:brightness-105"
              >
                Abrir WhatsApp de {firstName(next.name)}
              </button>
              <button onClick={() => markSent(next.id)} className="text-sm text-neutral-400 hover:underline">
                Pular
              </button>
            </div>
          ) : selected.length > 0 ? (
            <p className="rounded-lg bg-emerald-950/50 p-3 text-sm text-emerald-300">✓ Todos deste grupo já receberam esta mensagem.</p>
          ) : (
            <p className="text-sm text-neutral-500">Nenhum cliente selecionado.</p>
          )}
          {sending && next && (
            <p className="text-xs text-neutral-500">
              Depois de apertar Enviar no WhatsApp, volte para esta tela e toque em “Abrir WhatsApp” de novo para o próximo.
            </p>
          )}
          <p className="text-xs text-neutral-500">
            Dica: mande em blocos (por exemplo, 20 a 30 por vez) e só para quem já é cliente — mensagens demais para quem não
            conhece a loja podem fazer o WhatsApp limitar o número. As marcações de “enviada” ficam guardadas neste aparelho.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
