"use client";

// Foto com zoom: pinça com dois dedos, arrastar quando ampliada, toque duplo
// (ou clique duplo) amplia/volta, roda do mouse no computador. Sem zoom, um
// deslize para o lado chama onSwipe (passar para a próxima foto).

import { useRef, useState } from "react";

type Pt = { x: number; y: number };
const MAX = 5;

export function ZoomImage({
  src,
  alt,
  className = "",
  onSwipe,
}: {
  src: string;
  alt: string;
  className?: string;
  onSwipe?: (dir: 1 | -1) => void;
}) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ dist: number; mid: Pt; start: typeof view } | null>(null);
  const pan = useRef<{ p: Pt; start: typeof view; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const clamp = (v: { s: number; x: number; y: number }) => {
    const s = Math.min(MAX, Math.max(1, v.s));
    if (s === 1) return { s: 1, x: 0, y: 0 };
    const r = box.current?.getBoundingClientRect();
    const lx = r ? (r.width * (s - 1)) / 2 : Infinity;
    const ly = r ? (r.height * (s - 1)) / 2 : Infinity;
    return { s, x: Math.max(-lx, Math.min(lx, v.x)), y: Math.max(-ly, Math.min(ly, v.y)) };
  };

  // Amplia mantendo o ponto (cx, cy) da tela parado embaixo do dedo/mouse.
  const zoomAt = (from: typeof view, s: number, cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect();
    const ox = cx - (r.left + r.width / 2);
    const oy = cy - (r.top + r.height / 2);
    const k = s / from.s;
    return clamp({ s, x: ox - (ox - from.x) * k, y: oy - (oy - from.y) * k });
  };

  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = { dist: dist(pts[0], pts[1]), mid: mid(pts[0], pts[1]), start: view };
      pan.current = null;
    } else if (pts.length === 1) {
      pan.current = { p: pts[0], start: view, moved: false };
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && gesture.current) {
      const g = gesture.current;
      const m = mid(pts[0], pts[1]);
      const s = g.start.s * (dist(pts[0], pts[1]) / g.dist);
      const z = zoomAt(g.start, Math.min(MAX, Math.max(1, s)), g.mid.x, g.mid.y);
      setView(clamp({ s: z.s, x: z.x + (m.x - g.mid.x), y: z.y + (m.y - g.mid.y) }));
    } else if (pan.current) {
      const p = pan.current;
      const dx = e.clientX - p.p.x;
      const dy = e.clientY - p.p.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) p.moved = true;
      if (p.start.s > 1) setView(clamp({ s: p.start.s, x: p.start.x + dx, y: p.start.y + dy }));
    }
  }

  function onUp(e: React.PointerEvent) {
    const p = pan.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 1) {
      const [rest] = [...pointers.current.values()];
      pan.current = { p: rest, start: view, moved: true };
      return;
    }
    pan.current = null;
    if (!p) return;
    const dx = e.clientX - p.p.x;
    // Deslize sem zoom: troca de foto.
    if (p.start.s === 1 && view.s === 1 && onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - p.p.y)) {
      onSwipe(dx < 0 ? 1 : -1);
      return;
    }
    // Toque duplo: amplia 2,5× no ponto tocado, ou volta ao normal.
    if (!p.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setAnimate(true);
        setView(view.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(view, 2.5, e.clientX, e.clientY));
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  }

  function onWheel(e: React.WheelEvent) {
    setAnimate(false);
    const s = view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
    setView(zoomAt(view, Math.min(MAX, Math.max(1, s)), e.clientX, e.clientY));
  }

  return (
    <div
      ref={box}
      className="relative touch-none select-none overflow-hidden rounded-2xl"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
      style={{ cursor: view.s > 1 ? "grab" : "zoom-in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={className}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
          transition: animate ? "transform 220ms ease" : "none",
          willChange: "transform",
        }}
      />
    </div>
  );
}
