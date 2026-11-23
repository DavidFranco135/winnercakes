"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { SIGNUP_PATH, signupFromOrder } from "@/lib/signup";
import { formatCurrency } from "@/lib/format";
import type { CartLine, OrderLine, PublicProduct, PublicStore, StoreSlide } from "@/lib/store";
import { festivalDateParts, upcomingFestivals, computeTotals, darkVariant, storeBackground, formatPercent, isBrandLogo, promoNotices, unitPrice, formatWhatsappDisplay, logoForTheme, instagramEmbedUrl, priceLabel, themeVars, whatsappLink } from "@/lib/store";
import { focusStyle } from "@/lib/focus";
import { matchesSearch } from "@/lib/search";
import { trackStoreEvent, useVisitTracker } from "@/lib/visits";
import { CartDrawer, type CustomerInfo } from "./CartDrawer";
import { FeaturedSlider } from "./FeaturedSlider";
import { SearchOverlay } from "./SearchOverlay";
import { useStoreFx } from "./fx";
import { HeroSlider } from "./HeroSlider";
import { FestivalsSection, LocationsSection, nextFestivalNotice } from "./Festivals";
import { LiveMenu, useLiveFestival } from "./LiveMenu";
import { CakeTablesSection, FaqSection, FlavorsSection, GallerySection } from "./Showcase";
import { SplashIntro } from "./SplashIntro";
import { restoreScroll, takeSnap, useSnapSaver } from "@/lib/page-restore";
import { DesktopNav, MenuButton, MobileMenu, type MenuSection, type NavCategory } from "./StoreNav";
import { ProductCard } from "./ProductCard";
import { ProductModal } from "./ProductModal";
import { PromoPopup, PromoSideTab, PromoStrip, usePromoAutoOpen } from "./PromoPopup";
import {
  IconArrowRight,
  IconCart,
  IconCheck,
  IconClose,
  IconClock,
  IconInstagram,
  IconPin,
  IconSearch,
  IconSparkle,
  IconWhatsapp,
  Reveal,
  useSwipe,
} from "./ui";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import {
  InstallAppButton,
  ProductionEta,
  TrustBadges,
  pickRelated,
  productLink,
  usePrefersDark,
  useStoreServiceWorker,
  InstallmentsContext,
} from "./extras";

const TABS = ["Início", "Cardápio", "Como pedir", "Contato"] as const;

function useStoredState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) setValue(JSON.parse(raw) as T);
      } catch {
        // ignore corrupt/blocked storage
      }
      loaded.current = true;
    }, 0);
    return () => clearTimeout(id);
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable
    }
  }, [key, value]);

  return [value, setValue];
}

// Palavra de destaque nos títulos: itálico leve, como na arte de capa.
function Em({ children }: { children: React.ReactNode }) {
  return <em className="font-normal italic tracking-normal">{children}</em>;
}

// Faixa de avisos que passa devagar no topo (vem dos Diferenciais de Minha
// Loja). O texto é repetido para o giro não ter emenda; para ao passar o mouse.
function AnnouncementBar({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const run = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="px-6">{t}</span>
          <span className="opacity-50">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="fx-marquee bg-[var(--brand-2)] text-[var(--brand-2-ink)]">
      <div className="overflow-hidden">
        <div className="fx-marquee-track flex w-max py-2 text-[11px] font-medium uppercase tracking-[0.18em]">
          {run(false)}
          {run(true)}
          {run(true)}
          {run(true)}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {eyebrow}
          </p>
        )}
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

// Esqueleto com o formato da loja (cabeçalho, capa, busca e cards com texto)
// enquanto os dados chegam: a página "aparece" na hora, sem tela vazia.
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[var(--line)] ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </div>
  );
}

function SkeletonStore() {
  return (
    <div aria-busy="true" aria-label="Carregando a loja">
      <div className="h-8 bg-[var(--line)] opacity-60" />
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Shimmer className="h-11 w-11 rounded-2xl" />
          <Shimmer className="h-4 w-28 rounded-full" />
        </div>
        <Shimmer className="hidden h-10 w-80 rounded-full md:block" />
        <Shimmer className="h-10 w-24 rounded-full" />
      </div>
      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 sm:px-6">
        <Shimmer className="h-[46vh] rounded-[28px]" />
        <Shimmer className="h-14 rounded-full" />
        <Shimmer className="h-8 w-56 rounded-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 overflow-hidden rounded-3xl border border-[var(--line)] pb-4">
              <Shimmer className="aspect-[4/5]" />
              <Shimmer className="mx-4 h-3.5 w-3/4 rounded-full" />
              <div className="mx-4 flex items-center justify-between">
                <Shimmer className="h-5 w-16 rounded-full" />
                <Shimmer className="h-9 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// No site publicado os dados vêm do cache da Cloudflare (functions/loja-data.js),
// que responde na hora; se essa função falhar, busca direto no servidor.
async function loadPublicStore(slug: string): Promise<PublicStore> {
  if (process.env.NODE_ENV === "production") {
    try {
      const res = await fetch(`/loja-data?s=${encodeURIComponent(slug)}`);
      if (res.ok) return (await res.json()) as PublicStore;
      if (res.status === 404) throw new ApiError(404, "Loja não encontrada.");
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
  }
  return apiFetch<PublicStore>(`/api/v1/public/stores/${encodeURIComponent(slug)}`);
}

export function Storefront({ slug }: { slug: string }) {
  // Conta a visita e o "online agora" (anônimo, sem IP) — aparece em Minha Loja.
  useVisitTracker(slug);
  const liveFestival = useLiveFestival(slug);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const [dir, setDir] = useState(1);
  const [lines, setLines] = useStoredState<CartLine[]>(`loja-cart-${slug}`, []);
  const [customer, setCustomer] = useStoredState<CustomerInfo>(`loja-customer-${slug}`, {
    name: "",
    extra: "",
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  // Conta a abertura do produto (alimenta "Produtos mais vistos" em Minha Loja).
  useEffect(() => {
    if (openProductId) trackStoreEvent(slug, "product_view", openProductId);
  }, [slug, openProductId]);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"relevance" | "price-asc" | "price-desc" | "name">("relevance");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [question, setQuestion] = useState({ name: "", text: "" });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useStoreFx(rootRef, store !== null);
  useStoreServiceWorker();
  // Guarda o tema da loja neste aparelho: na próxima visita a abertura
  // animada já sai nas cores dele (ver o script do layout da vitrine).
  useEffect(() => {
    const theme = store?.settings.theme;
    if (!theme) return;
    try {
      localStorage.setItem("winner-tema", theme);
    } catch {
      /* armazenamento indisponível */
    }
    document.documentElement.setAttribute("data-loja-tema", theme);
  }, [store?.settings.theme]);
  const prefersDark = usePrefersDark();

  // O celular descartou a aba ao minimizar e recarregou: volta para a mesma
  // aba, categoria, busca, produto aberto e rolagem (ver lib/page-restore).
  useSnapSaver(() => ({ tab, category, search, product: openProductId }));
  const restoreDone = useRef(false);
  useEffect(() => {
    if (!store || restoreDone.current) return;
    restoreDone.current = true;
    const snap = takeSnap();
    if (!snap) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab(snap.tab);
    setCategory(snap.category);
    setSearch(snap.search);
    /* eslint-enable react-hooks/set-state-in-effect */
    restoreScroll(snap.y);
    const deepLink = new URL(window.location.href).searchParams.has("p");
    const product = snap.product;
    if (product && !deepLink && store.products.some((p) => p.id === product))
      setTimeout(() => setOpenProductId(product), 350);
  }, [store]);

  // Link direto do produto (?p=<id>): abre o produto assim que a loja carrega.
  // O ?p= sai do endereço de base para "voltar" não reabrir o mesmo produto.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!store || deepLinkDone.current) return;
    deepLinkDone.current = true;
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("p");
    if (!wanted) return;
    url.searchParams.delete("p");
    window.history.replaceState(window.history.state, "", url.toString());
    if (store.products.some((p) => p.id === wanted)) setTimeout(() => setOpenProductId(wanted), 0);
  }, [store]);

  // Produto aberto: o endereço vira o link do produto (para copiar/compartilhar)
  // e o título da aba mostra o nome dele.
  useEffect(() => {
    if (!openProductId || !store) return;
    const product = store.products.find((p) => p.id === openProductId);
    window.history.replaceState(window.history.state, "", productLink(openProductId));
    const previous = document.title;
    if (product) document.title = `${product.name} · ${store.settings.display_name || store.name}`;
    return () => {
      document.title = previous;
    };
  }, [openProductId, store]);

  useEffect(() => {
    let cancelled = false;
    loadPublicStore(slug)
      .then((data) => {
        if (cancelled) return;
        // Um servidor mais antigo que o site não manda as categorias; sem
        // isso a loja quebraria inteira em vez de só não mostrá-las.
        setStore({
          ...data,
          settings: {
            ...data.settings,
            categories: (data.settings.categories ?? []).map((c) => ({
              ...c,
              cover_url: c.cover_url ?? "",
            })),
          },
          products: data.products.map((p) => ({
            ...p,
            category_ids: p.category_ids ?? [],
            price_on_request: p.price_on_request ?? false,
          })),
        });
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError && err.status === 404
              ? "Loja não encontrada."
              : "Não foi possível carregar a loja agora. Tente novamente em instantes."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (store) document.title = `${store.settings.display_name} · Cardápio`;
  }, [store]);

  const productsById = useMemo(() => {
    const map = new Map<string, PublicProduct>();
    store?.products.forEach((p) => map.set(p.id, p));
    return map;
  }, [store]);

  const orderLines: OrderLine[] = useMemo(
    () =>
      lines
        .map((l) => ({ product: productsById.get(l.id), qty: l.qty, note: l.note }))
        .filter((l): l is OrderLine => !!l.product && l.product.available),
    [lines, productsById]
  );
  const units = orderLines.reduce((sum, l) => sum + l.qty, 0);
  const discountRules = useMemo(
    () => ({ tiers: store?.settings.cart_tiers ?? [], stack: !!store?.settings.discounts_stack }),
    [store]
  );
  const total = computeTotals(orderLines, discountRules).total;

  // Avisos de desconto: faixa, aba lateral e caixa de boas-vindas.
  const [promoOpen, setPromoOpen] = useState(false);
  const openPromo = useCallback(() => setPromoOpen(true), []);
  const closePromo = useCallback(() => setPromoOpen(false), []);
  const promoList = useMemo(() => {
    if (!store) return [];
    const list = promoNotices(store.settings);
    // Descontos só em alguns produtos (sem promoção geral): avisa o maior.
    const best = Math.max(0, ...store.products.map((p) => p.discount_percent ?? 0));
    if (best > (store.settings.promo_percent ?? 0))
      list.push(`Doces selecionados com até ${formatPercent(best)} OFF`);
    return list;
  }, [store]);
  const promoMax = useMemo(() => {
    if (!store) return 0;
    const s = store.settings;
    return Math.max(
      s.promo_percent ?? 0,
      ...(s.cart_tiers ?? []).map((t) => t.percent),
      ...store.products.map((p) => p.discount_percent ?? 0)
    );
  }, [store]);
  usePromoAutoOpen(promoList.length > 0, openPromo);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const clampQty = (id: string, qty: number) => {
    const max = productsById.get(id)?.stock_quantity ?? 99;
    return Math.min(max, qty);
  };

  const setLine = useCallback(
    (id: string, qty: number, note?: string) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.id === id);
        const nextQty = clampQty(id, qty);
        if (nextQty <= 0) return prev.filter((l) => l.id !== id);
        if (existing)
          return prev.map((l) =>
            l.id === id ? { ...l, qty: nextQty, note: note ?? l.note } : l
          );
        return [...prev, { id, qty: nextQty, note: note ?? "" }];
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setLines, productsById]
  );

  const tabRef = useRef(0);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Lembra a aba (o celular pode recarregar a página quando o cliente vai a
  // outro app; ao voltar, continua onde estava).
  const tabKey = `loja-tab-${slug}`;
  const tabRestored = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      tabRestored.current = true;
      try {
        const saved = Number(window.sessionStorage.getItem(tabKey));
        if (saved > 0 && saved < TABS.length) {
          setTab(saved);
          window.history.replaceState({ tab: saved }, "");
        }
      } catch {
        // armazenamento indisponível
      }
    }, 0);
    return () => clearTimeout(id);
  }, [tabKey]);
  useEffect(() => {
    // Só grava depois de ler o valor salvo (senão a aba inicial o apagaria).
    if (!tabRestored.current) return;
    try {
      window.sessionStorage.setItem(tabKey, String(tab));
    } catch {
      // armazenamento indisponível
    }
  }, [tab, tabKey]);

  const goTab = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(TABS.length - 1, next));
      if (clamped === tab) return;
      setDir(clamped > tab ? 1 : -1);
      setTab(clamped);
      // One history entry per tab, so "back" returns to the previous tab
      // instead of leaving the store.
      window.history.pushState({ tab: clamped }, "");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [tab]
  );

  // Cards do menu lateral: levam para cada parte da página inicial.
  const goSection = useCallback(
    (id: string) => {
      const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (tab !== 0) {
        goTab(0);
        setTimeout(scroll, 450);
      } else {
        setTimeout(scroll, 60);
      }
    },
    [tab, goTab]
  );

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (event.state?.overlay) return;
      const target = typeof event.state?.tab === "number" ? event.state.tab : 0;
      if (target === tabRef.current) return;
      setDir(target > tabRef.current ? 1 : -1);
      setTab(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const swipe = useSwipe(
    () => goTab(tab + 1),
    () => goTab(tab - 1)
  );

  const filtered = useMemo(() => {
    if (!store) return [];
    // Uma categoria principal mostra também os produtos das suas subcategorias.
    const family = category
      ? [category, ...store.settings.categories.filter((c) => c.parent_id === category).map((c) => c.id)]
      : null;
    let list = store.products.filter(
      (p) =>
        matchesSearch(search, p.name, p.description) &&
        (!onlyAvailable || p.available) &&
        (!family || p.category_ids.some((id) => family.includes(id)))
    );
    const byRequest = (a: PublicProduct, b: PublicProduct) =>
      Number(a.price_on_request) - Number(b.price_on_request);
    if (sort === "price-asc") list = [...list].sort((a, b) => byRequest(a, b) || unitPrice(a) - unitPrice(b));
    else if (sort === "price-desc") list = [...list].sort((a, b) => byRequest(a, b) || unitPrice(b) - unitPrice(a));
    else if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    // "Relevância": a ordem escolhida pelo lojista em Minha Loja (já vem do servidor).
    return list;
  }, [store, search, sort, onlyAvailable, category]);

  // A abertura fica sempre na primeira posição: assim ela não reinicia quando
  // a loja termina de carregar (o resto da página troca por baixo dela).
  const splash = (
    <SplashIntro
      logoUrl={store?.settings.logo_url || undefined}
      name={store?.settings.display_name || store?.name || "Winner Cakes"}
      ready={store !== null || error !== null}
    />
  );

  if (error) {
    return (
      <>
      {splash}
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-center text-neutral-700">
        <div className="space-y-2">
          <p className="text-2xl font-semibold">{error}</p>
          <p className="text-sm text-neutral-500">Confira o endereço do link da loja.</p>
        </div>
      </div>
      </>
    );
  }

  const settings = store?.settings;
  // Modo escuro automático: no celular/computador escuro, usa a versão noturna.
  const effectiveTheme =
    settings?.auto_dark && prefersDark ? darkVariant(settings.theme) : (settings?.theme ?? "winner");
  const background = settings ? storeBackground(settings) : null;
  const vars = themeVars(settings?.accent ?? "cafe", effectiveTheme);

  if (!store || !settings) {
    return (
      <>
        {splash}
        <div style={themeVars("vermelho", "winner")} className="min-h-screen bg-[var(--bg)]">
          <SkeletonStore />
        </div>
      </>
    );
  }
  // Selos herdados do modelo da cerâmica que não valem para a confeitaria.
  const trustBadges = (settings.trust_badges ?? []).filter(
    (b) => !/todo o brasil|peça por peça|feit[oa] à mão/i.test(b)
  );

  const nextFest = upcomingFestivals(settings.festivals)[0];
  const menuSections: MenuSection[] = [
    ...(liveFestival && liveFestival.items.length > 0
      ? [{ id: "ao-vivo", title: "Fatias de hoje", hint: "O que tem agora na vitrine", icon: "🍰", live: true }]
      : []),
    ...(settings.festivals?.length
      ? [
          {
            id: "sec-festival",
            title: "Festival de Fatias",
            hint: nextFest ? `${festivalDateParts(nextFest.date).short} · ${nextFest.place.replace(/^Festival\s+/i, "")}` : "Calendário",
            icon: "📅",
          },
        ]
      : []),
    ...(settings.flavors?.length
      ? [{ id: "sec-sabores", title: "Sabores", hint: `${settings.flavors.length} sabores`, image: settings.flavors.find((f) => f.photo_url)?.photo_url }]
      : []),
    ...(settings.cake_tables?.length
      ? [{ id: "sec-tabela", title: "Tabela de bolos", hint: "Tamanhos e preços", image: settings.cake_tables.find((t) => t.photo_url)?.photo_url }]
      : []),
    ...(settings.gallery?.length
      ? [{ id: "sec-criacoes", title: "Nossas criações", hint: "Fotos das encomendas", image: settings.gallery[0]?.url }]
      : []),
    ...(settings.locations?.length
      ? [{ id: "sec-onde", title: "Onde estamos", hint: settings.locations.map((l) => l.address || l.name).join(" · "), icon: "📍" }]
      : []),
    { id: "sec-encomendas", title: "Encomendas", hint: "Bolo da sua festa", icon: "🎂" },
    ...(settings.faq?.length ? [{ id: "sec-duvidas", title: "Dúvidas", hint: "Perguntas frequentes", icon: "💬" }] : []),
  ];


  const storeName = settings.display_name || store.name;
  const waGeneral = whatsappLink(
    settings.whatsapp,
    `Olá, ${storeName}! Gostaria de saber mais sobre os produtos.`
  );
  const waCustom = whatsappLink(
    settings.whatsapp,
    `Olá, ${storeName}! Quero fazer uma encomenda (bolo / doces para festa).`
  );
  const reelEmbeds = (settings.reels ?? [])
    .map((link) => instagramEmbedUrl(link))
    .filter((url): url is string => url !== null);
  const instagramHandle = settings.instagram.replace(/^@/, "").trim();
  // Avisos da faixa do topo: os Diferenciais de Minha Loja, mais o WhatsApp.
  const festivalNotice = nextFestivalNotice(settings.festivals);
  const announcements = [
    ...(festivalNotice ? [festivalNotice] : []),
    ...promoNotices(settings),
    ...settings.highlights
      .filter((h) => h.title.trim())
      .map((h) => (h.text.trim() ? `${h.title.trim()} · ${h.text.trim()}` : h.title.trim())),
    "Pedidos pelo WhatsApp, sem cadastro",
    ...(settings.production_days?.trim() ? [`Prazo de produção: ${settings.production_days.trim()}`] : []),
  ];
  const openProduct = openProductId ? productsById.get(openProductId) ?? null : null;
  // Todos os destaques marcados, na ordem escolhida pelo lojista. (Antes a lista
  // era cortada em 8 e seguia a ordem de cadastro, por isso "sumiam" destaques.)
  // Só quando não há nenhum destaque mostramos os primeiros produtos.
  const featuredProducts = (() => {
    const flagged = store.products.filter((p) => p.featured);
    if (flagged.length === 0) return store.products.slice(0, 8);
    const order = settings.featured_product_ids;
    if (!order || order.length === 0) return flagged;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...flagged].sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  })();
  const slides: StoreSlide[] =
    settings.slides.length > 0
      ? settings.slides
      : store.products
          .filter((p) => p.photo_urls.length > 0)
          .slice(0, 5)
          .map((p) => ({ url: p.photo_urls[0], title: p.name, subtitle: priceLabel(p) }));

  const allCategories = settings.categories.map((c) => {
    // Conta os produtos da categoria e das suas subcategorias (sem repetir).
    const family = [c.id, ...settings.categories.filter((o) => o.parent_id === c.id).map((o) => o.id)];
    const items = store.products.filter((p) => p.category_ids.some((id) => family.includes(id)));
    // Foto principal escolhida pelo lojista; sem escolha, a primeira foto dos produtos.
    const chosen = c.cover_url || "";
    const fallback = items.find((p) => p.photo_urls.length > 0) ?? null;
    const coverUrl = chosen || fallback?.photo_urls[0] || "";
    // Foto escolhida: usa o enquadramento definido na categoria. Automática: usa o
    // enquadramento do produto dono da foto.
    const coverStyle = chosen
      ? { objectPosition: `${c.cover_x ?? 50}% ${c.cover_y ?? 50}%` }
      : focusStyle(fallback?.photo_focus, coverUrl);
    return { ...c, count: items.length, coverUrl, coverStyle };
  });
  const knownIds = new Set(allCategories.map((c) => c.id));
  const isTop = (c: { parent_id?: string }) => !c.parent_id || !knownIds.has(c.parent_id);
  // Categorias principais (menu, página inicial e primeira linha de filtros).
  const categories = allCategories.filter(isTop);
  const childrenOf = (id: string) => allCategories.filter((c) => !isTop(c) && c.parent_id === id);
  const navCategories: NavCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: c.count,
    coverUrl: c.coverUrl,
    coverStyle: c.coverStyle,
    children: childrenOf(c.id).map((k) => ({
      id: k.id,
      name: k.name,
      count: k.count,
      coverUrl: k.coverUrl,
      coverStyle: k.coverStyle,
      children: [],
    })),
  }));
  const activeCategory = allCategories.find((c) => c.id === category) ?? null;
  // Categoria principal da categoria aberta (ela mesma, se for principal).
  const activeTop = activeCategory
    ? isTop(activeCategory)
      ? activeCategory
      : (categories.find((c) => c.id === activeCategory.parent_id) ?? null)
    : null;
  const activeSiblings = activeTop ? childrenOf(activeTop.id) : [];

  const openCategory = (id: string | null) => {
    setCategory(id);
    goTab(1);
  };

  // Lupa do cabeçalho: vai para o Catálogo e já deixa o cursor na busca.
  // Lupa do cabeçalho / barra da página inicial: abre a pesquisa geral.
  const openSearch = () => setSearchOpen(true);

  // "Ver todos no catálogo": fecha a pesquisa e mostra o catálogo filtrado.
  // O pequeno atraso deixa o "voltar" do fechamento terminar antes de trocar de aba.
  const seeAllResults = (term: string) => {
    setSearch(term);
    setCategory(null);
    setSearchOpen(false);
    setTimeout(() => {
      goTab(1);
      window.scrollTo({ top: 0 });
    }, 80);
  };

  const qtyOf = (id: string) => lines.find((l) => l.id === id)?.qty ?? 0;

  const cardFor = (product: PublicProduct) => (
    <ProductCard
      key={product.id}
      product={product}
      qty={qtyOf(product.id)}
      onOpen={() => setOpenProductId(product.id)}
      onAdd={() => {
        setLine(product.id, 1);
        showToast(`${product.name} adicionado ao pedido`);
      }}
      onChangeQty={(q) => setLine(product.id, q)}
    />
  );

  const steps = [
    { title: "Escolha as delícias", text: "Navegue pelo cardápio e toque no produto para ver fotos, tamanhos e sabores." },
    { title: "Monte sua encomenda", text: "Adicione ao pedido, ajuste a quantidade e escreva sabor, recheio, tema da festa ou o nome no topo do bolo." },
    { title: "Envie pelo WhatsApp", text: "Um toque e o pedido completo vai pronto para o nosso WhatsApp, sem cadastro. Diga a data e o horário que precisa." },
    { title: "Retire ou receba", text: "Confirmamos valor, data e entrega. Encomendas com antecedência; nos festivais, é só chegar e escolher a sua fatia." },
  ];

  const installments = { max: settings.installments_max ?? 0, min: settings.installments_min ?? 0 };

  return (
    <InstallmentsContext.Provider value={installments}>
    {splash}
    <div
      style={vars}
      ref={rootRef}
      data-theme={effectiveTheme}
      className="store-fx fx-texture relative min-h-screen overflow-x-clip bg-[var(--bg)] font-[family-name:var(--font-sans)] text-[var(--ink)] antialiased selection:bg-[var(--accent)] selection:text-[var(--accent-ink)]"
    >
      {background && (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-[2]" style={background.layer} />
      )}
      {/* Galhos de oliveira esmaecidos, espalhados pelas laterais do site todo. */}
      <div aria-hidden className="fx-sprinkles pointer-events-none absolute inset-0 -z-[1] overflow-hidden" />
      <header
        style={background?.header}
        className="fx-header sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-xl">
        <AnnouncementBar items={announcements} />
        <div className="fx-head-row relative mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <MenuButton onClick={() => setMenuOpen(true)} />
          {/* No celular a logo fica no centro do cabeçalho (menu à esquerda, busca e pedido à direita). */}
          <button
            onClick={() => goTab(0)}
            className={`flex min-w-0 items-center gap-3 text-left lg:static lg:flex-none lg:translate-x-0 ${
              settings.logo_url ? "absolute left-1/2 -translate-x-1/2" : "flex-1"
            }`}
          >
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc(logoForTheme(settings.logo_url, effectiveTheme === "winner-noite" || effectiveTheme === "dark"), IMG_WIDTH.thumb)}
                alt={storeName}
                // Logo inteira, no formato dela (redonda, larga ou quadrada).
                className="fx-logo h-14 w-auto max-w-[150px] shrink-0 object-contain sm:h-16 sm:max-w-[200px]"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--accent-ink)] shadow-md">
                {storeName.slice(0, 1).toUpperCase()}
              </span>
            )}
            {/* Com logo, o nome escrito só aparece do tablet para cima (a logo já traz o nome). */}
            <span className={`min-w-0 ${isBrandLogo(settings.logo_url) ? "hidden" : settings.logo_url ? "hidden sm:block" : ""}`}>
              <span className="block truncate font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
                {storeName}
              </span>
              {settings.tagline && (
                <span className="hidden truncate text-xs text-[var(--muted)] sm:block">{settings.tagline}</span>
              )}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={openSearch}
              aria-label="Buscar produto"
              title="Buscar produto"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent-text)] active:scale-95"
            >
              <IconSearch className="h-5 w-5" />
            </button>
            <a
              href={waGeneral}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Falar no WhatsApp"
              className="hidden h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold transition hover:border-[#25d366] hover:text-[#25d366] sm:inline-flex"
            >
              <IconWhatsapp className="h-4 w-4 text-[#25d366]" />
              WhatsApp
            </a>
            <button
              onClick={() => setCartOpen(true)}
              aria-label="Abrir pedido"
              data-cart-target
              className="fx-btn relative flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <IconCart className="h-5 w-5" />
              <span className="hidden sm:inline">Pedido</span>
              {units > 0 && (
                <span
                  key={units}
                  className="ml-0.5 animate-pop rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutral-900"
                >
                  {units}
                </span>
              )}
            </button>
          </div>
        </div>
        <DesktopNav
          categories={navCategories}
          tab={tab}
          activeCategoryId={category}
          activeTopId={activeTop?.id ?? null}
          onTab={goTab}
          onCategory={openCategory}
        />
      </header>

      <MobileMenu
        sections={menuSections}
        onSection={goSection}
        logoSrc={
          settings.logo_url
            ? imgSrc(logoForTheme(settings.logo_url, effectiveTheme === "winner-noite" || effectiveTheme === "dark"), IMG_WIDTH.thumb)
            : ""
        }
        open={menuOpen}
        onClose={closeMenu}
        storeName={storeName}
        whatsappHref={waGeneral}
        instagramHandle={instagramHandle}
        categories={navCategories}
        tab={tab}
        activeCategoryId={category}
        activeTopId={activeTop?.id ?? null}
        onTab={goTab}
        onCategory={openCategory}
      />

      <main className="mx-auto max-w-[1600px] px-4 pb-32 pt-6 sm:px-6 sm:pt-8 lg:px-10" {...swipe}>
        <div key={tab} className={dir >= 0 ? "animate-slide-in-right" : "animate-slide-in-left"}>
          {tab === 0 && (
            <div className="space-y-20 sm:space-y-28">
              <div className="space-y-10 sm:space-y-14">
                {/* No celular e no computador a capa vai de ponta a ponta. */}
                <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0 lg:relative lg:left-1/2 lg:-mt-8 lg:w-screen lg:-translate-x-1/2">
                <HeroSlider
                  slides={slides}
                  storeName={storeName}
                  tagline={settings.tagline}
                  whatsappHref={waGeneral}
                  orderHref={waCustom}
                  onCatalog={() => openCategory(null)}
                />
                </div>

                <PromoStrip notices={promoList} onClick={openPromo} />

                <LiveMenu live={liveFestival} slug={slug} />

                <div id="sec-festival" className="scroll-mt-36">
                <FestivalsSection
                  festivals={settings.festivals}
                  locations={settings.locations}
                  showLocations={false}
                  note={settings.festival_note}
                  heading={<SectionTitle eyebrow="Toda semana" title={<>Festival de <Em>Fatias</Em></>} />}
                />
                </div>

                <div id="sec-sabores" className="scroll-mt-36">
                <FlavorsSection
                  flavors={settings.flavors}
                  heading={
                    <SectionTitle
                      eyebrow="Escolha o seu favorito"
                      title={(() => {
                        const t = (settings.flavors_title || "Sabores das fatias").trim();
                        const [first, ...rest] = t.split(" ");
                        return rest.length ? <>{first} <Em>{rest.join(" ")}</Em></> : t;
                      })()}
                    />
                  }
                  footer={
                    <div className="flex flex-col items-center gap-3 pt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/selo-winner.png"
                        alt="Selo Winner Cakes de qualidade"
                        loading="lazy"
                        className="h-28 w-28 drop-shadow-lg sm:h-32 sm:w-32"
                      />
                      <p className="text-center font-[family-name:var(--font-display)] text-lg italic text-[var(--accent-text)]">
                        Feito com amor, para momentos inesquecíveis!
                      </p>
                    </div>
                  }
                />
                </div>

                <Reveal>
                  <a
                    href={SIGNUP_PATH}
                    className="fx-spotlight group flex flex-col items-center gap-4 overflow-hidden rounded-[32px] bg-[var(--accent)] px-6 py-7 text-center text-[var(--accent-ink)] shadow-lg transition hover:-translate-y-1 hover:shadow-xl sm:flex-row sm:px-10 sm:text-left"
                  >
                    <span className="text-5xl transition group-hover:scale-110 sm:text-6xl">🎂</span>
                    <span className="flex-1 space-y-1">
                      <span className="block font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">Faça seu cadastro</span>
                      <span className="block text-sm opacity-90">
                        Leva menos de 1 minuto: receba as novidades dos festivais e promoções no seu aniversário.
                      </span>
                    </span>
                    <span className="rounded-full bg-[var(--accent-ink)] px-6 py-3 text-sm font-semibold text-[var(--accent)] shadow transition group-hover:brightness-95">
                      Quero me cadastrar
                    </span>
                  </a>
                </Reveal>

                <div id="sec-tabela" className="scroll-mt-36">
                <CakeTablesSection
                  tables={settings.cake_tables}
                  note={settings.cake_table_note}
                  orderLink={(text) => whatsappLink(settings.whatsapp, text)}
                  heading={<SectionTitle eyebrow="Encomendas" title={<>Tabela de <Em>bolos</Em></>} />}
                />
                </div>

                <div id="sec-criacoes" className="scroll-mt-36">
                <GallerySection
                  photos={settings.gallery}
                  heading={<SectionTitle eyebrow="Encomendas e festas" title={<>Nossas <Em>criações</Em></>} />}
                />
                </div>

                <div id="sec-onde" className="scroll-mt-36">
                  <LocationsSection locations={settings.locations} />
                </div>

                {/* Sem barra de busca nem selos aqui: a lupa fica no topo e os selos no rodapé. */}

                {featuredProducts.length > 0 && (
                  <section className="space-y-6">
                    <SectionTitle
                      eyebrow="Seleção"
                      title={<>Os mais <Em>pedidos</Em></>}
                      action={
                        <button
                          onClick={() => openCategory(null)}
                          className="group hidden items-center gap-2 text-sm font-semibold text-[var(--accent-text)] sm:inline-flex"
                        >
                          Ver cardápio completo
                          <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </button>
                      }
                    />
                    <FeaturedSlider>{featuredProducts.map((p) => cardFor(p))}</FeaturedSlider>
                  </section>
                )}
              </div>

              {categories.length > 0 && (
                <section className="space-y-8">
                  <Reveal>
                    <SectionTitle eyebrow="Cardápio" title={<>Nossas <Em>delícias</Em></>} />
                  </Reveal>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                    {categories.map((c, i) => (
                      <Reveal key={c.id} delay={(i % 4) * 80}>
                        <button
                          onClick={() => openCategory(c.id)}
                          className="fx-spotlight group relative flex aspect-[5/4] w-full overflow-hidden rounded-3xl bg-[var(--accent)] text-left shadow-sm transition duration-500 hover:-translate-y-1 hover:shadow-xl"
                        >
                          {c.coverUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgSrc(c.coverUrl, IMG_WIDTH.card)}
                              alt=""
                              loading="lazy"
                              style={c.coverStyle}
                              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.07]"
                            />
                          )}
                          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                          <span className="relative mt-auto block p-4 text-white sm:p-5">
                            <span className="block font-[family-name:var(--font-display)] text-lg font-semibold leading-tight sm:text-xl">
                              {c.name}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
                              {c.count} {c.count === 1 ? "produto" : "produtos"}
                              <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                            </span>
                          </span>
                        </button>
                      </Reveal>
                    ))}
                  </div>
                </section>
              )}

              {settings.production_days?.trim() && (
                <Reveal>
                  <ProductionEta text={settings.production_days} />
                </Reveal>
              )}

              {settings.highlights.some((h) => h.title) && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {settings.highlights
                    .filter((h) => h.title)
                    .map((h, i) => (
                      <Reveal key={i} delay={i * 90}>
                        <div className="h-full rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 transition duration-500 hover:-translate-y-1 hover:shadow-xl">
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                            <IconSparkle className="h-5 w-5" />
                          </div>
                          <h3 className="mb-1.5 font-semibold">{h.title}</h3>
                          <p className="text-sm leading-relaxed text-[var(--muted)]">{h.text}</p>
                        </div>
                      </Reveal>
                    ))}
                </div>
              )}

              <Reveal>
                <section id="sec-encomendas" className="grid scroll-mt-36 items-center gap-8 rounded-[32px] border border-[var(--line)] bg-[var(--accent-soft)] p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                      Encomendas
                    </p>
                    <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
                      O bolo da sua festa, do jeitinho que você sonhou.
                    </h2>
                    <p className="max-w-xl text-base leading-relaxed text-[var(--muted)]">
                      Bolos de aniversário, docinhos, kits festa e mesas de doces. Conte o tema, a data e quantas
                      pessoas, e a gente prepara tudo com carinho.
                    </p>
                    <a
                      href={waCustom}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fx-btn inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-[var(--accent-ink)] shadow-lg transition hover:-translate-y-0.5"
                    >
                      <IconWhatsapp className="h-5 w-5" />
                      Fazer uma encomenda
                    </a>
                  </div>
                  <ul className="grid gap-3 text-sm">
                    {["Bolos de aniversário", "Docinhos e kits festa", "Casamentos e chás", "Empresas e datas especiais"].map((label) => (
                      <li key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 font-medium">
                        {label}
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>

              <div id="sec-duvidas" className="scroll-mt-36">
              <FaqSection
                items={settings.faq}
                heading={<SectionTitle eyebrow="Para pedir com tranquilidade" title={<>Dúvidas <Em>frequentes</Em></>} />}
              />
              </div>

              {settings.about && (
                <Reveal>
                  <section className="grid gap-8 rounded-[32px] border border-[var(--line)] bg-[var(--surface)] p-8 sm:p-12 lg:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                        Sobre nós
                      </p>
                      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
                        Feito com amor, fatia por fatia.
                      </h2>
                    </div>
                    <p className="whitespace-pre-line text-base leading-relaxed text-[var(--muted)]">
                      {settings.about}
                    </p>
                  </section>
                </Reveal>
              )}

              {reelEmbeds.length > 0 && (
                <section className="space-y-6">
                  <SectionTitle
                    eyebrow="Da cozinha"
                    title={<>Direto do <Em>forno</Em></>}
                    action={
                      instagramHandle ? (
                        <a
                          href={`https://instagram.com/${instagramHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-text)] hover:underline"
                        >
                          <IconInstagram className="h-4 w-4" />@{instagramHandle}
                        </a>
                      ) : undefined
                    }
                  />
                  <div className="flex snap-x gap-4 overflow-x-auto pb-3">
                    {reelEmbeds.map((url) => (
                      <iframe
                        key={url}
                        src={url}
                        title="Vídeo do Instagram"
                        loading="lazy"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                        className="h-[560px] w-[320px] shrink-0 snap-start rounded-3xl border border-[var(--line)] bg-[var(--surface)]"
                      />
                    ))}
                  </div>
                </section>
              )}

              <Reveal>
                <section className="relative overflow-hidden rounded-[32px] bg-[var(--brand-2)] p-8 text-[var(--brand-2-ink)] sm:p-14">
                  <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
                    <div className="max-w-xl space-y-2">
                      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
                        Não achou o que procurava?
                      </h2>
                      <p className="opacity-85">Fale com a gente: fazemos bolos e doces sob encomenda, do jeito que você imaginou.</p>
                    </div>
                    <a
                      href={waGeneral}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fx-btn inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-neutral-900 shadow-xl transition hover:-translate-y-0.5"
                    >
                      <IconWhatsapp className="h-5 w-5 text-[#25d366]" />
                      Chamar no WhatsApp
                    </a>
                  </div>
                </section>
              </Reveal>
            </div>
          )}

          {tab === 1 && (
            <section className="space-y-8">
              <SectionTitle eyebrow="Cardápio" title={activeCategory ? activeCategory.name : "Todos os produtos"} />
              {categories.length > 0 && (
                <div
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  {[{ id: null, name: "Todas", count: store.products.length }, ...categories].map((c) => {
                    const active = (activeTop?.id ?? null) === c.id;
                    return (
                      <button
                        key={c.id ?? "all"}
                        onClick={() => setCategory(c.id)}
                        aria-pressed={active}
                        className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {c.name}
                        <span className={`text-xs ${active ? "opacity-80" : "opacity-60"}`}>{c.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {activeTop && activeSiblings.length > 0 && (
                <div
                  key={activeTop.id}
                  className="-mx-4 flex animate-fade-up gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  {[{ id: activeTop.id, name: `Tudo em ${activeTop.name}`, count: activeTop.count }, ...activeSiblings].map((c) => {
                    const active = category === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                        aria-pressed={active}
                        className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                            : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {c.name}
                        <span className="text-xs opacity-60">{c.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto pelo nome…"
                    aria-label="Buscar produto pelo nome"
                    inputMode="search"
                    enterKeyHint="search"
                    className="h-12 w-full rounded-full border border-[var(--line)] bg-[var(--surface)] pl-12 pr-12 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  {search && (
                    <button
                      onClick={() => {
                        setSearch("");
                        searchRef.current?.focus();
                      }}
                      aria-label="Limpar busca"
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="h-12 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm outline-none focus:border-[var(--accent)]"
                  >
                    <option value="relevance">Relevância</option>
                    <option value="price-asc">Menor preço</option>
                    <option value="price-desc">Maior preço</option>
                    <option value="name">Nome (A–Z)</option>
                  </select>
                  <button
                    onClick={() => setOnlyAvailable((v) => !v)}
                    aria-pressed={onlyAvailable}
                    className={`inline-flex h-12 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                      onlyAvailable
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                  >
                    {onlyAvailable && <IconCheck className="h-4 w-4" />}
                    Disponíveis
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--line)] p-12 text-center text-[var(--muted)]">
                  Nenhum produto encontrado.
                </div>
              ) : (
                <div key={`${category ?? "all"}-${sort}-${onlyAvailable}`} className="fx-grid-in grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {filtered.map((p, i) => (
                    <div
                      key={p.id}
                      className="animate-fade-up"
                      style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                    >
                      {cardFor(p)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 2 && (
            <section className="space-y-12">
              <SectionTitle eyebrow="Passo a passo" title={<>Como fazer seu <Em>pedido</Em></>} />
              <CakeTablesSection
                tables={settings.cake_tables}
                note={settings.cake_table_note}
                orderLink={(text) => whatsappLink(settings.whatsapp, text)}
                heading={<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">Tabela de bolos</p>}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                {steps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 100}>
                    <div className="relative h-full overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 transition duration-500 hover:-translate-y-1 hover:shadow-xl">
                      <span className="absolute -right-2 -top-4 font-[family-name:var(--font-display)] text-[110px] font-semibold leading-none text-[var(--accent-text)] opacity-[0.08]">
                        {i + 1}
                      </span>
                      <div className="relative space-y-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]">
                          {i + 1}
                        </span>
                        <h3 className="pt-2 text-lg font-semibold">{step.title}</h3>
                        <p className="text-sm leading-relaxed text-[var(--muted)]">{step.text}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
              <FaqSection
                items={settings.faq}
                heading={<p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">Dúvidas frequentes</p>}
              />
              <div className="flex justify-center">
                <button
                  onClick={() => goTab(1)}
                  className="fx-btn inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-4 text-sm font-semibold text-[var(--accent-ink)] shadow-lg transition hover:-translate-y-0.5"
                >
                  Começar meu pedido <IconArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {tab === 3 && (
            <section className="space-y-10">
              <SectionTitle eyebrow="Contato" title={<>Fale com a <Em>gente</Em></>} />
              <FestivalsSection
                festivals={settings.festivals}
                locations={settings.locations}
                max={4}
                heading={<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">Festivais de Fatias</p>}
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="grid gap-4">
                  <a
                    href={waGeneral}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 rounded-3xl bg-[#25d366] p-6 text-white shadow-lg shadow-[#25d366]/25 transition hover:-translate-y-1"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                      <IconWhatsapp className="h-7 w-7" />
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wider opacity-80">WhatsApp</span>
                      <span className="block text-xl font-semibold">{formatWhatsappDisplay(settings.whatsapp)}</span>
                    </span>
                    <IconArrowRight className="ml-auto h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </a>
                  {settings.instagram && (
                    <a
                      href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 transition hover:-translate-y-1 hover:shadow-lg"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                        <IconInstagram className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">Instagram</span>
                        <span className="block font-semibold">@{settings.instagram.replace(/^@/, "")}</span>
                      </span>
                    </a>
                  )}
                  {settings.hours && (
                    <div className="flex items-start gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                        <IconClock className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">Atendimento</span>
                        <span className="block whitespace-pre-line font-medium">{settings.hours}</span>
                      </span>
                    </div>
                  )}
                  {settings.address && (
                    <div className="flex items-start gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                        <IconPin className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">Endereço</span>
                        <span className="block whitespace-pre-line font-medium">{settings.address}</span>
                      </span>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = `Olá, ${storeName}! ${question.text.trim()}${
                      question.name.trim() ? `\n\n— ${question.name.trim()}` : ""
                    }`;
                    trackStoreEvent(slug, "whatsapp_click");
                    window.open(whatsappLink(settings.whatsapp, text), "_blank", "noopener,noreferrer");
                  }}
                  className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
                >
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Tire suas dúvidas</h3>
                  <p className="text-sm text-[var(--muted)]">Escreva sua pergunta e enviamos direto para o nosso WhatsApp.</p>
                  <input
                    value={question.name}
                    onChange={(e) => setQuestion((q) => ({ ...q, name: e.target.value }))}
                    placeholder="Seu nome"
                    className="h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  <textarea
                    required
                    value={question.text}
                    onChange={(e) => setQuestion((q) => ({ ...q, text: e.target.value }))}
                    rows={5}
                    placeholder="Como podemos ajudar?"
                    className="w-full resize-none rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  <button
                    type="submit"
                    className="fx-btn fx-glow-wa flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25d366] text-sm font-semibold text-white shadow-lg shadow-[#25d366]/25 transition hover:-translate-y-0.5"
                  >
                    <IconWhatsapp className="h-5 w-5" />
                    Enviar no WhatsApp
                  </button>
                </form>
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="fx-footer relative border-t border-[var(--footer-line)] bg-[var(--footer-bg)] pb-28 text-sm text-[var(--footer-muted)]">
        <div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10">
          <div className="space-y-3">
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--footer-ink)]">{storeName}</p>
            {settings.tagline && <p className="leading-relaxed">{settings.tagline}</p>}
            <p className="leading-relaxed">Confeitaria artesanal: bolos, fatias e doces feitos com carinho, toda semana.</p>
          </div>

          <nav aria-label="Navegação" className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--footer-ink)]">Loja</p>
            <ul className="space-y-2">
              {TABS.map((label, i) => (
                <li key={label}>
                  <button onClick={() => goTab(i)} className="transition hover:text-[var(--footer-ink)] hover:underline underline-offset-4">
                    {label}
                  </button>
                </li>
              ))}
              <li>
                <a href={waCustom} target="_blank" rel="noopener noreferrer" className="transition hover:text-[var(--footer-ink)] hover:underline underline-offset-4">
                  Encomendas
                </a>
              </li>
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--footer-ink)]">Atendimento</p>
            <ul className="space-y-2">
              <li>
                <a href={waGeneral} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-[var(--footer-ink)] hover:underline underline-offset-4">
                  <IconWhatsapp className="h-4 w-4" />
                  {formatWhatsappDisplay(settings.whatsapp)}
                </a>
              </li>
              {instagramHandle && (
                <li>
                  <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-[var(--footer-ink)] hover:underline underline-offset-4">
                    <IconInstagram className="h-4 w-4" />@{instagramHandle}
                  </a>
                </li>
              )}
              {settings.hours && <li className="whitespace-pre-line">{settings.hours}</li>}
              {settings.address && <li className="whitespace-pre-line">{settings.address}</li>}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--footer-ink)]">Compra e entrega</p>
            <ul className="space-y-2 leading-relaxed">
              <li>Pedido enviado pelo WhatsApp, sem cadastro.</li>
              <li>
                Encomendas com {settings.production_days?.trim() || "antecedência"}: combine a data e o horário pelo WhatsApp.
              </li>
              <li>Pagamento pelo Pix ou combinado no atendimento.</li>
              <li>Retirada ou entrega: consulte disponibilidade e valor para a sua região.</li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1600px] flex-col items-center gap-4 px-4 pb-8 sm:px-6 lg:px-10">
          <TrustBadges badges={trustBadges} variant="compact" className="justify-center text-[var(--footer-ink)]" />
          <InstallAppButton storeName={storeName} className="flex flex-col items-center text-[var(--footer-ink)]" />
        </div>

        <div className="border-t border-[var(--footer-line)]">
          <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-4 py-5 text-xs sm:flex-row sm:px-6 lg:px-10">
            <p>
              © {new Date().getFullYear()}{" "}
              {/* Acesso à área interna: o nome da loja parece texto comum, mas leva ao login. */}
              <Link href="/login" className="cursor-text text-inherit no-underline">
                {storeName}
              </Link>
              . Todos os direitos reservados.
            </p>
            <p>
              Produzido por{" "}
              <a
                href="https://systems-niklaus.pages.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold tracking-[0.15em] text-inherit underline-offset-4 hover:underline"
              >
                NIKLAUS
              </a>
            </p>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        {units > 0 && (
          <button
            onClick={() => setCartOpen(true)}
            className="fx-btn fx-pulse flex animate-fade-up items-center gap-3 rounded-full bg-[var(--accent)] py-3 pl-5 pr-6 text-sm font-semibold text-[var(--accent-ink)] shadow-2xl transition hover:-translate-y-0.5"
          >
            <IconCart className="h-5 w-5" />
            {units} {units === 1 ? "item" : "itens"}
            {total > 0 ? ` · ${formatCurrency(total)}` : ""}
          </button>
        )}
        <a
          href={waGeneral}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-xl shadow-[#25d366]/40 transition hover:scale-110"
        >
          <IconWhatsapp className="h-7 w-7" />
        </a>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
          <div className="flex animate-toast-in items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <IconCheck className="h-4 w-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}

      <PromoSideTab maxPercent={promoMax} onOpen={openPromo} />
      <PromoPopup
        notices={promoList}
        open={promoOpen}
        onClose={closePromo}
        stack={!!settings.discounts_stack}
        onShop={() => {
          setPromoOpen(false);
          openCategory(null);
        }}
      />

      <SearchOverlay
        open={searchOpen}
        products={store.products}
        onClose={closeSearch}
        onOpenProduct={(id) => setOpenProductId(id)}
        onSeeAll={seeAllResults}
      />

      {openProduct && (
        <ProductModal
          product={openProduct}
          related={pickRelated(openProduct, store.products)}
          onOpenProduct={setOpenProductId}
          productionDays={settings.production_days}
          shareUrl={productLink(openProduct.id)}
          promoActive={(settings.promo_percent ?? 0) > 0 || (settings.cart_tiers ?? []).length > 0}
          line={lines.find((l) => l.id === openProduct.id)}
          storeName={storeName}
          whatsapp={settings.whatsapp}
          onClose={() => setOpenProductId(null)}
          onSave={(qty, note) => {
            setLine(openProduct.id, qty, note);
            setOpenProductId(null);
            showToast(`${openProduct.name} no seu pedido`);
          }}
        />
      )}

      <CartDrawer
        open={cartOpen}
        lines={orderLines}
        storeName={storeName}
        whatsapp={settings.whatsapp}
        customer={customer}
        onCustomer={setCustomer}
        onClose={() => setCartOpen(false)}
        onQty={(id, qty) => setLine(id, qty)}
        onNote={(id, note) =>
          setLines((prev) => prev.map((l) => (l.id === id ? { ...l, note } : l)))
        }
        onRemove={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
        onClear={() => setLines([])}
        onBrowse={() => goTab(1)}
        onSent={() => {
          showToast("Abrindo o WhatsApp…");
          signupFromOrder(customer.name, customer.phone ?? "", customer.birth, slug);
        }}
        badges={trustBadges}
        productionDays={settings.production_days}
        rules={discountRules}
      />
    </div>
    </InstallmentsContext.Provider>
  );
}
