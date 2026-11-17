"use client";

// Leitor de QR pela câmera (tablet/celular do balcão). Usa o leitor nativo do
// navegador quando existe (Chrome/Android) e o jsQR como reserva (iPhone).

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function QrScanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onCodeRef.current = onCode;
    pausedRef.current = paused;
  }, [onCode, paused]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let last = "";
    let lastAt = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    const detector = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;

    const found = (value: string) => {
      const now = Date.now();
      // Mesmo QR parado na frente da câmera: lê uma vez só a cada 4 s.
      if (value === last && now - lastAt < 4000) return;
      last = value;
      lastAt = now;
      if (!pausedRef.current) onCodeRef.current(value);
    };

    const scan = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !pausedRef.current) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
          } else if (ctx) {
            const w = Math.min(640, video.videoWidth);
            const h = Math.round((video.videoHeight / video.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) found(code.data);
          }
        } catch {
          /* quadro ruim: tenta no próximo */
        }
      }
      raf = window.setTimeout(scan, 180) as unknown as number;
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        scan();
      })
      .catch(() => setError("Não consegui abrir a câmera. Libere a câmera para este site ou digite o código."));

    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-48 w-48 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {error && <p className="absolute inset-x-0 bottom-0 bg-black/80 p-3 text-center text-sm text-white">{error}</p>}
    </div>
  );
}
