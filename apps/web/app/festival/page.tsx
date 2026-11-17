"use client";

// Festival ao vivo: cadastro das fatias do dia, PDV do balcão (tablet ou
// celular) e resumo de vendas. Cada venda leva um id gerado aqui: se a internet
// cair no meio, reenviar não vende duas vezes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AppShell } from "@/components/AppShell";
import type { StoreAdminResponse, StoreFestival, StoreFlavor } from "@/lib/store";
import { festivalDateParts, formatBRL, upcomingFestivals } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import type { FestivalItem, FestivalOnlineOrder, FestivalSale, FestivalState, FestivalStatus, MercadoPagoSettings, RedeemResult } from "@/lib/festival";
import { CREDIT_ID, PAYMENT_LABELS, creditsOutstanding, heldByItem, newSaleId, remaining, todayBRT, unitLabel } from "@/lib/festival";
import { QrScanner } from "@/components/QrScanner";
import { playAlert, playChime, unlockChime } from "@/lib/chime";
import QRCode from "qrcode";

type Tab = "vender" | "retirada" | "cardapio" | "resumo";

const ORDER_STATUS: Record<string, string> = {
  aguardando: "Esperando Pix",
  pago: "Pago · a retirar",
  retirado: "Retirado",
  expirado: "Expirou",
  cancelado: "Cancelado",
  pago_sem_estoque: "Pago sem fatia — devolver",
  devolvido: "Pix devolvido",
};
type Method = "dinheiro" | "cartao" | "pix";
interface PendingSale {
  day: string;
  body: { id: string; lines: { item_id: string; qty: number }[]; method: Method; received: number | null };
}

const PENDING_KEY = "festival_pending_sales";
const STATUS_LABELS: Record<FestivalStatus, string> = {
  preparando: "Preparando",
  aberto: "Aberto",
  encerrado: "Encerrado",
};

function readPending(): PendingSale[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]") as PendingSale[];
  } catch {
    return [];
  }
}
function writePending(list: PendingSale[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento: segue só em memória */
  }
}

function slugId(name: string, used: Set<string>): string {
  const base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "sabor";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function dayLabel(day: string): string {
  const p = festivalDateParts(day);
  return `${p.relative ? `${p.relative} · ` : ""}${p.weekday} ${p.short}`;
}

export default function FestivalPage() {
  const { status, accessToken, currentOrganizationId, organizations } = useAuth();
  // Funcionário do caixa: só vende, confere tickets e vê o resumo.
  const myRole = organizations.find((m) => m.organization.id === currentOrganizationId)?.role;
  const isStaff = myRole === "CAIXA";
  const canManage = myRole === "OWNER" || myRole === "ADMIN" || myRole === "MANAGER";
  const router = useRouter();
  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;

  const [festivals, setFestivals] = useState<StoreFestival[]>([]);
  const [flavors, setFlavors] = useState<StoreFlavor[]>([]);
  const [day, setDay] = useState<string>("");
  const [state, setState] = useState<FestivalState | null>(null);
  const [tab, setTab] = useState<Tab>("vender");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Rascunho do cardápio (aba Cardápio) — só vai para o servidor ao salvar.
  const [draftEdit, setDraftEdit] = useState<FestivalState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slicesPerCake, setSlicesPerCake] = useState(16);
  const [newProd, setNewProd] = useState({ name: "", price: "", qty: "" });
  // Modo PDV em tela cheia (sem menu lateral). Fica lembrado no aparelho.
  const [kiosk, setKiosk] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("festival_kiosk") === "1";
    } catch {
      return false;
    }
  });

  // PDV
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>("dinheiro");
  const [received, setReceived] = useState("");
  const [selling, setSelling] = useState(false);
  const [toast, setToast] = useState<{ title: string; detail: string; tone: "ok" | "pix" } | null>(null);
  const seenPaid = useRef<{ day: string; ids: Set<string> } | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);
  const [pickCart, setPickCart] = useState<Record<string, number>>({});
  const [refunding, setRefunding] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [mp, setMp] = useState<MercadoPagoSettings | null>(null);
  const [mpToken, setMpToken] = useState("");
  const [mpTest, setMpTest] = useState(true);
  const [pending, setPending] = useState<PendingSale[]>(() => (typeof window === "undefined" ? [] : readPending()));
  const flushing = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // Datas: festivais cadastrados em Minha Loja (hoje e próximos).
  useEffect(() => {
    if (status !== "authenticated" || !accessToken || !currentOrganizationId) return;
    apiFetch<StoreAdminResponse>(`${orgPath}/store`, { accessToken })
      .then((res) => {
        const list = res.settings.festivals ?? [];
        setFestivals(list);
        setFlavors(res.settings.flavors ?? []);
        const today = todayBRT();
        const next = upcomingFestivals(list)[0];
        setDay((d) => d || (list.some((f) => f.date === today) ? today : next?.date ?? today));
      })
      .catch(() => setDay((d) => d || todayBRT()));
    apiFetch<MercadoPagoSettings>(`${orgPath}/payments/mercadopago`, { accessToken })
      .then((m) => {
        setMp(m);
        setMpTest(m.test_mode);
      })
      .catch(() => setMp(null));
  }, [status, accessToken, currentOrganizationId, orgPath]);

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId || !day) return;
    try {
      const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${day}`, { accessToken });
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão. Tentando de novo…");
    }
  }, [accessToken, currentOrganizationId, orgPath, day]);

  useEffect(() => {
    const t = setTimeout(() => {
      setState(null);
      setDraftEdit(null);
      setDirty(false);
      setCart({});
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Outro tablet vendendo junto: atualiza o estoque a cada 10 s.
  useEffect(() => {
    if (tab === "cardapio") return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [tab, load]);

  // Pix do celular confirmado: aviso na tela + sininho. Na primeira carga só
  // memoriza os que já estavam pagos (não toca por pedidos antigos).
  useEffect(() => {
    if (!state) return;
    const paid = state.orders.filter((o) => o.status === "pago" || o.status === "retirado");
    if (seenPaid.current === null || seenPaid.current.day !== state.date) {
      seenPaid.current = { day: state.date, ids: new Set(paid.map((o) => o.id)) };
      return;
    }
    const seen = seenPaid.current.ids;
    const fresh = paid.filter((o) => !seen.has(o.id));
    for (const o of fresh) seen.add(o.id);
    if (fresh.length > 0) {
      const o = fresh[fresh.length - 1];
      const t = setTimeout(() => {
        setToast({
          title: "Pix recebido pelo celular",
          detail: `${o.code} · ${o.name} · ${formatBRL(o.total)} — ${o.lines.map((l) => `${l.qty}× ${l.flavor}`).join(", ")}`,
          tone: "pix",
        });
        playChime();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Libera o som no primeiro toque na tela (exigência dos navegadores).
  useEffect(() => {
    const on = () => unlockChime();
    window.addEventListener("pointerdown", on, { once: true });
    return () => window.removeEventListener("pointerdown", on);
  }, []);

  // Sem edição pendente, o cardápio mostrado é o do servidor.
  const draft = dirty ? draftEdit : state;

  // Tela do tablet não apaga durante o festival.
  useEffect(() => {
    if (tab !== "vender") return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [tab]);

  // Vendas que ficaram sem internet: reenvia sozinho (o id evita duplicar).
  const flushPending = useCallback(async () => {
    if (flushing.current || !accessToken) return;
    const list = readPending();
    if (list.length === 0) {
      setPending([]);
      return;
    }
    flushing.current = true;
    const left: PendingSale[] = [];
    for (const p of list) {
      try {
        const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${p.day}/sales`, {
          method: "POST",
          accessToken,
          body: JSON.stringify(p.body),
        });
        if (p.day === day) setState(data);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`Uma venda guardada sem internet não entrou: ${err.message}`);
        } else {
          left.push(p);
        }
      }
    }
    writePending(left);
    setPending(left);
    flushing.current = false;
  }, [accessToken, orgPath, day]);

  useEffect(() => {
    const id = setInterval(flushPending, 8000);
    window.addEventListener("online", flushPending);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", flushPending);
    };
  }, [flushPending]);

  const items = useMemo(() => state?.items ?? [], [state]);
  const paidWaiting = (state?.orders ?? []).filter((o) => o.status === "pago").length;
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const pendingQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of pending) if (p.day === day) for (const l of p.body.lines) m[l.item_id] = (m[l.item_id] ?? 0) + l.qty;
    return m;
  }, [pending, day]);
  const held = useMemo(() => heldByItem(state?.orders), [state]);
  const reservedCredits = useMemo(() => creditsOutstanding(state?.orders), [state]);
  const left = (it: FestivalItem) => Math.max(0, remaining(it) - (held[it.id] ?? 0) - (pendingQty[it.id] ?? 0));

  const cartLines = Object.entries(cart).filter(([, q]) => q > 0);
  const cartTotal = cartLines.reduce((s, [id, q]) => s + q * (itemById.get(id)?.price ?? 0), 0);
  const cartSlices = cartLines.reduce((s, [, q]) => s + q, 0);
  const receivedNum = Number(received.replace(",", ".")) || 0;
  const change = method === "dinheiro" && receivedNum > 0 ? receivedNum - cartTotal : null;

  function add(it: FestivalItem, delta: number) {
    setCart((c) => {
      const next = Math.max(0, Math.min(left(it), (c[it.id] ?? 0) + delta));
      return { ...c, [it.id]: next };
    });
  }

  async function finishSale() {
    if (!accessToken || cartLines.length === 0 || selling) return;
    if (method === "dinheiro" && receivedNum > 0 && receivedNum < cartTotal) {
      setError("O valor recebido é menor que o total.");
      return;
    }
    const body: PendingSale["body"] = {
      id: newSaleId(),
      lines: cartLines.map(([item_id, qty]) => ({ item_id, qty })),
      method,
      received: method === "dinheiro" && receivedNum > 0 ? receivedNum : null,
    };
    setSelling(true);
    setError(null);
    try {
      const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${day}/sales`, {
        method: "POST",
        accessToken,
        body: JSON.stringify(body),
      });
      setState(data);
      setCart({});
      setReceived("");
      setToast({
        title: "Venda concluída",
        detail: `${formatBRL(cartTotal)} · ${PAYMENT_LABELS[method]}${change != null && change > 0 ? ` · troco ${formatBRL(change)}` : ""}`,
        tone: "ok",
      });
      playChime();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        load();
      } else {
        // Sem internet: guarda e reenvia sozinho quando a conexão voltar.
        const list = [...readPending(), { day, body }];
        writePending(list);
        setPending(list);
        setCart({});
        setReceived("");
        setNotice("Sem internet: venda guardada no aparelho, envio automático quando voltar.");
      }
    } finally {
      setSelling(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function cancelSale(sale: FestivalSale) {
    if (!accessToken) return;
    const desc = sale.lines.map((l) => `${l.qty}× ${l.flavor}`).join(", ");
    if (!window.confirm(`Cancelar a venda das ${timeLabel(sale.at)} (${desc})? As fatias voltam para o estoque.`)) return;
    try {
      const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${day}/sales/${sale.id}/cancel`, {
        method: "POST",
        accessToken,
      });
      setState(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão para cancelar agora.");
    }
  }

  useEffect(() => {
    if (!kiosk) return;
    document.documentElement.classList.add("app-scale");
    return () => document.documentElement.classList.remove("app-scale");
  }, [kiosk]);

  function toggleKiosk() {
    const next = !kiosk;
    setKiosk(next);
    try {
      localStorage.setItem("festival_kiosk", next ? "1" : "0");
    } catch {
      /* sem armazenamento */
    }
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (next) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else el.webkitRequestFullscreen?.();
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      doc.webkitExitFullscreen?.();
    }
  }

  // ---- Retirada (ticket do celular) ----
  const redeemCode = useCallback(
    async (code: string, picks?: { item_id: string; qty: number }[]) => {
      if (!accessToken || !code.trim()) return;
      setRedeeming(true);
      try {
        const r = await apiFetch<RedeemResult>(`${orgPath}/festival-live/${day}/redeem`, {
          method: "POST",
          accessToken,
          body: JSON.stringify({ code: code.trim(), picks: picks ?? null }),
        });
        setRedeemResult(r);
        setPickCart({});
        if (r.state) setState(r.state);
        if (r.result === "entregar") playChime();
        else if (r.result !== "escolher") playAlert();
      } catch (err) {
        if (picks && err instanceof ApiError) {
          // Sabor acabou no meio da escolha: mantém o ticket na tela.
          setError(err.message);
          load();
          return;
        }
        setRedeemResult({
          result: "nao_encontrado",
          message: err instanceof ApiError ? err.message : "Sem internet: não dá para conferir o ticket agora.",
          order: null,
          state: null,
        });
      } finally {
        setRedeeming(false);
        setManualCode("");
      }
    },
    [accessToken, orgPath, day, load]
  );

  // Caixa pausa/religa a venda pelo celular olhando o tamanho da fila.
  async function setOnline(enabled: boolean) {
    if (!accessToken) return;
    try {
      const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${day}/online`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({ enabled }),
      });
      setState(data);
      setToast({
        title: enabled ? "Venda pelo celular ligada" : "Venda pelo celular pausada",
        detail: enabled ? "Quem está na fila volta a poder pagar pelo celular." : "Agora só vende no balcão/vitrine.",
        tone: "ok",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão agora.");
    }
  }

  async function refundOrder(o: FestivalOnlineOrder) {
    if (!accessToken) return;
    if (!window.confirm(`Devolver o Pix de ${formatBRL(o.total)} para ${o.name} (${o.code})? O pedido fica cancelado.`)) return;
    setRefunding(true);
    try {
      const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${day}/orders/${o.id}/refund`, {
        method: "POST",
        accessToken,
      });
      setState(data);
      setRedeemResult(null);
      setToast({ title: "Pix devolvido", detail: `${o.code} · ${o.name} · ${formatBRL(o.total)}`, tone: "pix" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão: não deu para devolver agora.");
    } finally {
      setRefunding(false);
    }
  }

  // Cartaz com o QR da fila: abre a loja direto no cardápio ao vivo.
  async function printQueuePoster() {
    const url = `${window.location.origin}/#ao-vivo`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 900, errorCorrectionLevel: "M" });
    const w = window.open("", "_blank");
    if (!w) {
      setError("Libere pop-ups para imprimir o cartaz.");
      return;
    }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR da fila</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, sans-serif; text-align: center; color: #3a1a12; margin: 0; }
  h1 { font-size: 46px; margin: 18px 0 6px; color: #c8102e; }
  p { font-size: 24px; margin: 6px 0; }
  img { width: 120mm; height: 120mm; margin: 18px auto; display: block; }
  ol { text-align: left; display: inline-block; font-size: 22px; line-height: 1.6; }
  small { display: block; margin-top: 14px; font-size: 14px; color: #8a6a60; }
</style></head><body>
  <h1>Pule a fila do caixa!</h1>
  <p>Aponte a câmera do celular para o QR</p>
  <img src="${qr}" alt="QR">
  <ol><li>Escolha suas fatias</li><li>Pague com Pix</li><li>Retire na banca mostrando o QR do ticket</li></ol>
  <small>${url.replace(/^https?:\/\//, "")}</small>
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`);
    w.document.close();
  }

  async function saveMp() {
    if (!accessToken) return;
    try {
      const m = await apiFetch<MercadoPagoSettings>(`${orgPath}/payments/mercadopago`, {
        method: "PUT",
        accessToken,
        body: JSON.stringify({ access_token: mpToken.trim() || null, test_mode: mpTest }),
      });
      setMp(m);
      setMpToken("");
      setNotice("Mercado Pago salvo");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão. Não foi salvo.");
    }
  }

  // ---- Cardápio ----
  function editDraft(fn: (d: FestivalState) => FestivalState) {
    const base = dirty ? draftEdit : state;
    if (!base) return;
    setDraftEdit(fn(base));
    setDirty(true);
  }
  function editItem(id: string, patch: Partial<FestivalItem>) {
    editDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }
  function addFlavor(name: string, photo = "", kind: "fatia" | "produto" = "fatia", price?: number) {
    if (!name.trim()) return;
    editDraft((d) => {
      const used = new Set(d.items.map((i) => i.id));
      const samePrice = d.items.find((i) => (i.kind ?? "fatia") === kind)?.price ?? 0;
      return {
        ...d,
        items: [
          ...d.items,
          { id: slugId(name, used), kind, flavor: name.trim(), photo_url: photo, price: price ?? (kind === "fatia" ? samePrice : 0), slices_total: 0, sold: 0 },
        ],
      };
    });
  }

  async function saveDraft(next?: FestivalState) {
    const d = next ?? draft;
    if (!accessToken || !d) return;
    const bad = d.items.find((i) => i.slices_total < i.sold);
    if (bad) {
      setError(`${bad.flavor}: já foram vendidas ${bad.sold} fatias, o total não pode ser menor.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<FestivalState>(`${orgPath}/festival-live/${day}`, {
        method: "PUT",
        accessToken,
        body: JSON.stringify({
          public_enabled: d.public_enabled,
          online_enabled: d.online_enabled,
          status: d.status,
          counter_reserve_pct: d.counter_reserve_pct,
          online_mode: d.online_mode ?? "quantidade",
          slice_price: d.slice_price ?? 0,
          online_close_below: d.online_close_below ?? 10,
          max_per_order: d.max_per_order,
          items: d.items.map(({ id, kind, flavor, photo_url, price, slices_total }) => ({ id, kind: kind ?? "fatia", flavor, photo_url, price, slices_total })),
        }),
      });
      setDirty(false);
      setState(data);
      setDraftEdit(null);
      setNotice("Cardápio salvo");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sem conexão. Não foi salvo.");
    } finally {
      setSaving(false);
    }
  }

  // Liga/desliga e status: salvam na hora (são botões de uso no dia).
  function quickToggle(patch: Partial<FestivalState>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraftEdit(next);
    setDirty(true);
    saveDraft(next);
  }

  // ---- Resumo ----
  const summary = useMemo(() => {
    const valid = (state?.sales ?? []).filter((s) => !s.canceled);
    const byMethod: Record<string, number> = {};
    let revenue = 0;
    let slices = 0;
    for (const s of valid) {
      revenue += s.total;
      byMethod[s.method] = (byMethod[s.method] ?? 0) + s.total;
      for (const l of s.lines) slices += l.qty;
    }
    for (const o of state?.orders ?? []) {
      if (o.status !== "pago" && o.status !== "retirado") continue;
      revenue += o.total;
      byMethod.online = (byMethod.online ?? 0) + o.total;
      for (const l of o.lines) slices += l.qty;
    }
    const onlineCount = (state?.orders ?? []).filter((o) => o.status === "pago" || o.status === "retirado").length;
    return { count: valid.length + onlineCount, revenue, slices, byMethod, canceled: (state?.sales ?? []).length - valid.length };
  }, [state]);

  const dateOptions = useMemo(() => {
    const today = todayBRT();
    const set = new Set<string>([today, ...upcomingFestivals(festivals).map((f) => f.date)]);
    if (day) set.add(day);
    return [...set].sort();
  }, [festivals, day]);
  const festivalOfDay = festivals.find((f) => f.date === day);

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Carregando…</p>
      </main>
    );
  }

  const flavorsNotInMenu = flavors.filter((f) => !(draft?.items ?? []).some((i) => i.flavor.toLowerCase() === f.name.toLowerCase()));

  const content = (
      <div className={`mx-auto space-y-5 ${kiosk ? "max-w-none" : "max-w-6xl"}`}>
        {toast && (
          <div className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex justify-center">
            <div
              className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur ${
                toast.tone === "pix" ? "bg-sky-700/95" : "bg-emerald-700/95"
              }`}
              onClick={() => setToast(null)}
              role="status"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl">{toast.tone === "pix" ? "📱" : "✓"}</span>
              <span className="min-w-0">
                <span className="block text-lg font-bold">{toast.title}</span>
                <span className="block text-sm opacity-90">{toast.detail}</span>
              </span>
            </div>
          </div>
        )}
        {/* Data + abas: quebra em linhas no celular/tablet, nada de rolar para o lado */}
        <div className="flex flex-wrap items-center gap-2">
          {kiosk && <span className="mr-2 whitespace-nowrap text-xl font-bold">PDV · Winner Cakes</span>}
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className={`min-w-0 max-w-full flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 sm:flex-none ${kiosk ? "text-base" : "text-sm"}`}
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
                {festivals.find((f) => f.date === d) ? ` · ${festivals.find((f) => f.date === d)!.place}` : ""}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="hidden rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm sm:block"
            aria-label="Outra data"
          />
          <button
            onClick={toggleKiosk}
            title={kiosk ? "Sair da tela cheia" : "Tela cheia (PDV)"}
            className={`ml-auto flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${kiosk ? "border-neutral-600 text-neutral-200" : "border-blue-600 bg-blue-600/15 text-blue-200"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
              {kiosk ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
            <span>{kiosk ? "Sair" : "Tela cheia"}</span>
          </button>
        </div>
        <div className={`grid ${isStaff ? "grid-cols-3" : "grid-cols-4"} gap-1 rounded-xl border border-neutral-800 bg-neutral-950 p-1 ${kiosk ? "text-lg" : "text-sm sm:text-base"}`}>
          {(isStaff ? (["vender", "retirada", "resumo"] as Tab[]) : (["vender", "retirada", "cardapio", "resumo"] as Tab[])).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2 py-3 font-semibold leading-tight ${tab === t ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {t === "vender" ? "Vender" : t === "retirada" ? "Retirada" : t === "cardapio" ? "Cardápio" : "Resumo"}
              {t === "retirada" && paidWaiting > 0 && (
                <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 text-xs text-white">{paidWaiting}</span>
              )}
            </button>
          ))}
        </div>

        {festivalOfDay && (
          <p className="text-sm text-neutral-400">
            {festivalOfDay.place}
            {festivalOfDay.time ? ` · ${festivalOfDay.time}` : ""}
          </p>
        )}

        {/* Status rápido (só quem gerencia muda; o caixa só vê) */}
        {draft && !canManage && (
          <p className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-neutral-300">
            Situação: <strong>{STATUS_LABELS[draft.status]}</strong>
            {draft.online_enabled ? " · venda pelo celular ligada" : ""}
          </p>
        )}
        {draft && canManage && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-sm">
            <span className="text-neutral-400">Situação:</span>
            {(["preparando", "aberto", "encerrado"] as FestivalStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => quickToggle({ status: s })}
                className={`rounded-full px-3 py-1.5 font-medium ${
                  draft.status === s
                    ? s === "aberto"
                      ? "bg-emerald-600 text-white"
                      : s === "encerrado"
                        ? "bg-neutral-600 text-white"
                        : "bg-amber-600 text-white"
                    : "border border-neutral-700 text-neutral-300"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.public_enabled}
                onChange={(e) => quickToggle({ public_enabled: e.target.checked })}
                className="h-4 w-4"
              />
              Mostrar fatias ao vivo no site
            </label>
            <label className={`flex items-center gap-2 ${mp?.configured ? "cursor-pointer" : "opacity-40"}`} title={mp?.configured ? "" : "Configure o Mercado Pago em Cardápio do dia"}>
              <input
                type="checkbox"
                checked={draft.online_enabled}
                disabled={!mp?.configured}
                onChange={(e) => quickToggle({ online_enabled: e.target.checked, public_enabled: e.target.checked ? true : draft.public_enabled })}
                className="h-4 w-4"
              />
              Venda pelo celular (Pix)
              {mp?.configured && mp.test_mode && <span className="rounded bg-amber-600 px-1.5 text-[10px] font-bold text-white">TESTE</span>}
            </label>
          </div>
        )}
        {(state?.orders ?? []).some((o) => o.status === "pago_sem_estoque") && (
          <p className="rounded-lg bg-amber-950 p-2 text-sm text-amber-300">
            Há pedido pago pelo celular sem fatia disponível (o Pix caiu depois do prazo e o sabor esgotou). Devolva o Pix pelo app do Mercado Pago — veja em Resumo.
          </p>
        )}

        {state && (tab === "vender" || tab === "retirada") && (state.online_enabled || (state.orders ?? []).length > 0) && (
          <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${state.online_enabled ? "border-emerald-800 bg-emerald-950/40" : "border-neutral-700 bg-neutral-900/60"}`}>
            <span className={`h-3 w-3 rounded-full ${state.online_enabled ? "animate-pulse bg-emerald-400" : "bg-neutral-500"}`} />
            <span className="min-w-0 flex-1 text-sm sm:text-base">
              <strong>Venda pelo celular {state.online_enabled ? "ligada" : "pausada"}</strong>
              <span className="block text-xs text-neutral-400 sm:text-sm">
                Livres na vitrine: {Math.max(0, items.filter((i) => (i.kind ?? "fatia") === "fatia").reduce((n, i) => n + Math.max(0, remaining(i) - (held[i.id] ?? 0)), 0) - reservedCredits)} ·
                pagas pelo celular a retirar: {reservedCredits}
                {state.online_enabled ? " · fila grande perto do fim? Pause." : ""}
              </span>
            </span>
            <button
              onClick={() => setOnline(!state.online_enabled)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${state.online_enabled ? "bg-amber-500 text-neutral-950" : "bg-emerald-600 text-white"}`}
            >
              {state.online_enabled ? "Pausar celular" : "Religar celular"}
            </button>
          </div>
        )}

        {pending.length > 0 && (
          <p className="rounded-lg bg-amber-950 p-2 text-sm text-amber-300">
            {pending.length} {pending.length === 1 ? "venda guardada" : "vendas guardadas"} sem internet — envio automático quando a conexão voltar.
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-950 p-2 text-sm text-red-300" onClick={() => setError(null)}>
            {error}
          </p>
        )}
        {notice && <p className="rounded-lg bg-emerald-950 p-2 text-sm text-emerald-300">{notice}</p>}

        {!state && !error && <p className="text-neutral-400">Carregando…</p>}

        {/* ---------------- VENDER ---------------- */}
        {state && tab === "vender" && (
          items.filter((i) => i.slices_total > 0).length === 0 ? (
            <div className="rounded-xl border border-neutral-800 p-6 text-center text-neutral-300">
              <p>Nada no cardápio deste dia ainda (fatias ou bebidas com quantidade).</p>
              <button onClick={() => setTab("cardapio")} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium">
                Montar o cardápio do dia
              </button>
            </div>
          ) : (
            <div className={`grid gap-5 ${kiosk ? "lg:grid-cols-[1fr_400px]" : "lg:grid-cols-[1fr_340px]"}`}>
              <div className="space-y-5">
                {reservedCredits > 0 && (
                  <p className="rounded-xl border border-sky-800 bg-sky-950/60 px-4 py-3 text-sm text-sky-200">
                    🔒 {reservedCredits} {reservedCredits === 1 ? "fatia está garantida" : "fatias estão garantidas"} para tickets pagos pelo celular (o cliente escolhe o sabor na vitrine). O caixa não consegue vender essas.
                  </p>
                )}
                {(
                  [
                    ["fatia", "Fatias"],
                    ["produto", "Bebidas e outros"],
                  ] as const
                ).map(([kind, label]) => {
                  const list = items.filter((i) => (i.kind ?? "fatia") === kind && i.slices_total > 0);
                  if (list.length === 0) return null;
                  return (
                    <div key={kind} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
                      <div className={`grid content-start gap-3 ${kiosk ? "grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"}`}>
                        {list.map((it) => {
                          const l = left(it);
                          const inCart = cart[it.id] ?? 0;
                          const out = l === 0;
                          const product = kind === "produto";
                          return (
                            <button
                              key={it.id}
                              onClick={() => add(it, 1)}
                              disabled={out || inCart >= l}
                              className={`relative flex ${product ? (kiosk ? "h-32" : "h-28") : kiosk ? "h-44" : "h-36"} flex-col justify-end overflow-hidden rounded-2xl border p-3 text-left transition active:scale-[0.97] ${
                                out ? "border-neutral-800 opacity-40" : inCart > 0 ? "border-blue-500 ring-2 ring-blue-500" : "border-neutral-700"
                              } ${product && !it.photo_url ? "bg-gradient-to-br from-sky-900 to-neutral-900" : ""}`}
                            >
                              {it.photo_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imgSrc(it.photo_url, IMG_WIDTH.thumb)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
                              )}
                              <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                              <span
                                className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                                  out ? "bg-neutral-700 text-white" : l <= 3 ? "bg-red-600 text-white" : "bg-white text-neutral-900"
                                }`}
                              >
                                {out ? "Esgotado" : unitLabel(it.kind, l)}
                              </span>
                              {inCart > 0 && (
                                <span className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                  {inCart}
                                </span>
                              )}
                              <span className={`relative font-semibold leading-tight text-white ${kiosk ? "text-xl" : "text-base"}`}>{it.flavor}</span>
                              <span className={`relative text-neutral-200 ${kiosk ? "text-base" : "text-sm"}`}>{formatBRL(it.price)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pedido */}
              <div className={`space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 lg:sticky lg:top-4 lg:self-start ${kiosk ? "text-base" : ""}`}>
                <p className="text-sm font-semibold text-neutral-300">Pedido</p>
                {cartLines.length === 0 ? (
                  <p className="text-sm text-neutral-500">Toque nos sabores para adicionar.</p>
                ) : (
                  <ul className="space-y-2">
                    {cartLines.map(([id, q]) => {
                      const it = itemById.get(id);
                      if (!it) return null;
                      return (
                        <li key={id} className="flex items-center gap-2 text-sm">
                          <button onClick={() => add(it, -1)} className="h-9 w-9 rounded-lg border border-neutral-700 text-lg">−</button>
                          <span className="w-6 text-center font-semibold">{q}</span>
                          <button onClick={() => add(it, 1)} disabled={q >= left(it)} className="h-9 w-9 rounded-lg border border-neutral-700 text-lg disabled:opacity-30">+</button>
                          <span className="min-w-0 flex-1 truncate">{it.flavor}</span>
                          <span className="text-neutral-300">{formatBRL(q * it.price)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex items-baseline justify-between border-t border-neutral-800 pt-3">
                  <span className="text-sm text-neutral-400">{cartSlices} {cartSlices === 1 ? "item" : "itens"}</span>
                  <span className="text-2xl font-bold">{formatBRL(cartTotal)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["dinheiro", "cartao", "pix"] as Method[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`rounded-lg py-2.5 text-sm font-medium ${method === m ? "bg-blue-600 text-white" : "border border-neutral-700 text-neutral-300"}`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>

                {method === "dinheiro" && cartTotal > 0 && (
                  <div className="space-y-2">
                    <input
                      inputMode="decimal"
                      placeholder="Valor recebido (para o troco)"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      {[10, 20, 50, 100].filter((v) => v >= cartTotal).map((v) => (
                        <button key={v} onClick={() => setReceived(String(v))} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm">
                          R$ {v}
                        </button>
                      ))}
                    </div>
                    {change != null && (
                      <p className={`text-sm font-semibold ${change < 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {change < 0 ? `Faltam ${formatBRL(-change)}` : `Troco: ${formatBRL(change)}`}
                      </p>
                    )}
                  </div>
                )}
                {method === "pix" && cartTotal > 0 && (
                  <p className="text-xs text-amber-300/90">
                    Confira o Pix no app do banco antes de entregar — comprovante na tela do cliente não garante que caiu.
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCart({});
                      setReceived("");
                    }}
                    disabled={cartLines.length === 0}
                    className="rounded-lg border border-neutral-700 px-3 py-3 text-sm disabled:opacity-40"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={finishSale}
                    disabled={cartLines.length === 0 || selling}
                    className="flex-1 rounded-lg bg-emerald-600 py-3 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {selling ? "Registrando…" : "Finalizar venda"}
                  </button>
                </div>

                {state.sales.length > 0 && (
                  <div className="space-y-1.5 border-t border-neutral-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Últimas vendas</p>
                    {[...state.sales].reverse().slice(0, 8).map((s) => (
                      <div key={s.id} className={`flex items-center gap-2 text-xs ${s.canceled ? "text-neutral-600 line-through" : "text-neutral-300"}`}>
                        <span className="w-10 shrink-0">{timeLabel(s.at)}</span>
                        <span className="min-w-0 flex-1 truncate">{s.lines.map((l) => `${l.qty}× ${l.flavor}`).join(", ")}</span>
                        <span>{formatBRL(s.total)}</span>
                        {!s.canceled && (
                          <button onClick={() => cancelSale(s)} className="text-red-400 hover:text-red-300" aria-label="Cancelar venda">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ---------------- RETIRADA ---------------- */}
        {state && tab === "retirada" && (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Com um ticket na tela, a câmera some: o resultado fica em cima, sem rolar. */}
            <div className={`space-y-3 ${redeemResult ? "hidden lg:block" : ""}`}>
              <QrScanner onCode={redeemCode} paused={redeeming || redeemResult !== null} />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  redeemCode(manualCode);
                }}
                className="flex gap-2"
              >
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Nº do pedido (ex.: 27)"
                  inputMode="numeric"
                  className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-xl"
                />
                <button className="rounded-xl bg-blue-600 px-6 text-lg font-semibold">Conferir</button>
              </form>
              <p className="text-sm text-neutral-400">Pelo número, confira também o nome do cliente.</p>
            </div>
            <div>
              {redeemResult && redeemResult.result === "escolher" && redeemResult.order ? (
                (() => {
                  const o = redeemResult.order;
                  const credit = o.lines.filter((l) => l.item_id === CREDIT_ID).reduce((n, l) => n + l.qty, 0);
                  const extras = o.lines.filter((l) => l.item_id !== CREDIT_ID);
                  const chosen = Object.values(pickCart).reduce((n, q) => n + q, 0);
                  const slices = items.filter((i) => (i.kind ?? "fatia") === "fatia" && i.slices_total > 0);
                  return (
                    <div className="space-y-4 rounded-2xl bg-sky-700 p-5 text-white">
                      <p className="text-3xl font-black leading-tight sm:text-4xl">✓ PAGO · escolher sabores</p>
                      <p className="text-2xl font-bold">
                        {o.code} · {o.name}
                      </p>
                      <p className="text-lg">
                        Toque nos sabores que o cliente escolheu: <strong>{chosen} de {credit}</strong>
                        {extras.length > 0 && <> · e entregar também: {extras.map((l) => `${l.qty}× ${l.flavor}`).join(", ")}</>}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {slices.map((it) => {
                          const l = Math.max(0, remaining(it) - (held[it.id] ?? 0));
                          const n = pickCart[it.id] ?? 0;
                          return (
                            <button
                              key={it.id}
                              disabled={l - n <= 0 || chosen >= credit}
                              onClick={() => setPickCart((c) => ({ ...c, [it.id]: (c[it.id] ?? 0) + 1 }))}
                              className={`relative rounded-xl p-3 text-left text-lg font-semibold transition active:scale-[0.97] disabled:opacity-40 ${n > 0 ? "bg-white text-sky-900" : "bg-white/15"}`}
                            >
                              {n > 0 && (
                                <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-sky-700 text-sm text-white">{n}</span>
                              )}
                              <span className="block leading-tight">{it.flavor}</span>
                              <span className={`text-sm font-normal ${n > 0 ? "text-sky-800" : "opacity-80"}`}>{l === 0 ? "esgotado" : `${l} na vitrine`}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setPickCart({})} disabled={chosen === 0} className="rounded-xl bg-white/15 px-4 py-3 text-base font-semibold disabled:opacity-40">
                          Limpar
                        </button>
                        <button
                          onClick={() => redeemCode(o.token, Object.entries(pickCart).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty })))}
                          disabled={chosen !== credit || redeeming}
                          className="flex-1 rounded-xl bg-emerald-500 py-3 text-xl font-bold disabled:opacity-40"
                        >
                          {redeeming ? "Registrando…" : `Entregar ${credit} ${credit === 1 ? "fatia" : "fatias"}`}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-white/20 pt-3">
                        <button
                          onClick={() => refundOrder(o)}
                          disabled={refunding}
                          className="rounded-xl bg-red-600 px-4 py-3 text-base font-semibold disabled:opacity-40"
                        >
                          {refunding ? "Devolvendo…" : "Não gostou de nenhum · Devolver Pix"}
                        </button>
                        <button onClick={() => setRedeemResult(null)} className="ml-auto rounded-xl bg-white/15 px-4 py-3 text-base">
                          Voltar
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : redeemResult ? (
                <div
                  className={`space-y-3 rounded-2xl p-6 text-white ${
                    redeemResult.result === "entregar"
                      ? "bg-emerald-600"
                      : redeemResult.result === "nao_pago"
                        ? "bg-amber-600"
                        : "bg-red-700"
                  }`}
                >
                  <p className="text-4xl font-black leading-tight sm:text-5xl">
                    {redeemResult.result === "entregar"
                      ? "✓ ENTREGAR"
                      : redeemResult.result === "ja_retirado"
                        ? "✕ JÁ RETIRADO"
                        : redeemResult.result === "nao_pago"
                          ? "! NÃO PAGO"
                          : redeemResult.result === "devolvido"
                            ? "✕ PIX DEVOLVIDO"
                            : "✕ ATENÇÃO"}
                  </p>
                  <p className="text-xl font-semibold">{redeemResult.message}</p>
                  {redeemResult.order && (
                    <div className="rounded-xl bg-black/20 p-4">
                      <p className="text-3xl font-bold">{redeemResult.order.code} · {redeemResult.order.name}</p>
                      <ul className="mt-2 space-y-1 text-2xl">
                        {[...(redeemResult.order.picks ?? []), ...redeemResult.order.lines.filter((l) => l.item_id !== CREDIT_ID || !(redeemResult.order?.picks ?? []).length)].map((l) => (
                          <li key={l.item_id}><strong>{l.qty}×</strong> {l.flavor}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button onClick={() => setRedeemResult(null)} className="w-full rounded-xl bg-white py-4 text-xl font-bold text-neutral-900">
                    Próximo cliente
                  </button>
                </div>
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-neutral-700 p-6 text-center text-xl text-neutral-400">
                  {redeeming ? "Conferindo…" : "Aponte a câmera para o QR do ticket no celular do cliente."}
                </div>
              )}
              <OrdersList
                orders={(state.orders ?? []).filter((o) => o.status === "pago" || o.status === "pago_sem_estoque")}
                title="Pagos esperando retirada"
                onRefund={refundOrder}
              />
            </div>
          </div>
        )}

        {/* ---------------- CARDÁPIO ---------------- */}
        {draft && tab === "cardapio" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Coloque quantas fatias de cada sabor e quantas unidades de cada bebida/produto vão para o festival. Durante as vendas você pode aumentar (chegou mais um bolo) — o que já foi vendido continua contado.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
              Cada bolo rende
              <input
                type="number"
                min={1}
                value={slicesPerCake}
                onChange={(e) => setSlicesPerCake(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
              />
              fatias (usado no botão “+ 1 bolo”).
            </div>

            {(["fatia", "produto"] as const).map((kind) => {
              const rows = draft.items.filter((i) => (i.kind ?? "fatia") === kind);
              const product = kind === "produto";
              return (
                <div key={kind} className="space-y-2">
                  <p className="pt-2 text-sm font-semibold text-white">{product ? "Bebidas e outros produtos" : "Fatias"}</p>
                  {product && rows.length === 0 && (
                    <p className="text-xs text-neutral-500">Refrigerante, suco, água, café, docinhos… com preço e quantidade que você levou.</p>
                  )}
                  {rows.map((it) => (
                    <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                      {it.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgSrc(it.photo_url, IMG_WIDTH.thumb)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <span className={`h-12 w-12 rounded-lg ${product ? "bg-gradient-to-br from-sky-900 to-neutral-800" : "bg-neutral-800"}`} />
                      )}
                      <input
                        value={it.flavor}
                        onChange={(e) => editItem(it.id, { flavor: e.target.value })}
                        className="min-w-[160px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs text-neutral-400">
                        R$
                        <input
                          inputMode="decimal"
                          value={String(it.price)}
                          onChange={(e) => editItem(it.id, { price: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })}
                          className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-neutral-400">
                        {product ? "Qtd." : "Fatias"}
                        <input
                          type="number"
                          min={it.sold}
                          value={it.slices_total}
                          onChange={(e) => editItem(it.id, { slices_total: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                          className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white"
                        />
                      </label>
                      {product ? (
                        <button onClick={() => editItem(it.id, { slices_total: it.slices_total + 6 })} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs">
                          + 6
                        </button>
                      ) : (
                        <button
                          onClick={() => editItem(it.id, { slices_total: it.slices_total + slicesPerCake })}
                          className="rounded-lg border border-neutral-700 px-3 py-2 text-xs"
                        >
                          + 1 bolo
                        </button>
                      )}
                      <span className="w-28 text-xs text-neutral-400">
                        {it.sold > 0 ? `${it.sold} vendid${product ? "os" : "as"} · ${remaining(it)} restam` : product ? "nenhum vendido" : "nenhuma vendida"}
                      </span>
                      <button
                        onClick={() => editDraft((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))}
                        disabled={it.sold > 0}
                        title={it.sold > 0 ? "Já tem vendas deste item" : "Tirar do cardápio"}
                        className="text-sm text-red-400 disabled:opacity-30"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  {product ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newProd.name.trim()) return;
                        const price = Math.max(0, Number(newProd.price.replace(",", ".")) || 0);
                        const qty = Math.max(0, Math.floor(Number(newProd.qty) || 0));
                        const used = new Set(draft.items.map((i) => i.id));
                        const id = slugId(newProd.name, used);
                        editDraft((d) => ({
                          ...d,
                          items: [...d.items, { id, kind: "produto", flavor: newProd.name.trim(), photo_url: "", price, slices_total: qty, sold: 0 }],
                        }));
                        setNewProd({ name: "", price: "", qty: "" });
                      }}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-neutral-700 p-3"
                    >
                      <input
                        value={newProd.name}
                        onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Nome (ex.: Coca-Cola lata 350 ml)"
                        className="min-w-[200px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                      />
                      <input
                        inputMode="decimal"
                        value={newProd.price}
                        onChange={(e) => setNewProd((p) => ({ ...p, price: e.target.value }))}
                        placeholder="Preço R$"
                        className="w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={newProd.qty}
                        onChange={(e) => setNewProd((p) => ({ ...p, qty: e.target.value }))}
                        placeholder="Qtd."
                        className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
                      />
                      <button disabled={!newProd.name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-40">
                        + Adicionar produto
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {flavorsNotInMenu.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const f = flavors.find((x) => x.name === e.target.value);
                            if (f) addFlavor(f.name, f.photo_url);
                          }}
                          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                        >
                          <option value="">+ Sabor cadastrado na loja…</option>
                          {flavorsNotInMenu.map((f) => (
                            <option key={f.name} value={f.name}>{f.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => {
                          const name = window.prompt("Nome do sabor");
                          if (name) addFlavor(name);
                        }}
                        className="rounded-lg border border-neutral-700 px-3 py-2 text-sm"
                      >
                        + Outro sabor
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="space-y-4 rounded-xl border border-neutral-800 p-4 text-sm text-neutral-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">Venda pelo celular (Pix na fila)</p>
                <button onClick={printQueuePoster} className="rounded-lg border border-neutral-600 px-3 py-2 text-sm font-medium text-white">
                  Imprimir cartaz com QR da fila
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["quantidade", "Paga a quantidade, escolhe na vitrine", "O cliente paga N fatias no celular e escolhe o sabor olhando a vitrine. Se nenhum agradar, você devolve o Pix pela tela de Retirada."],
                    ["sabor", "Escolhe o sabor no celular", "O cliente já escolhe o sabor pelo celular e as fatias ficam guardadas para ele."],
                  ] as const
                ).map(([mode, title, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => editDraft((d) => ({ ...d, online_mode: mode }))}
                    className={`rounded-xl border p-3 text-left ${(draft.online_mode ?? "quantidade") === mode ? "border-blue-500 bg-blue-600/15" : "border-neutral-700"}`}
                  >
                    <span className="block font-medium text-white">{title}</span>
                    <span className="block text-xs text-neutral-400">{hint}</span>
                  </button>
                ))}
              </div>
              {(draft.online_mode ?? "quantidade") === "quantidade" && (
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    Preço da fatia R$
                    <input
                      inputMode="decimal"
                      value={draft.slice_price ? String(draft.slice_price) : ""}
                      placeholder={String(draft.items.find((i) => (i.kind ?? "fatia") === "fatia" && i.price > 0)?.price ?? "")}
                      onChange={(e) => editDraft((d) => ({ ...d, slice_price: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) }))}
                      className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Fechar o celular quando sobrarem
                    <input
                      type="number"
                      min={0}
                      value={draft.online_close_below ?? 10}
                      onChange={(e) => editDraft((d) => ({ ...d, online_close_below: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                      className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    />
                    fatias (o fim fica só para a vitrine)
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  Guardar para o balcão
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.counter_reserve_pct}
                    onChange={(e) => editDraft((d) => ({ ...d, counter_reserve_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                    className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  />
                  % das fatias
                </label>
                <label className="flex items-center gap-2">
                  Máximo por pedido
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.max_per_order}
                    onChange={(e) => editDraft((d) => ({ ...d, max_per_order: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }))}
                    className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                  />
                  fatias
                </label>
              </div>
              <div className="space-y-2 border-t border-neutral-800 pt-4">
                <p className="font-medium text-white">
                  Mercado Pago{" "}
                  {mp?.configured ? (
                    <span className="text-xs font-normal text-emerald-400">conectado ({mp.token_hint}{mp.test_mode ? " · teste" : " · produção"})</span>
                  ) : (
                    <span className="text-xs font-normal text-neutral-500">não configurado</span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  Cole o Access Token (Mercado Pago Developers → Suas integrações → Credenciais). Ele fica guardado só no servidor e nunca aparece de novo aqui.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={mpToken}
                    onChange={(e) => setMpToken(e.target.value)}
                    placeholder={mp?.configured ? "Novo token (deixe vazio para manter)" : "APP_USR-…"}
                    className="min-w-[260px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                  />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={mpTest} onChange={(e) => setMpTest(e.target.checked)} />
                    Modo teste (Pix aprovado sozinho)
                  </label>
                  <button onClick={saveMp} disabled={!mpToken.trim() && !mp?.configured} className="rounded-lg bg-blue-600 px-4 py-2 font-medium disabled:opacity-40">
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t border-neutral-800 bg-neutral-950/90 px-1 py-3 backdrop-blur">
              {dirty && (
                <button
                  onClick={() => {
                    setDirty(false);
                    setDraftEdit(null);
                  }}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm"
                >
                  Desfazer
                </button>
              )}
              <button
                onClick={() => saveDraft()}
                disabled={!dirty || saving}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                {saving ? "Salvando…" : dirty ? "Salvar cardápio" : "Tudo salvo"}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- RESUMO ---------------- */}
        {state && tab === "resumo" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Faturamento", formatBRL(summary.revenue)],
                ["Fatias vendidas", String(summary.slices)],
                ["Vendas", String(summary.count)],
                ["Ticket médio", summary.count ? formatBRL(summary.revenue / summary.count) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
                  <p className="text-xs text-neutral-500">{label}</p>
                  <p className="mt-1 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 p-4">
                <p className="mb-3 text-sm font-semibold">Por sabor</p>
                <table className="w-full text-sm">
                  <thead className="text-xs text-neutral-500">
                    <tr>
                      <th className="pb-2 text-left font-normal">Sabor</th>
                      <th className="pb-2 text-right font-normal">Vendidas</th>
                      <th className="pb-2 text-right font-normal">Sobraram</th>
                      <th className="pb-2 text-right font-normal">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter((it) => it.slices_total > 0 || it.sold > 0).map((it) => (
                      <tr key={it.id} className="border-t border-neutral-900">
                        <td className="py-1.5">{it.flavor}</td>
                        <td className="py-1.5 text-right">{it.sold}/{it.slices_total}</td>
                        <td className={`py-1.5 text-right ${remaining(it) === 0 && it.slices_total > 0 ? "text-emerald-400" : ""}`}>
                          {remaining(it) === 0 && it.slices_total > 0 ? "esgotou" : remaining(it)}
                        </td>
                        <td className="py-1.5 text-right">{formatBRL(it.sold * it.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-800 p-4">
                  <p className="mb-3 text-sm font-semibold">Por forma de pagamento</p>
                  {[...Object.keys(PAYMENT_LABELS), "online"].map((m) => (
                    <div key={m} className="flex justify-between border-t border-neutral-900 py-1.5 text-sm">
                      <span>{m === "online" ? "Pix pelo celular" : PAYMENT_LABELS[m]}</span>
                      <span>{formatBRL(summary.byMethod[m] ?? 0)}</span>
                    </div>
                  ))}
                  {summary.canceled > 0 && (
                    <p className="pt-2 text-xs text-neutral-500">{summary.canceled} {summary.canceled === 1 ? "venda cancelada" : "vendas canceladas"} (fora da conta).</p>
                  )}
                </div>
                <OrdersList orders={state.orders ?? []} title="Pedidos pelo celular" />
                <div className="rounded-xl border border-neutral-800 p-4">
                  <p className="mb-2 text-sm font-semibold">Todas as vendas do balcão</p>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {[...state.sales].reverse().map((s) => (
                      <div key={s.id} className={`flex gap-2 text-xs ${s.canceled ? "text-neutral-600 line-through" : "text-neutral-300"}`}>
                        <span className="w-10 shrink-0">{timeLabel(s.at)}</span>
                        <span className="min-w-0 flex-1 truncate">{s.lines.map((l) => `${l.qty}× ${l.flavor}`).join(", ")}</span>
                        <span className="w-14 text-right">{PAYMENT_LABELS[s.method] ?? s.method}</span>
                        <span className="w-16 text-right">{formatBRL(s.total)}</span>
                      </div>
                    ))}
                    {state.sales.length === 0 && <p className="text-xs text-neutral-500">Nenhuma venda ainda.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );

  if (kiosk) {
    return <div className="min-h-screen p-3 sm:p-5">{content}</div>;
  }
  return <AppShell title="Festival ao vivo">{content}</AppShell>;
}

function OrdersList({
  orders,
  title,
  onRefund,
}: {
  orders: FestivalOnlineOrder[];
  title: string;
  onRefund?: (o: FestivalOnlineOrder) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-neutral-800 p-4">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {[...orders].reverse().map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-neutral-900 py-1.5 text-sm text-neutral-300">
            <span className="w-12 shrink-0 font-semibold">{o.code}</span>
            <span className="w-24 shrink-0 truncate">{o.name}</span>
            <span className="min-w-0 flex-1 truncate">{o.lines.map((l) => `${l.qty}× ${l.flavor}`).join(", ")}</span>
            <span className={`shrink-0 ${o.status === "pago_sem_estoque" ? "text-amber-400" : o.status === "pago" ? "text-emerald-400" : "text-neutral-500"}`}>
              {ORDER_STATUS[o.status] ?? o.status}
            </span>
            <span className="w-16 shrink-0 text-right">{formatBRL(o.total)}</span>
            {onRefund && (o.status === "pago" || o.status === "pago_sem_estoque") && (
              <button onClick={() => onRefund(o)} className="shrink-0 text-xs text-red-400 hover:underline">
                Devolver Pix
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
