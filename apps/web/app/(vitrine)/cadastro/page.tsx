"use client";

// Link de cadastro: a dona pode mandar para clientes preencherem.
// Os dados vão direto para Clientes no gestor.

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { maskPhone, signupCustomer, validPhone } from "@/lib/signup";

const RED = "#d73333";
const CREAM = "#fff1dc";
const CHOC = "#3b1a10";

const field =
  "w-full rounded-2xl border border-[#f1d9c4] bg-white px-4 py-3 text-[15px] text-[#3b1a10] outline-none transition placeholder:text-[#a8857a] focus:border-[#d73333] focus:ring-2 focus:ring-[#d73333]/25";

export default function CadastroPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [bairro, setBairro] = useState("");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(true);
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Escreva o seu nome.");
    if (!validPhone(phone)) return setError("Confira o WhatsApp: DDD + número.");
    if (!agree) return setError("Marque a autorização para podermos falar com você.");
    setSending(true);
    try {
      await signupCustomer({ name, phone, birth_date: birth || undefined, neighborhood: bairro, email, source: "cadastro", website });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Muitas tentativas. Tente de novo daqui a pouco."
          : err instanceof ApiError && err.status === 422
            ? "Confira os dados (WhatsApp com DDD, e-mail e data de nascimento)."
            : "Não foi possível enviar agora. Confira a internet e tente de novo."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-dvh font-[family-name:var(--font-sans)]" style={{ background: CREAM, color: CHOC }}>
      <header className="flex flex-col items-center gap-4 px-6 pb-16 pt-10 text-center" style={{ background: RED }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/winner-logo-branco.png" alt="Winner Cakes" className="h-24 w-auto sm:h-28" />
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[#fff1dc] sm:text-4xl">
          {done ? "Cadastro feito!" : "Faça seu cadastro"}
        </h1>
        <p className="max-w-sm text-sm text-[#ffd9cf]">
          {done
            ? "Obrigada! Agora você recebe as novidades da Winner Cakes."
            : "Leva menos de 1 minuto. Receba as novidades dos festivais e um carinho no seu aniversário 🎂"}
        </p>
      </header>

      <div className="mx-auto -mt-10 max-w-md px-4 pb-14">
        <div className="rounded-[28px] bg-[#fffdf8] p-5 shadow-xl shadow-[#3b1a10]/10 sm:p-7">
          {done ? (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/selo-winner.png" alt="" className="h-32 w-32 drop-shadow-lg" />
              <p className="text-[15px]">
                Tudo certo, <strong>{name.trim().split(" ")[0]}</strong>! Seus dados chegaram para a gente.
              </p>
              <a
                href="/"
                className="rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
                style={{ background: RED }}
              >
                Ver o cardápio
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5" noValidate>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Nome *</span>
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Seu nome completo" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">WhatsApp *</span>
                <input
                  className={field}
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(21) 99999-9999"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Data de nascimento</span>
                <input
                  className={field}
                  type="date"
                  value={birth}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setBirth(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Bairro</span>
                <input className={field} value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} placeholder="Ex.: Mutondo, Nova Cidade, Icaraí" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">E-mail</span>
                <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="opcional" />
              </label>
              {/* Escondido: só robôs preenchem. */}
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
                name="website"
              />
              <label className="flex items-start gap-2.5 pt-1 text-[13px] leading-snug text-[#7a5146]">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d73333]" />
                Autorizo a Winner Cakes a guardar estes dados e a falar comigo pelo WhatsApp.
              </label>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button
                disabled={sending}
                className="w-full rounded-full py-3.5 text-[15px] font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                style={{ background: RED }}
              >
                {sending ? "Enviando…" : "Quero me cadastrar"}
              </button>
              <p className="text-center text-xs text-[#a8857a]">* obrigatórios</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
