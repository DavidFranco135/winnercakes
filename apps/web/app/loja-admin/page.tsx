"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError, uploadImage } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import type { StoreAdminResponse, StoreCakeTable, StoreFaq, StoreFestival, StoreFlavor, StoreGalleryPhoto, StoreLocation, StoreSettings } from "@/lib/store";
import {
  ACCENTS,
  THEME_OPTIONS,
  DEFAULT_WHATSAPP,
  formatWhatsappDisplay,
  normalizeWhatsapp,
  refreshPublicStoreCache,
  STORE_SLUG,
} from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { clearDraft, readDraft, writeDraft } from "@/lib/drafts";
import { SearchInput } from "@/components/SearchInput";
import { matchesSearch } from "@/lib/search";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { focusFor, focusStyle } from "@/lib/focus";
import { PhotoFramer } from "@/components/PhotoFramer";
import { VisitStats } from "@/components/store/VisitStats";

const EMPTY: StoreSettings = {
  display_name: "",
  logo_url: "",
  tagline: "",
  about: "",
  whatsapp: DEFAULT_WHATSAPP,
  instagram: "winnercakes",
  hours: "",
  address: "",
  accent: "vermelho",
  theme: "winner",
  slides: [],
  highlights: [],
  reels: [],
  hidden_product_ids: [],
  featured_product_ids: [],
  product_order: [],
  price_on_request_product_ids: [],
  categories: [],
};

function newCategoryId(): string {
  return `cat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const input =
  "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 sm:p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// Resumo curto do que está salvo (para saber se mudou desde o rascunho).
function settingsSignature(value: unknown): string {
  const text = JSON.stringify(value ?? {});
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash}`;
}

export default function LojaAdminPage() {
  const { status, accessToken, currentOrganizationId } = useAuth();
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [settings, setSettings] = useState<StoreSettings>(EMPTY);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "visible" | "hidden">("all");
  // Categoria cujo seletor de foto principal está aberto.
  const [coverPickerFor, setCoverPickerFor] = useState<string | null>(null);
  // Enquadramento aberto: foto de um produto (destaque/lista) ou capa de categoria.
  const [framing, setFraming] = useState<{
    kind: "product" | "category" | "slide";
    id: string;
    url: string;
    initial: { x: number; y: number };
  } | null>(null);
  const [isSavingFrame, setIsSavingFrame] = useState(false);

  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;
  const draftKey = `loja-admin:${currentOrganizationId}`;
  const [restoredDraft, setRestoredDraft] = useState(false);
  // "Assinatura" do que estava salvo quando a edição começou. O rascunho só
  // volta se o salvo ainda for o mesmo; se a loja foi alterada em outro
  // aparelho ou endereço (ex.: pages.dev × domínio próprio), o rascunho velho
  // é descartado em vez de cobrir as mudanças mais novas.
  const savedSig = useRef("");
  // A loja foi salva em outra aba/aparelho depois que esta página abriu:
  // salvar daqui apagaria aquelas mudanças, então pergunta antes.
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId) return;
    setIsLoading(true);
    try {
      const [store, productsData] = await Promise.all([
        apiFetch<StoreAdminResponse>(`${orgPath}/store`, { accessToken }),
        apiFetch<Product[]>(`${orgPath}/products`, { accessToken }),
      ]);
      setSlug(store.slug);
      setProducts(productsData);
      // Alterações não salvas de antes (ex.: o celular fechou o app em segundo
      // plano) voltam por cima do que está salvo.
      const sig = settingsSignature(store.settings);
      savedSig.current = sig;
      const stored = readDraft<{ base?: string; value?: StoreSettings }>(draftKey);
      const draft = stored && stored.base === sig && stored.value ? stored.value : null;
      if (stored && !draft) clearDraft(draftKey);
      if (draft) {
        setSettings({ ...EMPTY, ...store.settings, ...draft });
        setDirty(true);
        setRestoredDraft(true);
      } else {
        setSettings({ ...EMPTY, ...store.settings });
        setDirty(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar a loja.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentOrganizationId, orgPath, draftKey]);

  // Guarda no aparelho o que ainda não foi salvo.
  useEffect(() => {
    if (dirty && currentOrganizationId) writeDraft(draftKey, { base: savedSig.current, value: settings });
  }, [dirty, settings, draftKey, currentOrganizationId]);

  function discardDraft() {
    clearDraft(draftKey);
    setRestoredDraft(false);
    setMessage(null);
    load();
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    const timeoutId = setTimeout(load, 0);
    return () => clearTimeout(timeoutId);
  }, [status, router, load]);

  const publicUrl = useMemo(() => {
    if (!slug || typeof window === "undefined") return "";
    // A loja principal abre direto no endereço do site.
    return slug === STORE_SLUG ? `${window.location.origin}/` : `${window.location.origin}/loja?s=${slug}`;
  }, [slug]);

  function update(patch: Partial<StoreSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
    setMessage(null);
  }

  // Arte em pé para o celular de um slide (sem ela, o celular usa a mesma foto).
  async function handleSlideMobileUpload(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken) return;
    setIsUploading(true);
    setError(null);
    try {
      const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
      update({ slides: settings.slides.map((s, j) => (j === index ? { ...s, mobile_url: url } : s)) });
      setMessage("Foto do celular adicionada. Clique em “Salvar alterações” para publicar.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar imagem.");
    } finally {
      setIsUploading(false);
    }
  }

  // Envia uma foto e devolve o link (para sabores e galeria).
  async function uploadOne(file: File): Promise<string | null> {
    if (!accessToken) return null;
    setIsUploading(true);
    setError(null);
    try {
      const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
      return url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar imagem.");
      return null;
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSlideUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || !accessToken) return;
    const room = 10 - settings.slides.length;
    setIsUploading(true);
    setError(null);
    try {
      const added: StoreSettings["slides"] = [];
      for (const file of files.slice(0, room)) {
        const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
        added.push({ url, title: "", subtitle: "" });
      }
      update({ slides: [...settings.slides, ...added] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar imagem.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleBackgroundUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken) return;
    setIsUploading(true);
    setError(null);
    try {
      const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
      update({ background_style: "foto", background_url: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar a foto de fundo.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken) return;
    setIsUploading(true);
    setError(null);
    try {
      const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
      update({ logo_url: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar a logo.");
    } finally {
      setIsUploading(false);
    }
  }

  function moveSlide(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= settings.slides.length) return;
    const next = [...settings.slides];
    [next[index], next[target]] = [next[target], next[index]];
    update({ slides: next });
  }

  function toggleId(
    list: "hidden_product_ids" | "featured_product_ids" | "price_on_request_product_ids",
    id: string
  ) {
    const current = settings[list];
    update({ [list]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  }

  function addCategory() {
    update({
      categories: [...settings.categories, { id: newCategoryId(), name: "", product_ids: [], cover_url: "" }],
    });
  }

  // Trocar a foto volta o enquadramento para o centro.
  function setCategoryCover(id: string, url: string) {
    update({
      categories: settings.categories.map((c) =>
        c.id === id ? { ...c, cover_url: url, cover_x: 50, cover_y: 50 } : c
      ),
    });
  }

  function openProductFrame(p: Product) {
    const url = p.photo_urls[0];
    if (!url) return;
    setFraming({ kind: "product", id: p.id, url, initial: focusFor(p.photo_focus, url) });
  }

  function openCategoryFrame(id: string, url: string, initial: { x: number; y: number }) {
    if (!url) return;
    setFraming({ kind: "category", id, url, initial });
  }

  function openSlideFrame(index: number) {
    const slide = settings.slides[index];
    if (!slide) return;
    setFraming({
      kind: "slide",
      id: String(index),
      url: slide.url,
      initial: { x: slide.x ?? 50, y: slide.y ?? 50 },
    });
  }

  // Volta o slide para "foto inteira, sem corte".
  function clearSlideFrame(index: number) {
    update({ slides: settings.slides.map((s, j) => (j === index ? { ...s, x: null, y: null } : s)) });
  }

  async function handleSaveFrame(pos: { x: number; y: number }) {
    if (!framing) return;
    if (framing.kind === "slide") {
      // Slides fazem parte das configurações da loja: gravam em "Salvar alterações".
      const index = Number(framing.id);
      update({ slides: settings.slides.map((s, j) => (j === index ? { ...s, x: pos.x, y: pos.y } : s)) });
      setFraming(null);
      setMessage("Enquadramento do slide aplicado. Clique em “Salvar alterações” para publicar.");
      return;
    }
    if (framing.kind === "category") {
      // A capa é parte das configurações da loja: grava ao clicar em "Salvar alterações".
      update({
        categories: settings.categories.map((c) =>
          c.id === framing.id ? { ...c, cover_url: framing.url, cover_x: pos.x, cover_y: pos.y } : c
        ),
      });
      setFraming(null);
      setMessage("Enquadramento da capa aplicado. Clique em “Salvar alterações” para publicar.");
      return;
    }
    // Foto de produto: mesmo enquadramento do catálogo (vale no catálogo, nos destaques e na loja).
    if (!accessToken) return;
    const product = products.find((x) => x.id === framing.id);
    if (!product) return;
    setIsSavingFrame(true);
    setError(null);
    try {
      const others = product.photo_focus.filter(
        (f) => f.url !== framing.url && product.photo_urls.includes(f.url)
      );
      const updated = await apiFetch<Product>(`${orgPath}/products/${product.id}`, {
        method: "PATCH",
        accessToken,
        body: JSON.stringify({ photo_focus: [...others, { url: framing.url, ...pos }] }),
      });
      setProducts((items) => items.map((x) => (x.id === updated.id ? updated : x)));
      refreshPublicStoreCache(slug);
      setFraming(null);
      setMessage("Enquadramento salvo. A loja pública atualiza em até 1 minuto.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar o enquadramento.");
    } finally {
      setIsSavingFrame(false);
    }
  }

  async function handleCategoryCoverUpload(categoryId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken) return;
    setIsUploading(true);
    setError(null);
    try {
      const { url } = await uploadImage(`${orgPath}/uploads/image`, accessToken, file);
      setCategoryCover(categoryId, url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar a foto da categoria.");
    } finally {
      setIsUploading(false);
    }
  }

  function renameCategory(id: string, name: string) {
    update({ categories: settings.categories.map((c) => (c.id === id ? { ...c, name } : c)) });
  }

  function setCategoryParent(id: string, parentId: string) {
    update({ categories: settings.categories.map((c) => (c.id === id ? { ...c, parent_id: parentId } : c)) });
  }

  function moveCategory(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= settings.categories.length) return;
    const next = [...settings.categories];
    [next[index], next[target]] = [next[target], next[index]];
    update({ categories: next });
  }

  function removeCategory(id: string) {
    const category = settings.categories.find((c) => c.id === id);
    if (category?.name.trim() && !window.confirm(`Apagar a categoria "${category.name}"? Os produtos não são apagados.`)) return;
    update({
      categories: settings.categories
        .filter((c) => c.id !== id)
        // As subcategorias da categoria apagada voltam a ser principais.
        .map((c) => (c.parent_id === id ? { ...c, parent_id: "" } : c)),
    });
  }

  function toggleCategory(categoryId: string, productId: string) {
    update({
      categories: settings.categories.map((c) =>
        c.id !== categoryId
          ? c
          : {
              ...c,
              product_ids: c.product_ids.includes(productId)
                ? c.product_ids.filter((x) => x !== productId)
                : [...c.product_ids, productId],
            }
      ),
    });
  }

  // Produtos na ordem escolhida (os que ainda não têm posição vão para o fim,
  // na ordem de cadastro — igual ao que a loja pública faz).
  const orderedProducts = useMemo(() => {
    const rank = new Map(settings.product_order.map((id, i) => [id, i]));
    const fallback = settings.product_order.length;
    return products
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (rank.get(a.p.id) ?? fallback) - (rank.get(b.p.id) ?? fallback) || a.i - b.i)
      .map(({ p }) => p);
  }, [products, settings.product_order]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const listedProducts = orderedProducts.filter((p) => {
    const hidden = settings.hidden_product_ids.includes(p.id);
    return (
      matchesSearch(productSearch, p.name, p.description) &&
      (visibilityFilter === "all" || (visibilityFilter === "hidden") === hidden)
    );
  });

  // Move um produto na lista (trocando de lugar com o vizinho da lista que está
  // sendo exibida — assim funciona também com busca/filtro ativos) ou para o topo.
  function moveProduct(id: string, action: "up" | "down" | "top") {
    const full = orderedProducts.map((p) => p.id);
    const from = full.indexOf(id);
    if (from < 0) return;
    if (action === "top") {
      if (from === 0) return;
      update({ product_order: [id, ...full.filter((x) => x !== id)] });
      return;
    }
    const shown = listedProducts.map((p) => p.id);
    const at = shown.indexOf(id);
    const neighbor = shown[at + (action === "up" ? -1 : 1)];
    if (neighbor === undefined) return;
    const to = full.indexOf(neighbor);
    const next = [...full];
    [next[from], next[to]] = [next[to], next[from]];
    update({ product_order: next });
  }

  // Destaques visíveis, na ordem escolhida.
  const featuredList = useMemo(
    () =>
      Array.from(new Set(settings.featured_product_ids))
        .map((id) => productsById.get(id))
        .filter((p): p is Product => !!p && !settings.hidden_product_ids.includes(p.id)),
    [settings.featured_product_ids, settings.hidden_product_ids, productsById]
  );

  function moveFeatured(id: string, action: "up" | "down" | "top") {
    const ids = featuredList.map((p) => p.id);
    const from = ids.indexOf(id);
    if (from < 0) return;
    const next = [...ids];
    if (action === "top") {
      if (from === 0) return;
      next.splice(from, 1);
      next.unshift(id);
    } else {
      const to = from + (action === "up" ? -1 : 1);
      if (to < 0 || to >= next.length) return;
      [next[from], next[to]] = [next[to], next[from]];
    }
    // Mantém no fim os destaques de produtos ocultos/removidos (não aparecem aqui).
    const rest = settings.featured_product_ids.filter((x) => !next.includes(x));
    update({ featured_product_ids: [...next, ...rest] });
  }

  // Mostra/oculta de uma vez todos os produtos que estão na lista filtrada.
  function setVisibilityForListed(visible: boolean) {
    const ids = new Set(listedProducts.map((p) => p.id));
    const others = settings.hidden_product_ids.filter((id) => !ids.has(id));
    update({ hidden_product_ids: visible ? others : [...others, ...ids] });
  }

  async function handleSave(force = false) {
    if (!accessToken) return;
    setIsSaving(true);
    setError(null);
    try {
      if (!force) {
        const current = await apiFetch<StoreAdminResponse>(`${orgPath}/store`, { accessToken });
        if (savedSig.current && settingsSignature(current.settings) !== savedSig.current) {
          setConflict(true);
          return;
        }
      }
      setConflict(false);
      const body = {
        ...settings,
        whatsapp: normalizeWhatsapp(settings.whatsapp) || DEFAULT_WHATSAPP,
        highlights: settings.highlights.filter((h) => h.title.trim() || h.text.trim()),
        trust_badges: (settings.trust_badges ?? []).map((b) => b.trim()).filter(Boolean),
        cart_tiers: (settings.cart_tiers ?? []).filter((t) => t.percent > 0 && t.min_total > 0),
        // Só grava a ordem se o lojista reordenou; assim ids apagados saem da lista.
        product_order: settings.product_order.length > 0 ? orderedProducts.map((p) => p.id) : [],
        categories: settings.categories
          .filter((c) => c.name.trim())
          .map((c) => ({ ...c, name: c.name.trim() })),
      };
      const saved = await apiFetch<StoreAdminResponse>(`${orgPath}/store`, {
        method: "PUT",
        accessToken,
        body: JSON.stringify(body),
      });
      // Uma API antiga (ainda não republicada) ignora em silêncio os campos
      // novos: a foto da categoria e a ordem não seriam gravadas. Avisa.
      const savedAny = saved.settings as Partial<StoreSettings>;
      const savedCats = (savedAny.categories ?? []) as Array<{ cover_url?: string; cover_x?: number }>;
      const savedSlides = (savedAny.slides ?? []) as Array<{ x?: number | null }>;
      const apiIsOld =
        // Descontos/selos/prazo: a API nova sempre devolve essas chaves.
        savedAny.promo_percent === undefined ||
        savedAny.installments_max === undefined ||
        savedAny.festivals === undefined ||
        (body.product_order.length > 0 && savedAny.product_order === undefined) ||
        // Categorias: a API nova sempre devolve cover_url e cover_x.
        (body.categories.length > 0 && savedCats.some((c) => c.cover_url === undefined || c.cover_x === undefined)) ||
        // Slides: a API nova sempre devolve a chave "x" (null quando sem enquadramento).
        (body.slides.length > 0 && savedSlides.some((s) => s.x === undefined)) ||
        // Subcategorias: a API nova sempre devolve parent_id.
        (body.categories.some((c) => c.parent_id) && savedCats.some((c) => (c as { parent_id?: string }).parent_id === undefined));
      setSettings({ ...EMPTY, ...saved.settings });
      savedSig.current = settingsSignature(saved.settings);
      setDirty(false);
      clearDraft(draftKey);
      setRestoredDraft(false);
      refreshPublicStoreCache(saved.slug);
      if (apiIsOld) {
        setError(
          "Salvo, mas a API publicada ainda é a versão antiga: descontos, selos, prazo de produção, modo escuro automático, a ordem dos produtos e o enquadramento das fotos NÃO foram gravados. Rode o PUBLICAR-API.bat (na pasta do site, em Documentos) e salve de novo."
        );
        setMessage(null);
      } else {
        setMessage("Alterações salvas. A loja pública atualiza em até 1 minuto.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie o link:", publicUrl);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Carregando…</p>
      </main>
    );
  }

  return (
    <AppShell title="Minha Loja">
      <div className="mx-auto max-w-4xl space-y-5 pb-28">
        {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}
        {message && <p className="rounded bg-green-950 p-2 text-sm text-green-300">{message}</p>}

        {isLoading ? (
          <p className="text-neutral-500">Carregando…</p>
        ) : (
          <>
            {accessToken && currentOrganizationId && (
              <VisitStats orgPath={orgPath} accessToken={accessToken} />
            )}
            <Card title="Link da loja pública" hint="Compartilhe com seus clientes. Não precisa de login.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={publicUrl} className={`${input} sm:flex-1`} />
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
                  >
                    {copied ? "Copiado!" : "Copiar link"}
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
                  >
                    Abrir loja
                  </a>
                </div>
              </div>
              {dirty && (
                <p className="text-xs text-yellow-400">Você tem alterações não salvas — salve para publicá-las.</p>
              )}
            </Card>

            <Card title="Logo da loja" hint="Aparece no topo da loja pública, ao lado do nome. Use uma imagem quadrada.">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-xs text-neutral-600">
                  {settings.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={settings.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    "Sem logo"
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded border border-dashed border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:border-blue-500">
                    {isUploading ? "Enviando…" : settings.logo_url ? "Trocar logo" : "+ Enviar logo"}
                    <input type="file" accept="image/*" disabled={isUploading} onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {settings.logo_url && (
                    <button
                      onClick={() => update({ logo_url: "" })}
                      className="rounded border border-red-900 px-4 py-2 text-sm text-red-400 hover:bg-red-950"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </Card>

            <Card
              title="Festivais de Fatias e locais"
              hint="As datas aparecem na página inicial (a próxima em destaque, com “Como chegar”) e na faixa do topo. Datas passadas somem sozinhas da loja."
            >
              <FestivalEditor
                festivals={settings.festivals ?? []}
                locations={settings.locations ?? []}
                onChange={(patch) => update(patch)}
              />
              <label className="block space-y-1 border-t border-neutral-800 pt-4">
                <span className="text-xs text-neutral-500">Aviso embaixo do calendário (horário, regras…)</span>
                <textarea
                  className={input}
                  rows={2}
                  maxLength={300}
                  value={settings.festival_note ?? ""}
                  placeholder="Abrimos sempre às 13h e ficamos até encerrarem as fatias!"
                  onChange={(e) => update({ festival_note: e.target.value })}
                />
              </label>
            </Card>

            <Card title="Sabores" hint="Quadro de sabores na página inicial (ex.: sabores das fatias do festival). Cada sabor pode ter uma foto.">
              <FlavorsEditor
                title={settings.flavors_title ?? "Sabores das fatias"}
                flavors={settings.flavors ?? []}
                onChange={(patch) => update(patch)}
                upload={uploadOne}
                busy={isUploading}
              />
            </Card>

            <Card title="Tabela de bolos" hint="Formatos (Redondos, Quadrados…) com tamanhos, rendimento e preço. Na loja, cada tamanho abre o WhatsApp já com o pedido escrito.">
              <CakeTablesEditor
                tables={settings.cake_tables ?? []}
                note={settings.cake_table_note ?? ""}
                onChange={(patch) => update(patch)}
                upload={uploadOne}
                busy={isUploading}
              />
            </Card>

            <Card title="Dúvidas frequentes" hint="Perguntas e respostas na página inicial e em “Como pedir” (entrega, sinal, sabores…).">
              <FaqEditor faq={settings.faq ?? []} onChange={(faq) => update({ faq })} />
            </Card>

            <Card title="Galeria de fotos" hint="Fotos de encomendas, festas e festivais, na seção “Nossas criações”. No celular passam de lado; no computador formam um mosaico.">
              <GalleryEditor
                photos={settings.gallery ?? []}
                onChange={(gallery) => update({ gallery })}
                upload={uploadOne}
                busy={isUploading}
              />
            </Card>

            <Card title="Capa com slides" hint="Fotos que passam automaticamente no topo da loja (até 10). Sem slides, usamos as fotos dos seus produtos.">
              <label className="inline-block cursor-pointer rounded border border-dashed border-neutral-600 px-4 py-3 text-sm text-neutral-300 hover:border-blue-500">
                {isUploading ? "Enviando…" : "+ Adicionar fotos da capa"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={isUploading || settings.slides.length >= 10}
                  onChange={handleSlideUpload}
                  className="hidden"
                />
              </label>
              {settings.slides.length === 0 ? (
                <p className="text-sm text-neutral-500">Nenhum slide ainda.</p>
              ) : (
                <ul className="space-y-3">
                  {settings.slides.map((slide, i) => (
                    <li key={`${slide.url}-${i}`} className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-3 sm:flex-row">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slide.url}
                        alt=""
                        className="h-24 w-full rounded object-cover sm:w-40"
                        style={
                          slide.x != null && slide.y != null
                            ? { objectPosition: `${slide.x}% ${slide.y}%` }
                            : undefined
                        }
                      />
                      <div className="flex-1 space-y-2">
                        <input
                          className={input}
                          placeholder="Título (opcional)"
                          value={slide.title}
                          maxLength={120}
                          onChange={(e) =>
                            update({
                              slides: settings.slides.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)),
                            })
                          }
                        />
                        <input
                          className={input}
                          placeholder="Subtítulo (opcional)"
                          value={slide.subtitle}
                          maxLength={240}
                          onChange={(e) =>
                            update({
                              slides: settings.slides.map((s, j) =>
                                j === i ? { ...s, subtitle: e.target.value } : s
                              ),
                            })
                          }
                        />
                        <select
                          className={input}
                          value={slide.link === "whatsapp" ? "whatsapp" : slide.link ? "link" : ""}
                          onChange={(e) =>
                            update({
                              slides: settings.slides.map((s, j) =>
                                j === i ? { ...s, link: e.target.value === "link" ? "https://" : e.target.value } : s
                              ),
                            })
                          }
                        >
                          <option value="">Ao tocar: abre o cardápio</option>
                          <option value="whatsapp">Ao tocar: abre o WhatsApp (encomenda)</option>
                          <option value="link">Ao tocar: abre um link…</option>
                        </select>
                        {slide.link && slide.link !== "whatsapp" && (
                          <input
                            className={input}
                            value={slide.link}
                            maxLength={600}
                            placeholder="https://…"
                            onChange={(e) =>
                              update({ slides: settings.slides.map((s, j) => (j === i ? { ...s, link: e.target.value } : s)) })
                            }
                          />
                        )}
                        {/* Foto para celular: arte em pé, mostrada só no celular (tela cheia). */}
                        <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 p-2">
                          {slide.mobile_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={slide.mobile_url} alt="" className="h-16 w-11 rounded object-cover" />
                          ) : null}
                          <span className="flex-1 text-xs text-neutral-500">
                            {slide.mobile_url
                              ? "Foto do celular (em pé)."
                              : "Celular: usa a mesma foto. Envie uma arte em pé (ex.: 1080×1620) para a capa ocupar a tela."}
                          </span>
                          <label className="cursor-pointer rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500">
                            {slide.mobile_url ? "Trocar" : "Foto para celular"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => handleSlideMobileUpload(i, e)}
                            />
                          </label>
                          {slide.mobile_url && (
                            <button
                              onClick={() =>
                                update({ slides: settings.slides.map((s, j) => (j === i ? { ...s, mobile_url: "" } : s)) })
                              }
                              className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:flex-col">
                        <button
                          onClick={() => openSlideFrame(i)}
                          className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                        >
                          Enquadrar
                        </button>
                        {slide.x != null && slide.y != null && (
                          <button
                            onClick={() => clearSlideFrame(i)}
                            title="Mostrar a foto inteira, sem corte"
                            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
                          >
                            Foto inteira
                          </button>
                        )}
                        <button onClick={() => moveSlide(i, -1)} disabled={i === 0} className="rounded border border-neutral-700 px-3 py-1 text-xs disabled:opacity-30">
                          ↑
                        </button>
                        <button onClick={() => moveSlide(i, 1)} disabled={i === settings.slides.length - 1} className="rounded border border-neutral-700 px-3 py-1 text-xs disabled:opacity-30">
                          ↓
                        </button>
                        <button
                          onClick={() => update({ slides: settings.slides.filter((_, j) => j !== i) })}
                          className="rounded border border-red-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950"
                        >
                          Apagar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Informações da loja">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">Nome da loja</label>
                  <input className={input} value={settings.display_name} placeholder="Ex.: Winner Cakes" maxLength={120} onChange={(e) => update({ display_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">Frase de efeito</label>
                  <input className={input} value={settings.tagline} placeholder="Ex.: Confeitaria artesanal — toda semana tem Festival de Fatias" maxLength={200} onChange={(e) => update({ tagline: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">WhatsApp (com DDD)</label>
                  <input className={input} value={settings.whatsapp} placeholder="21 97038-6065" onChange={(e) => update({ whatsapp: e.target.value })} />
                  <p className="text-[11px] text-neutral-600">Será exibido como {formatWhatsappDisplay(settings.whatsapp)}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">Instagram (opcional)</label>
                  <input className={input} value={settings.instagram} placeholder="@sualoja" maxLength={120} onChange={(e) => update({ instagram: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-neutral-500">Vídeos do Instagram (Reels) — um link por linha, até 12</label>
                  <textarea
                    className={input}
                    rows={3}
                    value={(settings.reels ?? []).join("\n")}
                    placeholder="https://www.instagram.com/reel/XXXXXXXX/"
                    onChange={(e) => update({ reels: e.target.value.split("\n").map((l) => l.trim()).slice(0, 12) })}
                  />
                  <p className="text-[11px] text-neutral-600">
                    No Instagram, abra o Reel, toque em Compartilhar → Copiar link e cole aqui. O vídeo aparece na página inicial da loja.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">Horário de atendimento</label>
                  <textarea className={input} rows={2} value={settings.hours} placeholder="Seg a Sex, 9h às 18h" maxLength={300} onChange={(e) => update({ hours: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">Endereço / região de entrega</label>
                  <textarea className={input} rows={2} value={settings.address} placeholder="Rio de Janeiro - RJ" maxLength={300} onChange={(e) => update({ address: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-neutral-500">Sobre a loja</label>
                  <textarea className={input} rows={4} value={settings.about} placeholder="Conte sua história, seus diferenciais…" maxLength={2000} onChange={(e) => update({ about: e.target.value })} />
                </div>
              </div>
            </Card>

            <Card title="Diferenciais e faixa do topo" hint="Até 3 itens. Aparecem como cards abaixo da capa e também passam na faixa de avisos do topo da loja (título · texto). Para mudar a faixa, edite aqui e salve.">
              <div className="space-y-2">
                {settings.highlights.map((h, i) => (
                  <div key={i} className="flex flex-col gap-2 sm:flex-row">
                    <input className={`${input} sm:w-56`} placeholder="Título" value={h.title} maxLength={80}
                      onChange={(e) => update({ highlights: settings.highlights.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <input className={`${input} sm:flex-1`} placeholder="Descrição" value={h.text} maxLength={240}
                      onChange={(e) => update({ highlights: settings.highlights.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                    <button onClick={() => update({ highlights: settings.highlights.filter((_, j) => j !== i) })} className="rounded border border-red-900 px-3 py-2 text-xs text-red-400 hover:bg-red-950">
                      Remover
                    </button>
                  </div>
                ))}
                {settings.highlights.length < 3 && (
                  <button onClick={() => update({ highlights: [...settings.highlights, { title: "", text: "" }] })} className="text-sm text-blue-400 hover:underline">
                    + Adicionar diferencial
                  </button>
                )}
              </div>
            </Card>

            <Card title="Aparência">
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">Cor de destaque</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ACCENTS).map(([key, a]) => (
                    <button
                      key={key}
                      onClick={() => update({ accent: key })}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                        settings.accent === key ? "border-blue-500 bg-blue-950" : "border-neutral-700 hover:border-neutral-500"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full" style={{ background: a.swatch ?? a.color }} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">Tema</p>
                <div className="flex flex-wrap gap-2">
                  {THEME_OPTIONS.map(({ key: t, label }) => (
                    <button
                      key={t}
                      onClick={() => update({ theme: t })}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
                        settings.theme === t ? "border-blue-500 bg-blue-950 text-blue-200" : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                      }`}
                    >
                      {t === "winner" && (
                        <span
                          aria-hidden
                          className="h-4 w-4 rounded-full border border-[#d73333]"
                          style={{ background: "linear-gradient(135deg, #fff4e4 50%, #d73333 50%)" }}
                        />
                      )}
                      {label}
                    </button>
                  ))}
                </div>
                {settings.theme === "winner" && (
                  <p className="text-[11px] text-neutral-500">
                    Paleta da marca: fundo creme de chantilly, cards brancos, textos chocolate, faixa do topo e rodapé no vermelho da logo. Os botões usam a cor de destaque escolhida acima (Vermelho Winner é a original).
                  </p>
                )}
              </div>
            </Card>

            <Card
              title="Fundo da loja"
              hint="Uma imagem bem esmaecida atrás de todo o site: uma foto sua (bancada, vitrine de bolos, festival…). Os cards e textos continuam por cima, legíveis."
            >
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["none", "Liso (sem fundo)"],
                    ["foto", "Minha foto"],
                  ] as const
                ).map(([key, text]) => (
                  <button
                    key={key}
                    onClick={() => update({ background_style: key })}
                    className={`rounded-lg border px-4 py-2 text-sm ${
                      (settings.background_style ?? "none") === key
                        ? "border-blue-500 bg-blue-950 text-blue-200"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {settings.background_style === "foto" && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="h-20 w-32 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                    {settings.background_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgSrc(settings.background_url, IMG_WIDTH.thumb)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <label className="cursor-pointer rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500">
                    {isUploading ? "Enviando…" : settings.background_url ? "Trocar foto" : "Enviar foto"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
                  </label>
                  {!settings.background_url && (
                    <span className="text-xs text-amber-400">Envie uma foto para o fundo aparecer.</span>
                  )}
                </div>
              )}

              {(settings.background_style ?? "none") !== "none" && (
                <>
                  <label className="block space-y-1">
                    <span className="flex justify-between text-xs text-neutral-500">
                      <span>Intensidade (quanto aparece)</span>
                      <span>{settings.background_opacity ?? 18}%</span>
                    </span>
                    <input
                      type="range"
                      min={3}
                      max={60}
                      step={1}
                      value={settings.background_opacity ?? 18}
                      onChange={(e) => update({ background_opacity: Number(e.target.value) })}
                      className="w-full accent-blue-600"
                    />
                    <span className="flex justify-between text-[11px] text-neutral-600">
                      <span>bem esmaecido</span>
                      <span>forte</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-lg border border-neutral-800 p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!settings.background_header}
                      onChange={(e) => update({ background_header: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm">Usar também no cabeçalho</span>
                      <span className="block text-xs text-neutral-500">
                        A mesma imagem atrás da logo e do menu, um pouco mais visível.
                      </span>
                    </span>
                  </label>
                </>
              )}
            </Card>

            <Card
              title="Descontos e promoções"
              hint="Promoção em todos os itens (ex.: Black Friday) e descontos por valor do pedido (ex.: 20% a partir de R$ 500). Os avisos aparecem na faixa do topo e num banner da página inicial, e o desconto é calculado no carrinho e na mensagem do WhatsApp. Desconto de um produto só: em Produtos → Editar."
            >
              <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
                <p className="text-sm font-medium">Promoção em todos os itens</p>
                <div className="grid gap-2 sm:grid-cols-[110px_1fr]">
                  <label className="space-y-1">
                    <span className="block text-xs text-neutral-500">% OFF</span>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      step={1}
                      inputMode="decimal"
                      className={input}
                      value={settings.promo_percent ? String(settings.promo_percent) : ""}
                      placeholder="0"
                      onChange={(e) =>
                        update({ promo_percent: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs text-neutral-500">Nome da promoção</span>
                    <input
                      className={input}
                      maxLength={60}
                      value={settings.promo_label ?? ""}
                      placeholder="Black Friday"
                      onChange={(e) => update({ promo_label: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="block text-xs text-neutral-500">Começa em (vazio = já)</span>
                    <input
                      type="date"
                      className={input}
                      value={settings.promo_start ?? ""}
                      onChange={(e) => update({ promo_start: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs text-neutral-500">Termina em (vazio = sem fim)</span>
                    <input
                      type="date"
                      className={input}
                      value={settings.promo_end ?? ""}
                      onChange={(e) => update({ promo_end: e.target.value })}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Para desligar, deixe 0%. Fora das datas a promoção some sozinha da loja.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
                <p className="text-sm font-medium">Desconto por valor do pedido</p>
                {(settings.cart_tiers ?? []).map((tier, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1">
                      <span className="block text-xs text-neutral-500">% OFF</span>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        inputMode="decimal"
                        className={`${input} w-24`}
                        value={tier.percent || ""}
                        onChange={(e) =>
                          update({
                            cart_tiers: (settings.cart_tiers ?? []).map((t, j) =>
                              j === i ? { ...t, percent: Math.max(0, Math.min(90, Number(e.target.value) || 0)) } : t
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs text-neutral-500">a partir de (R$)</span>
                      <input
                        type="number"
                        min={1}
                        step="0.01"
                        inputMode="decimal"
                        className={`${input} w-36`}
                        value={tier.min_total || ""}
                        onChange={(e) =>
                          update({
                            cart_tiers: (settings.cart_tiers ?? []).map((t, j) =>
                              j === i ? { ...t, min_total: Math.max(0, Number(e.target.value) || 0) } : t
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      onClick={() => update({ cart_tiers: (settings.cart_tiers ?? []).filter((_, j) => j !== i) })}
                      className="rounded border border-red-900 px-3 py-2 text-xs text-red-400 hover:bg-red-950"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {(settings.cart_tiers ?? []).length < 5 && (
                  <button
                    onClick={() =>
                      update({ cart_tiers: [...(settings.cart_tiers ?? []), { percent: 10, min_total: 300 }] })
                    }
                    className="text-sm text-blue-400 hover:underline"
                  >
                    + Adicionar faixa
                  </button>
                )}
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-neutral-800 p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!settings.discounts_stack}
                  onChange={(e) => update({ discounts_stack: e.target.checked })}
                />
                <span>
                  <span className="block text-sm">Acumular descontos</span>
                  <span className="block text-xs text-neutral-500">
                    Desmarcado (recomendado): vale só o maior desconto — o do produto/promoção ou o do valor do
                    pedido. Marcado: o desconto do pedido entra por cima do preço já com desconto.
                  </span>
                </span>
              </label>
            </Card>

            <Card
              title="Confiança, prazo e aparência"
              hint="Selos que passam segurança ao cliente, o prazo de produção (aparece na página inicial, no produto e no pedido) e o modo escuro automático."
            >
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">Selos de confiança (até 6) — ex.: Feito com amor · Encomendas pelo WhatsApp</p>
                {(settings.trust_badges ?? []).map((badge, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={input}
                      value={badge}
                      maxLength={60}
                      placeholder="Ex.: Encomendas pelo WhatsApp"
                      onChange={(e) =>
                        update({
                          trust_badges: (settings.trust_badges ?? []).map((b, j) => (j === i ? e.target.value : b)),
                        })
                      }
                    />
                    <button
                      onClick={() => update({ trust_badges: (settings.trust_badges ?? []).filter((_, j) => j !== i) })}
                      className="rounded border border-red-900 px-3 py-2 text-xs text-red-400 hover:bg-red-950"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {(settings.trust_badges ?? []).length < 6 && (
                  <button
                    onClick={() => update({ trust_badges: [...(settings.trust_badges ?? []), ""] })}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    + Adicionar selo
                  </button>
                )}
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">
                  Prazo de produção — ex.: “7 a 10 dias úteis”. A loja calcula a data: “pedidos feitos hoje ficam prontos até …”. Vazio = não mostra.
                </span>
                <input
                  className={input}
                  value={settings.production_days ?? ""}
                  maxLength={80}
                  placeholder="7 a 10 dias úteis"
                  onChange={(e) => update({ production_days: e.target.value })}
                />
              </label>
              <div className="space-y-1">
                <span className="text-xs text-neutral-500">
                  Parcelamento sem juros — aparece embaixo do preço (ex.: “ou 3x de R$ 33,27 sem juros”). Máximo 0 = não mostra.
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-neutral-500">Até quantas vezes</span>
                    <select
                      className={input}
                      value={settings.installments_max ?? 0}
                      onChange={(e) => update({ installments_max: Number(e.target.value) })}
                    >
                      <option value={0}>Não mostrar</option>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}x sem juros
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-neutral-500">Parcela mínima (R$)</span>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      step="1"
                      placeholder="Ex.: 30"
                      value={settings.installments_min ? settings.installments_min : ""}
                      onChange={(e) => update({ installments_min: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-neutral-800 p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!settings.auto_dark}
                  onChange={(e) => update({ auto_dark: e.target.checked })}
                />
                <span>
                  <span className="block text-sm">Modo escuro automático</span>
                  <span className="block text-xs text-neutral-500">
                    Quando o celular ou computador do cliente estiver no modo escuro, a loja abre na versão noturna (café escuro com letras creme).
                  </span>
                </span>
              </label>
            </Card>

            <Card
              title="Categorias"
              hint="Organize o catálogo e o menu da loja (ex.: Canecas, Pratos, Presentes). Para criar um submenu, escolha em “Categoria principal” dentro de qual categoria ela fica (ex.: Xícaras dentro de Dia a dia). Marque os produtos de cada categoria logo abaixo, em “Produtos na loja”. Um produto pode estar em mais de uma."
            >
              {settings.categories.length === 0 ? (
                <p className="text-sm text-neutral-500">Nenhuma categoria ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {settings.categories.map((c, i) => {
                    const catProducts = c.product_ids
                      .map((id) => productsById.get(id))
                      .filter((p): p is Product => !!p);
                    const photos = Array.from(new Set(catProducts.flatMap((p) => p.photo_urls)));
                    const autoCover = photos[0] ?? "";
                    const shownCover = c.cover_url || autoCover;
                    const pickerOpen = coverPickerFor === c.id;
                    const autoOwner = catProducts.find((p) => p.photo_urls.includes(autoCover));
                    const coverPos = c.cover_url
                      ? { x: c.cover_x ?? 50, y: c.cover_y ?? 50 }
                      : focusFor(autoOwner?.photo_focus, autoCover);
                    return (
                      <li key={c.id} className="space-y-2 rounded-lg border border-neutral-800 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-900">
                            {shownCover && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imgSrc(shownCover, IMG_WIDTH.thumb)}
                                alt=""
                                className="h-full w-full object-cover"
                                style={{ objectPosition: `${coverPos.x}% ${coverPos.y}%` }}
                              />
                            )}
                          </div>
                          <input
                            className={`${input} min-w-0 flex-1 basis-48`}
                            placeholder="Nome da categoria"
                            value={c.name}
                            maxLength={60}
                            onChange={(e) => renameCategory(c.id, e.target.value)}
                          />
                          <select
                            aria-label="Categoria principal"
                            className={`${input} w-auto min-w-0 basis-44`}
                            value={c.parent_id ?? ""}
                            // Quem já tem subcategorias não pode virar subcategoria (menu em 2 níveis).
                            disabled={settings.categories.some((o) => o.parent_id === c.id)}
                            onChange={(e) => setCategoryParent(c.id, e.target.value)}
                          >
                            <option value="">Categoria principal</option>
                            {settings.categories
                              .filter((o) => o.id !== c.id && !o.parent_id && o.name.trim())
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  Dentro de: {o.name}
                                </option>
                              ))}
                          </select>
                          <span className="w-20 text-xs text-neutral-500">
                            {catProducts.length} produto(s)
                          </span>
                          <button onClick={() => moveCategory(i, -1)} disabled={i === 0} aria-label="Subir" className="rounded border border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-30">
                            ↑
                          </button>
                          <button onClick={() => moveCategory(i, 1)} disabled={i === settings.categories.length - 1} aria-label="Descer" className="rounded border border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-30">
                            ↓
                          </button>
                          <button onClick={() => removeCategory(c.id)} className="rounded border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950">
                            Apagar
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-neutral-500">
                            Foto principal: {c.cover_url ? "escolhida por você" : "automática"}
                          </span>
                          <button
                            onClick={() => setCoverPickerFor(pickerOpen ? null : c.id)}
                            aria-expanded={pickerOpen}
                            className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:border-neutral-500"
                          >
                            {pickerOpen ? "Fechar" : "Escolher foto"}
                          </button>
                          <button
                            onClick={() => openCategoryFrame(c.id, shownCover, coverPos)}
                            disabled={!shownCover}
                            className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:border-neutral-500 disabled:opacity-30"
                          >
                            Enquadrar
                          </button>
                          {c.cover_url && (
                            <button
                              onClick={() => setCategoryCover(c.id, "")}
                              className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-400 hover:border-neutral-500"
                            >
                              Voltar para automática
                            </button>
                          )}
                        </div>
                        {pickerOpen && (
                          <div className="space-y-2 rounded-lg bg-neutral-900/60 p-3">
                            {photos.length === 0 ? (
                              <p className="text-xs text-neutral-500">
                                Esta categoria ainda não tem produtos com foto. Marque produtos nela em “Produtos na loja” ou envie uma foto.
                              </p>
                            ) : (
                              <>
                                <p className="text-xs text-neutral-500">Toque na foto que será a principal desta categoria:</p>
                                <div className="flex flex-wrap gap-2">
                                  {photos.map((url) => {
                                    const selected = shownCover === url && !!c.cover_url;
                                    return (
                                      <button
                                        key={url}
                                        onClick={() => setCategoryCover(c.id, url)}
                                        aria-pressed={selected}
                                        className={`h-16 w-16 overflow-hidden rounded border-2 ${
                                          selected ? "border-blue-500" : "border-transparent hover:border-neutral-600"
                                        }`}
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={imgSrc(url, IMG_WIDTH.thumb)} alt="" loading="lazy" className="h-full w-full object-cover" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                            <label className="inline-block cursor-pointer rounded border border-dashed border-neutral-600 px-3 py-1.5 text-xs text-neutral-300 hover:border-blue-500">
                              {isUploading ? "Enviando…" : "+ Enviar outra foto"}
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isUploading}
                                onChange={(e) => handleCategoryCoverUpload(c.id, e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {settings.categories.length < 30 && (
                <button onClick={addCategory} className="text-sm text-blue-400 hover:underline">
                  + Nova categoria
                </button>
              )}
              {settings.categories.some((c) => !c.name.trim()) && (
                <p className="text-xs text-yellow-400">Categorias sem nome são descartadas ao salvar.</p>
              )}
            </Card>

            <Card
              title="Ordem dos destaques"
              hint="Os destaques aparecem na página inicial da loja nesta ordem (o primeiro fica à esquerda). Para incluir ou tirar um produto, use o botão ★ Destaque em “Produtos na loja”."
            >
              {featuredList.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Nenhum destaque marcado. Sem destaques, a loja mostra os primeiros produtos.
                </p>
              ) : (
                <ol className="divide-y divide-neutral-800">
                  {featuredList.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <span className="w-6 text-right text-xs text-neutral-500">{i + 1}</span>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-900">
                        {p.photo_urls[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgSrc(p.photo_urls[0], IMG_WIDTH.thumb)}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                            style={focusStyle(p.photo_focus, p.photo_urls[0])}
                          />
                        )}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm">{p.name}</p>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => openProductFrame(p)}
                          disabled={!p.photo_urls[0]}
                          className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-30"
                        >
                          Enquadrar
                        </button>
                        <button onClick={() => moveFeatured(p.id, "top")} disabled={i === 0} aria-label="Mover para o início" title="Mover para o início" className="rounded border border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-30">
                          ⤒
                        </button>
                        <button onClick={() => moveFeatured(p.id, "up")} disabled={i === 0} aria-label="Subir" className="rounded border border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-30">
                          ↑
                        </button>
                        <button onClick={() => moveFeatured(p.id, "down")} disabled={i === featuredList.length - 1} aria-label="Descer" className="rounded border border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-30">
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Produtos na loja" hint="Escolha o que aparece, o que fica em destaque e a ordem dos produtos na loja (↑ ↓ ⤒). O preço mostrado ao cliente é o preço de venda; custos nunca são exibidos.">
              {products.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <SearchInput value={productSearch} onChange={setProductSearch} className="sm:flex-1" />
                    <div className="flex gap-1.5">
                      {(
                        [
                          ["all", "Todos"],
                          ["visible", "Na loja"],
                          ["hidden", "Ocultos"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setVisibilityFilter(key)}
                          aria-pressed={visibilityFilter === key}
                          className={`rounded-full border px-3 py-1.5 text-xs ${
                            visibilityFilter === key
                              ? "border-blue-500 bg-blue-950 text-blue-200"
                              : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-neutral-500">
                      {listedProducts.length} de {products.length} produto(s) ·{" "}
                      {products.length - settings.hidden_product_ids.filter((id) => products.some((p) => p.id === id)).length} na loja
                    </span>
                    {listedProducts.length > 0 && (
                      <>
                        <button
                          onClick={() => setVisibilityForListed(true)}
                          className="rounded-full border border-green-800 px-3 py-1 text-green-300 hover:bg-green-950"
                        >
                          Mostrar {listedProducts.length === products.length ? "todos" : "estes"} na loja
                        </button>
                        <button
                          onClick={() => setVisibilityForListed(false)}
                          className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:border-neutral-500"
                        >
                          Ocultar {listedProducts.length === products.length ? "todos" : "estes"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {products.length === 0 ? (
                <p className="text-sm text-neutral-500">Nenhum produto cadastrado.</p>
              ) : listedProducts.length === 0 ? (
                <p className="text-sm text-neutral-500">Nenhum produto encontrado.</p>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {listedProducts.map((p, idx) => {
                    const hidden = settings.hidden_product_ids.includes(p.id);
                    const featured = settings.featured_product_ids.includes(p.id);
                    const onRequest = settings.price_on_request_product_ids.includes(p.id);
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-900">
                          {p.photo_urls[0] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgSrc(p.photo_urls[0], IMG_WIDTH.thumb)}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                              style={focusStyle(p.photo_focus, p.photo_urls[0])}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 basis-40">
                          <p className={`truncate text-sm font-medium ${hidden ? "text-neutral-500 line-through" : ""}`}>{p.name}</p>
                          <p className="text-xs text-neutral-500">
                            {onRequest
                              ? "Preço a consultar na loja"
                              : p.manual_price != null
                                ? formatCurrency(p.manual_price)
                                : "Preço calculado pela receita"}
                            {p.stock_quantity === 0 ? " · Esgotado" : ""}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => moveProduct(p.id, "top")} disabled={idx === 0} aria-label="Mover para o início" title="Mover para o início" className="rounded border border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-30">
                            ⤒
                          </button>
                          <button onClick={() => moveProduct(p.id, "up")} disabled={idx === 0} aria-label="Subir" className="rounded border border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-30">
                            ↑
                          </button>
                          <button onClick={() => moveProduct(p.id, "down")} disabled={idx === listedProducts.length - 1} aria-label="Descer" className="rounded border border-neutral-700 px-2.5 py-1 text-xs disabled:opacity-30">
                            ↓
                          </button>
                        </div>
                        <div className="flex w-full gap-2 sm:w-auto">
                        <button
                          onClick={() => toggleId("featured_product_ids", p.id)}
                          disabled={hidden}
                          title="Destaque"
                          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-30 ${
                            featured ? "border-yellow-600 bg-yellow-950 text-yellow-300" : "border-neutral-700 text-neutral-400"
                          }`}
                        >
                          ★ Destaque
                        </button>
                        <button
                          onClick={() => openProductFrame(p)}
                          disabled={!p.photo_urls[0]}
                          title="Enquadrar a foto"
                          className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400 disabled:opacity-30"
                        >
                          Enquadrar
                        </button>
                        <button
                          onClick={() => toggleId("price_on_request_product_ids", p.id)}
                          disabled={hidden}
                          aria-pressed={onRequest}
                          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-30 ${
                            onRequest ? "border-purple-600 bg-purple-950 text-purple-200" : "border-neutral-700 text-neutral-400"
                          }`}
                        >
                          Preço a consultar
                        </button>
                        <button
                          onClick={() => toggleId("hidden_product_ids", p.id)}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            hidden ? "border-neutral-700 text-neutral-400" : "border-green-800 bg-green-950 text-green-300"
                          }`}
                        >
                          {hidden ? "Oculto" : "Visível"}
                        </button>
                        </div>
                        {settings.categories.some((c) => c.name.trim()) && (
                          <div className="flex w-full flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-neutral-500">Categorias:</span>
                            {settings.categories
                              .filter((c) => c.name.trim())
                              .map((c) => {
                                const inCategory = c.product_ids.includes(p.id);
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => toggleCategory(c.id, p.id)}
                                    aria-pressed={inCategory}
                                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                                      inCategory
                                        ? "border-blue-600 bg-blue-950 text-blue-200"
                                        : "border-neutral-800 text-neutral-500 hover:border-neutral-600"
                                    }`}
                                  >
                                    {inCategory ? "✓ " : ""}
                                    {c.name}
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      {!isLoading && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur lg:left-60">
          {conflict && (
            <div className="mx-auto mb-3 max-w-4xl space-y-2 rounded-lg border border-amber-700 bg-amber-950/60 p-3 text-sm text-amber-100">
              <p>
                <b>Atenção:</b> a loja foi alterada em outra aba ou aparelho depois que você abriu esta página. Se salvar daqui,
                aquelas mudanças serão apagadas.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setConflict(false);
                    discardDraft();
                  }}
                  className="rounded-lg bg-amber-500 px-4 py-1.5 font-semibold text-black hover:bg-amber-400"
                >
                  Carregar a versão mais nova (recomendado)
                </button>
                <button onClick={() => handleSave(true)} className="rounded-lg border border-amber-700 px-4 py-1.5 hover:bg-amber-900/50">
                  Salvar mesmo assim
                </button>
              </div>
            </div>
          )}
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <p className="text-xs text-neutral-500">
                {restoredDraft
                  ? "Recuperamos suas alterações não salvas"
                  : dirty
                    ? "Alterações não salvas (guardadas neste aparelho)"
                    : "Tudo salvo"}
              </p>
              {dirty && (
                <button onClick={discardDraft} className="shrink-0 text-xs text-neutral-400 underline hover:text-neutral-200">
                  Descartar
                </button>
              )}
            </div>
            <button
              onClick={() => handleSave()}
              disabled={isSaving || !dirty}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
            >
              {isSaving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}
      {framing && (
        <PhotoFramer
          key={`${framing.kind}:${framing.id}:${framing.url}`}
          url={framing.url}
          initial={framing.initial}
          saving={isSavingFrame}
          onCancel={() => setFraming(null)}
          onSave={handleSaveFrame}
          {...(framing.kind === "slide"
            ? {
                aspect: 16 / 9,
                title: "Enquadrar foto da capa",
                hint: "Arraste a foto dentro do quadro para escolher a parte que aparece na capa da loja. A foto passa a preencher a capa (as bordas podem ser cortadas).",
                previews: [
                  { label: "Computador", aspect: 16 / 9, width: 176 },
                  { label: "Celular", aspect: 4 / 3, width: 128 },
                ],
              }
            : framing.kind === "category"
              ? {
                  aspect: 5 / 4,
                  title: "Enquadrar capa da categoria",
                  hint: "Arraste a foto dentro do quadro para escolher a parte que aparece na capa da categoria, na loja.",
                  previews: [{ label: "Capa na loja", aspect: 5 / 4, width: 128 }],
                }
              : {
                  title: "Enquadrar foto do produto",
                  hint: "Arraste a foto dentro do quadrado para escolher a parte que aparece no destaque, no catálogo e na loja.",
                })}
        />
      )}
    </AppShell>
  );
}


// ---- Festivais e locais -----------------------------------------------------
const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function isoDate(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function FestivalEditor({
  festivals,
  locations,
  onChange,
}: {
  festivals: StoreFestival[];
  locations: StoreLocation[];
  onChange: (patch: Partial<StoreSettings>) => void;
}) {
  const today = isoDate(new Date());
  const sorted = [...festivals].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const past = sorted.filter((f) => f.date < today).length;
  const [repeat, setRepeat] = useState({ place: locations[0]?.name ?? "", weekday: 3, time: "13h", weeks: 4 });

  const setFestivals = (list: StoreFestival[]) => onChange({ festivals: list });
  const setLocations = (list: StoreLocation[]) => onChange({ locations: list });
  const editFestival = (f: StoreFestival, patch: Partial<StoreFestival>) =>
    setFestivals(festivals.map((x) => (x === f ? { ...x, ...patch } : x)));

  function addWeekly() {
    if (!repeat.place.trim()) return;
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    const diff = (repeat.weekday - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + diff);
    const added: StoreFestival[] = [];
    for (let i = 0; i < Math.max(1, Math.min(26, repeat.weeks)); i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      const date = isoDate(d);
      if (!festivals.some((f) => f.date === date && f.place === repeat.place.trim())) {
        added.push({ date, place: repeat.place.trim(), time: repeat.time.trim() });
      }
    }
    setFestivals([...festivals, ...added]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">Locais</p>
        <p className="text-xs text-neutral-500">
          Onde a loja costuma estar (ex.: Festival Bay Market – Niterói). Cole o link do Google Maps para o botão
          “Como chegar”.
        </p>
        {locations.map((l, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-neutral-800 p-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Nome do local (ex.: Festival Bay Market - NIT)"
              value={l.name}
              maxLength={120}
              onChange={(e) => setLocations(locations.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className={input}
              placeholder="Link do Google Maps"
              value={l.maps_url ?? ""}
              maxLength={600}
              onChange={(e) => setLocations(locations.map((x, j) => (j === i ? { ...x, maps_url: e.target.value } : x)))}
            />
            <input
              className={input}
              placeholder="Endereço (opcional)"
              value={l.address ?? ""}
              maxLength={240}
              onChange={(e) => setLocations(locations.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))}
            />
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="Dias e horário (ex.: quartas, a partir das 13h)"
                value={l.schedule ?? ""}
                maxLength={160}
                onChange={(e) => setLocations(locations.map((x, j) => (j === i ? { ...x, schedule: e.target.value } : x)))}
              />
              <button
                onClick={() => setLocations(locations.filter((_, j) => j !== i))}
                className="shrink-0 rounded border border-red-900 px-3 text-xs text-red-400 hover:bg-red-950"
              >
                Apagar
              </button>
            </div>
          </div>
        ))}
        {locations.length < 20 && (
          <button
            onClick={() => setLocations([...locations, { name: "", maps_url: "", address: "", schedule: "" }])}
            className="text-sm text-blue-400 hover:underline"
          >
            + Adicionar local
          </button>
        )}
      </div>

      <div className="space-y-3 border-t border-neutral-800 pt-5">
        <p className="text-sm font-medium">Calendário dos festivais</p>
        <div className="grid gap-2 rounded-lg border border-neutral-800 p-3 sm:grid-cols-[1.4fr_1fr_0.8fr_0.7fr_auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-[11px] text-neutral-500">Repetir toda semana em</span>
            <input
              className={input}
              list="festival-places"
              placeholder="Local"
              value={repeat.place}
              onChange={(e) => setRepeat({ ...repeat, place: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-neutral-500">Dia da semana</span>
            <select
              className={input}
              value={repeat.weekday}
              onChange={(e) => setRepeat({ ...repeat, weekday: Number(e.target.value) })}
            >
              {WEEKDAY_LABELS.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-neutral-500">Horário</span>
            <input className={input} value={repeat.time} maxLength={40} onChange={(e) => setRepeat({ ...repeat, time: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-neutral-500">Semanas</span>
            <input
              className={input}
              type="number"
              min={1}
              max={26}
              value={repeat.weeks}
              onChange={(e) => setRepeat({ ...repeat, weeks: Number(e.target.value) || 1 })}
            />
          </label>
          <button
            onClick={addWeekly}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Gerar datas
          </button>
        </div>
        <datalist id="festival-places">
          {locations.filter((l) => l.name.trim()).map((l) => (
            <option key={l.name} value={l.name} />
          ))}
        </datalist>

        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma data ainda.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((f, i) => (
              <li
                key={`${f.date}-${f.place}-${i}`}
                className={`grid gap-2 rounded-lg border border-neutral-800 p-2 sm:grid-cols-[150px_1.4fr_0.7fr_1fr_auto] ${f.date < today ? "opacity-50" : ""}`}
              >
                <input className={input} type="date" value={f.date} onChange={(e) => editFestival(f, { date: e.target.value })} />
                <input
                  className={input}
                  list="festival-places"
                  placeholder="Local"
                  value={f.place}
                  maxLength={120}
                  onChange={(e) => editFestival(f, { place: e.target.value })}
                />
                <input className={input} placeholder="Horário" value={f.time ?? ""} maxLength={40} onChange={(e) => editFestival(f, { time: e.target.value })} />
                <input
                  className={input}
                  placeholder="Aviso (ex.: Exclusivo Nova Cidade)"
                  value={f.note ?? ""}
                  maxLength={160}
                  onChange={(e) => editFestival(f, { note: e.target.value })}
                />
                <button
                  onClick={() => setFestivals(festivals.filter((x) => x !== f))}
                  className="rounded border border-red-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950"
                >
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setFestivals([...festivals, { date: today, place: locations[0]?.name ?? "", time: "" }])}
            className="text-sm text-blue-400 hover:underline"
          >
            + Adicionar data
          </button>
          {past > 0 && (
            <button
              onClick={() => setFestivals(festivals.filter((f) => f.date >= today))}
              className="text-sm text-neutral-400 hover:underline"
            >
              Apagar {past} data(s) que já passaram
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ---- Sabores -----------------------------------------------------------------
function FlavorsEditor({
  title,
  flavors,
  onChange,
  upload,
  busy,
}: {
  title: string;
  flavors: StoreFlavor[];
  onChange: (patch: Partial<StoreSettings>) => void;
  upload: (file: File) => Promise<string | null>;
  busy: boolean;
}) {
  const set = (list: StoreFlavor[]) => onChange({ flavors: list });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= flavors.length) return;
    const next = [...flavors];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-neutral-500">Título do quadro</span>
        <input className={input} value={title} maxLength={80} onChange={(e) => onChange({ flavors_title: e.target.value })} />
      </label>
      <ul className="grid gap-2 sm:grid-cols-2">
        {flavors.map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg border border-neutral-800 p-2">
            {f.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.photo_url.startsWith("/brand/sabores/") && !f.photo_url.includes("/mini/") ? f.photo_url.replace("/brand/sabores/", "/brand/sabores/mini/") : f.photo_url} onError={(e) => { if (!e.currentTarget.src.endsWith(f.photo_url ?? "")) e.currentTarget.src = f.photo_url ?? ""; }} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral-900 text-xl">🍰</span>
            )}
            <input
              className={input}
              value={f.name}
              maxLength={80}
              placeholder="Nome do sabor"
              onChange={(e) => set(flavors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <label className="shrink-0 cursor-pointer rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500">
              Foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const url = await upload(file);
                  if (url) set(flavors.map((x, j) => (j === i ? { ...x, photo_url: url } : x)));
                }}
              />
            </label>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-30">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === flavors.length - 1} className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-30">↓</button>
            <button onClick={() => set(flavors.filter((_, j) => j !== i))} className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950">
              ×
            </button>
          </li>
        ))}
      </ul>
      {flavors.length < 60 && (
        <button onClick={() => set([...flavors, { name: "", photo_url: "" }])} className="text-sm text-blue-400 hover:underline">
          + Adicionar sabor
        </button>
      )}
    </div>
  );
}

// ---- Galeria -----------------------------------------------------------------
function GalleryEditor({
  photos,
  onChange,
  upload,
  busy,
}: {
  photos: StoreGalleryPhoto[];
  onChange: (list: StoreGalleryPhoto[]) => void;
  upload: (file: File) => Promise<string | null>;
  busy: boolean;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500">
        {busy ? "Enviando…" : "+ Adicionar fotos"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={busy || photos.length >= 30}
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 30 - photos.length);
            e.target.value = "";
            const added: StoreGalleryPhoto[] = [];
            for (const file of files) {
              const url = await upload(file);
              if (url) added.push({ url, caption: "" });
            }
            if (added.length) onChange([...photos, ...added]);
          }}
        />
      </label>
      <ul className="grid gap-2 sm:grid-cols-2">
        {photos.map((p, i) => (
          <li key={`${p.url}-${i}`} className="flex items-center gap-2 rounded-lg border border-neutral-800 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-16 w-14 shrink-0 rounded object-cover" />
            <input
              className={input}
              value={p.caption ?? ""}
              maxLength={120}
              placeholder="Legenda (opcional)"
              onChange={(e) => onChange(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
            />
            <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-30">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-30">↓</button>
            <button onClick={() => onChange(photos.filter((_, j) => j !== i))} className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950">
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


// ---- Tabela de bolos ----------------------------------------------------------
function CakeTablesEditor({
  tables,
  note,
  onChange,
  upload,
  busy,
}: {
  tables: StoreCakeTable[];
  note: string;
  onChange: (patch: Partial<StoreSettings>) => void;
  upload: (file: File) => Promise<string | null>;
  busy: boolean;
}) {
  const set = (list: StoreCakeTable[]) => onChange({ cake_tables: list });
  const editTable = (i: number, patch: Partial<StoreCakeTable>) => set(tables.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-4">
      {tables.map((t, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-neutral-800 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {t.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.photo_url} alt="" className="h-14 w-14 rounded object-cover" />
            ) : null}
            <input className={`${input} max-w-xs`} value={t.title} maxLength={80} placeholder="Formato (ex: Redondos)" onChange={(e) => editTable(i, { title: e.target.value })} />
            <label className="cursor-pointer rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500">
              {t.photo_url ? "Trocar foto" : "Foto"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const url = await upload(file);
                  if (url) editTable(i, { photo_url: url });
                }}
              />
            </label>
            <button onClick={() => set(tables.filter((_, j) => j !== i))} className="ml-auto rounded border border-red-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950">
              Apagar formato
            </button>
          </div>
          {t.sizes.map((size, k) => (
            <div key={k} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2">
              <input className={input} value={size.label} maxLength={80} placeholder="Tamanho P – 15 cm" onChange={(e) => editTable(i, { sizes: t.sizes.map((x, q) => (q === k ? { ...x, label: e.target.value } : x)) })} />
              <input className={input} value={size.detail ?? ""} maxLength={80} placeholder="até 12 fatias" onChange={(e) => editTable(i, { sizes: t.sizes.map((x, q) => (q === k ? { ...x, detail: e.target.value } : x)) })} />
              <input className={input} type="number" step="0.01" min={0} value={size.price || ""} placeholder="R$" onChange={(e) => editTable(i, { sizes: t.sizes.map((x, q) => (q === k ? { ...x, price: Number(e.target.value) || 0 } : x)) })} />
              <button onClick={() => editTable(i, { sizes: t.sizes.filter((_, q) => q !== k) })} className="rounded border border-red-900 px-2 text-xs text-red-400 hover:bg-red-950">×</button>
            </div>
          ))}
          <button onClick={() => editTable(i, { sizes: [...t.sizes, { label: "", detail: "", price: 0 }] })} className="text-sm text-blue-400 hover:underline">
            + Adicionar tamanho
          </button>
        </div>
      ))}
      {tables.length < 6 && (
        <button onClick={() => set([...tables, { title: "", photo_url: "", sizes: [{ label: "", detail: "", price: 0 }] }])} className="text-sm text-blue-400 hover:underline">
          + Adicionar formato
        </button>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-neutral-500">Observação embaixo da tabela</span>
        <input className={input} value={note} maxLength={300} onChange={(e) => onChange({ cake_table_note: e.target.value })} />
      </label>
    </div>
  );
}

// ---- Dúvidas frequentes -----------------------------------------------------
function FaqEditor({ faq, onChange }: { faq: StoreFaq[]; onChange: (list: StoreFaq[]) => void }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= faq.length) return;
    const next = [...faq];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {faq.map((f, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-neutral-800 p-3">
          <div className="flex gap-2">
            <input className={input} value={f.question} maxLength={200} placeholder="Pergunta" onChange={(e) => onChange(faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
            <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-neutral-700 px-2 text-xs disabled:opacity-30">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === faq.length - 1} className="rounded border border-neutral-700 px-2 text-xs disabled:opacity-30">↓</button>
            <button onClick={() => onChange(faq.filter((_, j) => j !== i))} className="rounded border border-red-900 px-2 text-xs text-red-400 hover:bg-red-950">×</button>
          </div>
          <textarea className={input} rows={2} value={f.answer} maxLength={600} placeholder="Resposta" onChange={(e) => onChange(faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
        </div>
      ))}
      {faq.length < 30 && (
        <button onClick={() => onChange([...faq, { question: "", answer: "" }])} className="text-sm text-blue-400 hover:underline">
          + Adicionar pergunta
        </button>
      )}
    </div>
  );
}
