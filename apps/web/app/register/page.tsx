"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";

// Cria a conta da dona da loja. A API só aceita a PRIMEIRA conta (banco
// vazio); depois disso o cadastro fica fechado e esta tela avisa.
export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register("Winner Cakes", fullName, email, password);
      router.replace("/loja-admin");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setClosed(true);
      else setError(err instanceof ApiError ? err.message : "Falha ao cadastrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (closed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Cadastro fechado</h1>
        <p className="text-sm text-neutral-400">
          A conta da loja já foi criada. Se você já tem acesso, entre pela tela de login.
        </p>
        <Link href="/login" className="rounded bg-blue-600 px-3 py-2 font-medium hover:bg-blue-500">
          Ir para o login
        </Link>
      </main>
    );
  }

  const field = "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2";
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/winner-mark.png" alt="Winner Cakes" className="h-20 w-20 rounded-2xl" />
          <p className="text-sm font-semibold tracking-wide text-neutral-300">Winner Cakes</p>
        </div>
        <h1 className="text-2xl font-semibold">Criar a conta da loja</h1>
        <p className="text-sm text-neutral-400">Só a primeira conta pode ser criada aqui. Depois o cadastro fecha.</p>
        {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}
        <label className="block space-y-1">
          <span className="block text-sm text-neutral-400">Seu nome</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="block text-sm text-neutral-400">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="block text-sm text-neutral-400">Senha (mínimo 8 caracteres)</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>
        <button type="submit" disabled={isSubmitting} className="w-full rounded bg-blue-600 px-3 py-2 font-medium disabled:opacity-50">
          {isSubmitting ? "Criando…" : "Criar conta"}
        </button>
        <p className="text-sm text-neutral-400">
          Já tem conta?{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
