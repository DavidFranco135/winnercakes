// Festival ao vivo: cardápio do dia com estoque de fatias e PDV no balcão.

import { apiFetch } from "@/lib/api-client";

export type FestivalStatus = "preparando" | "aberto" | "encerrado";

export type ItemKind = "fatia" | "produto";

export interface FestivalItem {
  id: string;
  kind?: ItemKind;
  flavor: string;
  photo_url: string;
  price: number;
  slices_total: number;
  sold: number;
  sold_online?: number;
}

export type OnlineOrderStatus =
  | "aguardando"
  | "pago"
  | "retirado"
  | "expirado"
  | "cancelado"
  | "pago_sem_estoque"
  | "devolvido";

export const CREDIT_ID = "_fatia";
export type OnlineMode = "quantidade" | "sabor";

export interface FestivalOnlineOrder {
  id: string;
  token: string;
  code: string;
  name: string;
  phone: string;
  lines: FestivalSaleLine[];
  total: number;
  status: OnlineOrderStatus;
  created_at: string;
  hold_until: string;
  paid_at: string | null;
  redeemed_at: string | null;
  test_mode: boolean;
  picks?: FestivalSaleLine[];
  refunded_at?: string | null;
}

export interface FestivalSaleLine {
  item_id: string;
  flavor: string;
  qty: number;
  price: number;
}

export interface FestivalSale {
  id: string;
  at: string;
  channel: "balcao" | "online";
  lines: FestivalSaleLine[];
  total: number;
  method: string;
  received: number | null;
  canceled: boolean;
  canceled_at: string | null;
}

export interface FestivalState {
  date: string;
  public_enabled: boolean;
  online_enabled: boolean;
  online_mode?: OnlineMode;
  slice_price?: number;
  online_close_below?: number;
  orders: FestivalOnlineOrder[];
  status: FestivalStatus;
  counter_reserve_pct: number;
  max_per_order: number;
  items: FestivalItem[];
  sales: FestivalSale[];
  updated_at: string | null;
}

export interface PublicFestivalLive {
  date: string;
  status: FestivalStatus;
  items: {
    id: string;
    kind?: ItemKind;
    flavor: string;
    photo_url: string;
    price: number;
    remaining: number;
    sold_out: boolean;
    online_available: number;
  }[];
  online_enabled: boolean;
  online_mode?: OnlineMode;
  slice_price?: number;
  credits_available?: number;
  max_per_order: number;
  updated_at: string | null;
}

export interface PublicFestivalOrder {
  token: string;
  code: string;
  name: string;
  lines: FestivalSaleLine[];
  total: number;
  status: OnlineOrderStatus;
  created_at: string;
  hold_until: string;
  paid_at: string | null;
  redeemed_at: string | null;
  pix_code: string;
  pix_url: string;
  test_mode: boolean;
  picks?: FestivalSaleLine[];
  date: string;
}

export interface RedeemResult {
  result: "entregar" | "escolher" | "ja_retirado" | "nao_pago" | "nao_encontrado" | "sem_estoque" | "devolvido";
  message: string;
  order: FestivalOnlineOrder | null;
  state: FestivalState | null;
}

export interface MercadoPagoSettings {
  configured: boolean;
  test_mode: boolean;
  token_hint: string;
}

/** Fatias seguradas por pedidos do celular esperando o Pix. */
/** Fatias pagas (ou com Pix em andamento) pelo celular, sabor ainda a escolher. */
export function creditsOutstanding(orders: FestivalOnlineOrder[] | undefined, now = Date.now()): number {
  let total = 0;
  for (const o of orders ?? []) {
    const hold = o.status === "aguardando" && new Date(o.hold_until).getTime() > now;
    if (!hold && o.status !== "pago") continue;
    for (const l of o.lines) if (l.item_id === CREDIT_ID) total += l.qty;
  }
  return total;
}

export function heldByItem(orders: FestivalOnlineOrder[] | undefined, now = Date.now()): Record<string, number> {
  const held: Record<string, number> = {};
  for (const o of orders ?? []) {
    if (o.status !== "aguardando" || new Date(o.hold_until).getTime() <= now) continue;
    for (const l of o.lines) held[l.item_id] = (held[l.item_id] ?? 0) + l.qty;
  }
  return held;
}

const publicOrderPath = (slug: string) => `/api/v1/public/stores/${encodeURIComponent(slug)}/festival-orders`;

export function createFestivalOrder(
  slug: string,
  body: { name: string; phone: string; lines: { item_id: string; qty: number }[] }
): Promise<PublicFestivalOrder> {
  return apiFetch<PublicFestivalOrder>(publicOrderPath(slug), { method: "POST", body: JSON.stringify(body) });
}

export function getFestivalOrder(slug: string, token: string): Promise<PublicFestivalOrder> {
  return apiFetch<PublicFestivalOrder>(`${publicOrderPath(slug)}/${encodeURIComponent(token)}`);
}

export function cancelFestivalOrder(slug: string, token: string): Promise<PublicFestivalOrder> {
  return apiFetch<PublicFestivalOrder>(`${publicOrderPath(slug)}/${encodeURIComponent(token)}/cancel`, { method: "POST" });
}

// Tickets ficam guardados no celular do cliente: reabrir o site mostra "Meus pedidos".
const TICKETS_KEY = "festival_tickets";
export interface SavedTicket {
  slug: string;
  token: string;
  code: string;
  date: string;
}
export function savedTickets(slug: string): SavedTicket[] {
  try {
    const all = JSON.parse(localStorage.getItem(TICKETS_KEY) || "[]") as SavedTicket[];
    return all.filter((t) => t.slug === slug && t.date === todayBRT());
  } catch {
    return [];
  }
}
export function saveTicket(t: SavedTicket) {
  try {
    const all = (JSON.parse(localStorage.getItem(TICKETS_KEY) || "[]") as SavedTicket[]).filter(
      (x) => x.token !== t.token && x.date >= todayBRT()
    );
    localStorage.setItem(TICKETS_KEY, JSON.stringify([...all, t].slice(-20)));
  } catch {
    /* navegador sem armazenamento: o link do ticket continua valendo */
  }
}

export function ticketHref(slug: string, token: string): string {
  return `/pedido?s=${encodeURIComponent(slug)}&t=${encodeURIComponent(token)}`;
}

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "Pix",
};

/** "3 fatias" / "1 unid." conforme o tipo do item. */
export function unitLabel(kind: ItemKind | undefined, n: number): string {
  if (kind === "produto") return `${n} ${n === 1 ? "unid." : "unid."}`;
  return `${n} ${n === 1 ? "fatia" : "fatias"}`;
}

export function remaining(item: FestivalItem): number {
  return Math.max(0, item.slices_total - item.sold);
}

export function todayBRT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function newSaleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export async function loadPublicFestival(slug: string): Promise<PublicFestivalLive | null> {
  const res = await apiFetch<{ live: PublicFestivalLive | null }>(
    `/api/v1/public/stores/${encodeURIComponent(slug)}/festival-live`
  );
  return res.live;
}
