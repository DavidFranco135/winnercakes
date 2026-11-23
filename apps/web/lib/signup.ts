// Cadastro do cliente feito pelo próprio site: pelo link de cadastro
// (/cadastro) ou automaticamente ao enviar um pedido pelo WhatsApp.
// O cliente entra em Clientes, no gestor.
import { apiFetch } from "@/lib/api-client";
import { STORE_SLUG } from "@/lib/store";

export type SignupData = {
  name: string;
  phone: string;
  birth_date?: string;
  neighborhood?: string;
  email?: string;
  source: "cadastro" | "pedido";
  website?: string; // campo escondido contra robôs
};

export const SIGNUP_PATH = "/cadastro";

export function phoneDigits(v: string): string {
  return v.replace(/\D/g, "");
}

export function validPhone(v: string): boolean {
  const d = phoneDigits(v);
  return d.length >= 10 && d.length <= 13;
}

// (21) 99876-5432 enquanto digita.
export function maskPhone(v: string): string {
  const d = phoneDigits(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export async function signupCustomer(data: SignupData, slug = STORE_SLUG): Promise<void> {
  const body: Record<string, string> = { name: data.name.trim(), phone: data.phone.trim(), source: data.source };
  if (data.birth_date) body.birth_date = data.birth_date;
  if (data.neighborhood?.trim()) body.neighborhood = data.neighborhood.trim();
  if (data.email?.trim()) body.email = data.email.trim();
  if (data.website) body.website = data.website;
  await apiFetch<void>(`/api/v1/public/stores/${encodeURIComponent(slug)}/customers`, {
    method: "POST",
    body: JSON.stringify(body),
    keepalive: true,
  });
}

// Pedido enviado: cadastra em segundo plano, uma vez por telefone neste aparelho.
export function signupFromOrder(name: string, phone: string, birth?: string, slug = STORE_SLUG): void {
  if (name.trim().length < 2 || !validPhone(phone)) return;
  const key = `loja-cadastrado:${slug}`;
  const sig = `${phoneDigits(phone)}|${birth ?? ""}`;
  try {
    if (localStorage.getItem(key) === sig) return;
  } catch {}
  signupCustomer({ name, phone, birth_date: birth || undefined, source: "pedido" }, slug)
    .then(() => {
      try {
        localStorage.setItem(key, sig);
      } catch {}
    })
    .catch(() => {});
}
