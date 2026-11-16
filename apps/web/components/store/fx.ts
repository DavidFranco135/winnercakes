"use client";

import { useEffect } from "react";

// Efeitos da loja pública (estilos em app/globals.css, seção "Loja pública:
// efeitos"). Tudo por delegação a partir da raiz, então os componentes só
// precisam das classes fx-btn / fx-spotlight / fx-shine / fx-header.
export function useStoreFx(root: React.RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !ready) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Fotos entram em foco ao carregar (inclusive as que já vieram do cache).
    const markLoaded = (img: HTMLImageElement) => img.classList.add("is-loaded");
    const settle = (node: ParentNode) =>
      node.querySelectorAll?.("main img").forEach((img) => {
        const i = img as HTMLImageElement;
        if (i.complete) markLoaded(i);
      });
    const onLoadOrError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) markLoaded(e.target);
    };
    el.addEventListener("load", onLoadOrError, true);
    el.addEventListener("error", onLoadOrError, true);
    const observer = new MutationObserver(() => settle(el));
    observer.observe(el, { childList: true, subtree: true });
    settle(el);
    el.classList.add("fx-ready");

    // Onda a partir do ponto do clique nos botões principais.
    const onPointerDown = (e: PointerEvent) => {
      if (reduceMotion) return;
      const btn = (e.target as Element | null)?.closest?.(".fx-btn") as HTMLElement | null;
      if (!btn || !el.contains(btn)) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const ripple = document.createElement("span");
      ripple.className = "fx-ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    };

    // Luz dos cards segue o ponteiro.
    let frame = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const card = (e.target as Element | null)?.closest?.(".fx-spotlight") as HTMLElement | null;
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--fx-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--fx-y", `${e.clientY - rect.top}px`);
      });
    };

    // Sombra no cabeçalho + barra de progresso da rolagem.
    const header = el.querySelector<HTMLElement>(".fx-header");
    const onScroll = () => {
      if (!header) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      header.style.setProperty("--fx-scroll", String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
      // Duas marcas (entra aos 80 px, sai aos 20 px): o cabeçalho encolhe ao
      // rolar e isso muda a altura da página; com uma marca só ele ficaria
      // piscando entre os dois tamanhos perto do limite.
      const y = window.scrollY;
      if (y > 80) header.classList.add("is-scrolled");
      else if (y < 20) header.classList.remove("is-scrolled");
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      el.removeEventListener("load", onLoadOrError, true);
      el.removeEventListener("error", onLoadOrError, true);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      el.classList.remove("fx-ready");
    };
  }, [root, ready]);
}

// "Peça voando para o carrinho": uma miniatura da foto do produto desliza até
// o botão Pedido do cabeçalho, que dá um pulinho ao receber. Sem foto, sem
// botão visível ou com "reduzir movimento", não faz nada.
export function flyToCart(source: Element | null): void {
  if (typeof window === "undefined" || !(source instanceof HTMLImageElement)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-target]")).find(
    (el) => el.getClientRects().length > 0
  );
  if (!target || typeof source.animate !== "function") return;

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;
  const size = Math.min(from.width, from.height, 160);
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const endX = to.left + to.width / 2 - size / 2;
  const endY = to.top + to.height / 2 - size / 2;

  const ghost = document.createElement("img");
  ghost.src = source.currentSrc || source.src;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: "cover",
    borderRadius: "9999px",
    boxShadow: "0 18px 40px -12px rgba(0,0,0,0.45)",
    zIndex: "80",
    pointerEvents: "none",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);

  const dx = endX - startX;
  const dy = endY - startY;
  // Sobe um pouco antes de descer até o botão: um arco, não uma linha reta.
  const lift = Math.min(140, Math.abs(dx) * 0.25 + 60);
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(0.55)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.4 },
    ],
    { duration: 750, easing: "cubic-bezier(0.45, 0, 0.2, 1)" }
  );
  flight.onfinish = () => {
    ghost.remove();
    target.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(0.96)" }, { transform: "scale(1)" }],
      { duration: 450, easing: "ease-out" }
    );
  };
  flight.oncancel = () => ghost.remove();
}
