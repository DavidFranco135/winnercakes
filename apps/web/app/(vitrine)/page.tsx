import { Storefront } from "@/components/store/Storefront";
import { STORE_SLUG } from "@/lib/store";

// Página inicial do site: a loja pública da Winner Cakes.
export default function HomePage() {
  return <Storefront slug={STORE_SLUG} />;
}
