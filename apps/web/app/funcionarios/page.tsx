"use client";

// Funcionários do caixa: a dona cria o login (e-mail + senha) de quem vai
// operar o PDV do festival. Essas contas só enxergam "Festival ao vivo"
// (Vender, Retirada e Resumo) — nada de clientes, financeiro, preços etc.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AppShell } from "@/components/AppShell";

interface Staff {
  user_id: string;
  email: string;
  full_name: string | null;
  active: boolean;
  created_at: string | null;
}

export default function FuncionariosPage() {
  const { status, accessToken, currentOrganizationId, organizations } = useAuth();
  const router = useRouter();
  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;
  const role = organizations.find((m) => m.organization.id === currentOrganizationId)?.role;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId || !isAdmin) return;
    try {
      setStaff(await apiFetch<Staff[]>(`${orgPath}/staff`, { accessToken }));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar funcionários.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, currentOrganizationId, orgPath, isAdmin]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [status, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`${orgPath}/staff`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({ full_name: name.trim(), email: email.trim(), password }),
      });
      setNotice(`Acesso criado para ${name.trim()}. Passe o e-mail e a senha para a pessoa entrar pelo site (Entrar).`);
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(s: Staff) {
    if (!accessToken) return;
    const pw = window.prompt(`Nova senha para ${s.full_name ?? s.email} (mínimo 8 caracteres):`);
    if (!pw) return;
    if (pw.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    try {
      await apiFetch(`${orgPath}/staff/${s.user_id}/password`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({ password: pw }),
      });
      setNotice(`Senha de ${s.full_name ?? s.email} trocada.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao trocar a senha.");
    }
  }

  async function remove(s: Staff) {
    if (!accessToken) return;
    if (!window.confirm(`Tirar o acesso de ${s.full_name ?? s.email}? A pessoa não consegue mais entrar.`)) return;
    try {
      await apiFetch(`${orgPath}/staff/${s.user_id}`, { method: "DELETE", accessToken });
      setNotice(`Acesso de ${s.full_name ?? s.email} removido.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao remover.");
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
    <AppShell title="Funcionários">
      <div className="mx-auto max-w-3xl space-y-6">
        {!isAdmin ? (
          <p className="rounded-lg bg-neutral-900 p-4 text-sm text-neutral-300">Só a dona da conta gerencia os funcionários.</p>
        ) : (
          <>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-300">
              <p className="font-semibold text-white">Acesso de caixa</p>
              <p className="mt-1 text-neutral-400">
                Quem entra com esse login vê só o <strong>Festival ao vivo</strong>: vender no caixa, conferir os tickets do celular
                (e devolver Pix) e o resumo do dia. Não vê clientes, pedidos, financeiro, preços nem configurações.
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300" onClick={() => setError(null)}>
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg bg-emerald-950 p-3 text-sm text-emerald-300" onClick={() => setNotice(null)}>
                {notice}
              </p>
            )}

            <form onSubmit={create} className="grid gap-3 rounded-xl border border-neutral-800 p-4 sm:grid-cols-2">
              <p className="font-semibold sm:col-span-2">Novo funcionário</p>
              <input
                required
                minLength={2}
                placeholder="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5"
              />
              <input
                required
                type="email"
                placeholder="E-mail (será o login)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5"
              />
              <input
                required
                minLength={8}
                type="text"
                autoComplete="new-password"
                placeholder="Senha (mínimo 8 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 sm:col-span-2"
              />
              <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium disabled:opacity-50 sm:col-span-2">
                {saving ? "Criando…" : "Criar acesso de caixa"}
              </button>
            </form>

            <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
              {loading ? (
                <p className="p-4 text-sm text-neutral-500">Carregando…</p>
              ) : staff.length === 0 ? (
                <p className="p-4 text-sm text-neutral-500">Nenhum funcionário cadastrado ainda.</p>
              ) : (
                staff.map((s) => (
                  <div key={s.user_id} className="flex flex-wrap items-center gap-3 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 font-semibold">
                      {(s.full_name ?? s.email).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.full_name ?? "—"}</span>
                      <span className="block truncate text-sm text-neutral-400">{s.email}</span>
                    </span>
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Caixa</span>
                    <button onClick={() => resetPassword(s)} className="text-sm text-blue-400 hover:underline">
                      Trocar senha
                    </button>
                    <button onClick={() => remove(s)} className="text-sm text-red-400 hover:underline">
                      Remover
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
