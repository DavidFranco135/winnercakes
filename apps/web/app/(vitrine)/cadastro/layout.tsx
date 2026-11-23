import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cadastro · Winner Cakes",
  description: "Faça seu cadastro na Winner Cakes e receba as novidades dos festivais e um carinho no seu aniversário.",
  openGraph: {
    title: "Faça seu cadastro · Winner Cakes",
    description: "Leva menos de 1 minuto. Receba as novidades dos festivais e um carinho no seu aniversário.",
    images: [{ url: "/brand/winner-og.jpg", width: 1200, height: 630 }],
  },
};

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
