import Link from "next/link";

// O cadastro de novas contas está fechado: a Winner Cakes tem uma única
// conta, já criada. A API também recusa cadastros (REGISTRATION_OPEN).
export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Cadastro fechado</h1>
      <p className="text-sm text-neutral-400">
        Este site não aceita novas contas. Se você já tem acesso, entre pela tela de login.
      </p>
      <Link href="/login" className="rounded bg-blue-600 px-3 py-2 font-medium hover:bg-blue-500">
        Ir para o login
      </Link>
    </main>
  );
}
