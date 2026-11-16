"use client";

// Menu da loja pública.
// - Computador: barra de categorias que desliza na horizontal; ao passar o
//   mouse numa categoria com subcategorias, abre um painel logo abaixo.
// - Celular: menu lateral deslizante, com as subcategorias em sanfona.
// Categorias e subcategorias vêm de Minha Loja (nada é fixo aqui).
import { useCallback, useEffect, useRef, useState } from "react";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { IconArrowRight, IconChevronRight, IconClose, IconInstagram, IconWhatsapp } from "./ui";

export type NavCategory = {
  id: string;
  name: string;
  count: number;
  coverUrl: string;
  coverStyle?: React.CSSProperties;
  children: NavCategory[];
};

type NavProps = {
  categories: NavCategory[];
  // Aba atual (0 Início · 1 Catálogo · 2 Como pedir · 3 Contato) e categoria aberta.
  tab: number;
  activeCategoryId: string | null;
  // Categoria principal da categoria aberta (para marcar o item do menu).
  activeTopId: string | null;
  onTab: (index: number) => void;
  onCategory: (id: string | null) => void;
};

const linkBase =
  "relative shrink-0 whitespace-nowrap px-1 py-3 text-sm font-medium transition-colors duration-300 after:absolute after:inset-x-1 after:bottom-1.5 after:h-0.5 after:origin-left after:rounded-full after:bg-[var(--accent)] after:transition-transform after:duration-500 after:ease-[cubic-bezier(0.22,1,0.36,1)]";

function linkClass(active: boolean) {
  return `${linkBase} ${
    active
      ? "text-[var(--accent-text)] after:scale-x-100"
      : "text-[var(--muted)] after:scale-x-0 hover:text-[var(--ink)] hover:after:scale-x-100"
  }`;
}

export function DesktopNav({ categories, tab, activeTopId, activeCategoryId, onTab, onCategory }: NavProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = categories.find((c) => c.id === openId && c.children.length > 0) ?? null;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  // Pequena espera ao sair: dá tempo de levar o mouse do item até o painel.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), 160);
  };
  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const go = (id: string | null) => {
    setOpenId(null);
    onCategory(id);
  };

  // Em telas de toque não existe "passar o mouse": o primeiro toque numa
  // categoria com subcategorias abre o painel, o segundo entra nela.
  const handleCategoryClick = (c: NavCategory) => {
    const canHover = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
    if (c.children.length > 0 && !canHover && openId !== c.id) {
      setOpenId(c.id);
      return;
    }
    go(c.id);
  };

  return (
    <div className="hidden border-t border-[var(--line)] lg:block" onMouseLeave={scheduleClose} onMouseEnter={cancelClose}>
      <nav
        aria-label="Categorias"
        className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-center gap-x-6 px-6 lg:px-10 xl:gap-x-8"
      >
        <button className={linkClass(tab === 0)} onMouseEnter={() => setOpenId(null)} onClick={() => { setOpenId(null); onTab(0); }}>
          Início
        </button>
        <button
          className={linkClass(tab === 1 && activeCategoryId === null)}
          onMouseEnter={() => setOpenId(null)}
          onClick={() => go(null)}
        >
          Todos os produtos
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={linkClass((tab === 1 && activeTopId === c.id) || openId === c.id)}
            aria-haspopup={c.children.length > 0 ? "true" : undefined}
            aria-expanded={c.children.length > 0 ? openId === c.id : undefined}
            onMouseEnter={() => {
              cancelClose();
              setOpenId(c.children.length > 0 ? c.id : null);
            }}
            onFocus={() => setOpenId(c.children.length > 0 ? c.id : null)}
            onClick={() => handleCategoryClick(c)}
          >
            {c.name}
          </button>
        ))}
        <button className={linkClass(tab === 2)} onMouseEnter={() => setOpenId(null)} onClick={() => { setOpenId(null); onTab(2); }}>
          Como pedir
        </button>
        <button className={linkClass(tab === 3)} onMouseEnter={() => setOpenId(null)} onClick={() => { setOpenId(null); onTab(3); }}>
          Contato
        </button>
      </nav>

      {/* Painel de subcategorias: ocupa a largura do site, logo abaixo do menu. */}
      <div
        className={`absolute inset-x-0 top-full origin-top border-b border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_60px_-30px_rgba(61,46,37,0.35)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
        }`}
        aria-hidden={!open}
      >
        {open && (
          <div key={open.id} className="mx-auto grid max-w-[1600px] animate-fade-in gap-10 px-6 py-8 lg:px-10 lg:grid-cols-[1fr_260px]">
            <div className="space-y-5">
              <button
                onClick={() => go(open.id)}
                className="group inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]"
              >
                {open.name}
                <IconArrowRight className="h-5 w-5 text-[var(--accent-text)] transition-transform group-hover:translate-x-1" />
              </button>
              <ul className="grid grid-cols-2 gap-x-8 gap-y-1 lg:grid-cols-3">
                {open.children.map((child, i) => (
                  <li key={child.id} className="animate-fade-up" style={{ animationDelay: `${40 + i * 35}ms` }}>
                    <button
                      onClick={() => go(child.id)}
                      className="group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                    >
                      <span className="truncate">{child.name}</span>
                      <span className="text-xs opacity-60">{child.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {open.coverUrl && (
              <button
                onClick={() => go(open.id)}
                className="group relative hidden aspect-[4/3] overflow-hidden rounded-2xl lg:block"
                aria-label={`Ver tudo em ${open.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc(open.coverUrl, IMG_WIDTH.card)}
                  alt=""
                  style={open.coverStyle}
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Abrir menu"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition active:scale-95 lg:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    </button>
  );
}

export function MobileMenu({
  logoSrc = "",
  open,
  onClose,
  storeName,
  whatsappHref,
  instagramHandle,
  categories,
  tab,
  activeCategoryId,
  activeTopId,
  onTab,
  onCategory,
}: NavProps & {
  logoSrc?: string;
  open: boolean;
  onClose: () => void;
  storeName: string;
  whatsappHref: string;
  instagramHandle: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Ao abrir, já mostra expandida a categoria em que o cliente está.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExpanded(activeTopId);
  }

  // Trava a rolagem da página por trás do menu (inclusive no Safari do iPhone).
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const pick = useCallback(
    (action: () => void) => {
      onClose();
      // Espera a página destravar a rolagem antes de trocar de tela.
      setTimeout(action, 0);
    },
    [onClose]
  );

  const row =
    "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left text-base font-medium transition active:bg-[var(--accent-soft)]";
  const rowTone = (active: boolean) => (active ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "text-[var(--ink)]");

  return (
    <div className={`fixed inset-0 z-[70] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-[var(--bg)] transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Logo no centro, maior; o X fica no canto. */}
        <div className="relative flex items-center justify-center gap-3 border-b border-[var(--line)] px-14 py-5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={storeName} className="h-20 w-auto max-w-[220px] object-contain" />
          ) : (
            <span className="truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">{storeName}</span>
          )}
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink)] active:scale-95"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Menu" className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4 [-webkit-overflow-scrolling:touch]">
          <button className={`${row} ${rowTone(tab === 0)}`} onClick={() => pick(() => onTab(0))}>
            Início
          </button>
          <button className={`${row} ${rowTone(tab === 1 && activeCategoryId === null)}`} onClick={() => pick(() => onCategory(null))}>
            Todos os produtos
          </button>

          {categories.length > 0 && (
            <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Categorias</p>
          )}
          {categories.map((c) => {
            const hasChildren = c.children.length > 0;
            const isOpen = expanded === c.id;
            const active = tab === 1 && activeTopId === c.id;
            return (
              <div key={c.id}>
                <button
                  className={`${row} ${rowTone(active)}`}
                  aria-expanded={hasChildren ? isOpen : undefined}
                  onClick={(e) => {
                    if (!hasChildren) return pick(() => onCategory(c.id));
                    setExpanded(isOpen ? null : c.id);
                    // Depois de abrir, rola o menu para as subcategorias aparecerem.
                    const group = e.currentTarget.parentElement;
                    if (!isOpen && group) setTimeout(() => group.scrollIntoView({ block: "nearest", behavior: "smooth" }), 320);
                  }}
                >
                  <span className="truncate">{c.name}</span>
                  {hasChildren ? (
                    <IconChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`} />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">{c.count}</span>
                  )}
                </button>
                {hasChildren && (
                  // Sanfona: a linha da grade vai de 0fr a 1fr, animando a altura.
                  <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="ml-4 space-y-0.5 border-l border-[var(--line)] py-1 pl-3">
                        <button
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--accent-text)] active:bg-[var(--accent-soft)]"
                          onClick={() => pick(() => onCategory(c.id))}
                        >
                          Ver tudo em {c.name}
                          <IconArrowRight className="h-4 w-4" />
                        </button>
                        {c.children.map((child) => (
                          <button
                            key={child.id}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm active:bg-[var(--accent-soft)] ${
                              tab === 1 && activeCategoryId === child.id ? "font-semibold text-[var(--accent-text)]" : "text-[var(--muted)]"
                            }`}
                            onClick={() => pick(() => onCategory(child.id))}
                          >
                            <span className="truncate">{child.name}</span>
                            <span className="text-xs opacity-60">{child.count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Atendimento</p>
          <button className={`${row} ${rowTone(tab === 2)}`} onClick={() => pick(() => onTab(2))}>
            Como pedir
          </button>
          <button className={`${row} ${rowTone(tab === 3)}`} onClick={() => pick(() => onTab(3))}>
            Contato
          </button>
        </nav>

        <div className="space-y-2 border-t border-[var(--line)] px-5 py-4">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#25d366] text-sm font-semibold text-white active:scale-[0.98]"
          >
            <IconWhatsapp className="h-5 w-5" />
            Falar no WhatsApp
          </a>
          {instagramHandle && (
            <a
              href={`https://instagram.com/${instagramHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--line)] text-sm font-medium text-[var(--ink)]"
            >
              <IconInstagram className="h-4 w-4" />@{instagramHandle}
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
