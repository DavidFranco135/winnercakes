import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  metadataBase: new URL("https://winner-cakes.pages.dev"),
  title: "Winner Cakes",
  description: "Winner Cakes — confeitaria artesanal em São Gonçalo e Niterói. Toda semana tem Festival de Fatias.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Winner Cakes",
    description: "Cada peça moldada com propósito.",
    images: [{ url: "/brand/winner-og.jpg", width: 1200, height: 630 }],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png?v=2", sizes: "16x16", type: "image/png" },
      { url: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Winner Cakes",
  },
};

export const viewport: Viewport = {
  themeColor: "#4c2d18",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-neutral-950 text-neutral-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
