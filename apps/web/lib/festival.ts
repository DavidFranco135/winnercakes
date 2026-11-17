// Festival ao vivo: cardápio do dia com estoque de fatias e PDV no balcão.

import { apiFetch } from "@/lib/api-client";

export type FestivalStatus = "preparando" | "aberto" | "encerrado";

export interface FestivalItem {
  id: string;
  flavor: string;
  photo_url: string;
  price: number;
  slices_total: number;
  sold: number;
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
  items: { flavor: string; photo_url: string; price: number; remaining: number; sold_out: boolean }[];
  updated_at: string | null;
}

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "Pix",
};

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
