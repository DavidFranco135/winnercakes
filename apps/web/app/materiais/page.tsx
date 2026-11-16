"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { Material } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { INGREDIENT_KINDS, ingredientKind, pricePerBase, type IngredientKind } from "@/lib/ingredients";

export default function MateriaisPage() {
  const { status, accessToken, currentOrganizationId } = useAuth();
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<IngredientKind>("peso");
  // Pacote comprado: o sistema calcula o preço por kg / litro / unidade.
  const [packagePrice, setPackagePrice] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [color, setColor] = useState("");
  const [costPerKg, setCostPerKg] = useState("");
  const [supplier, setSupplier] = useState("");

  const orgPath = `/api/v1/organizations/${currentOrganizationId}`;

  const load = useCallback(async () => {
    if (!accessToken || !currentOrganizationId) return;
    setIsLoading(true);
    try {
      const data = await apiFetch<Material[]>(`${orgPath}/materials`, { accessToken });
      setMaterials(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar ingredientes.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentOrganizationId, orgPath]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    const timeoutId = setTimeout(load, 0);
    return () => clearTimeout(timeoutId);
  }, [status, router, load]);

  function resetForm() {
    setName("");
    setType("peso");
    setPackagePrice("");
    setPackageSize("");
    setColor("");
    setCostPerKg("");
    setSupplier("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(m: Material) {
    setEditingId(m.id);
    setName(m.name);
    setType(ingredientKind(m));
    setPackagePrice("");
    setPackageSize("");
    setColor(m.color ?? "");
    setCostPerKg(m.cost_per_kg != null ? String(m.cost_per_kg) : "");
    setSupplier(m.supplier ?? "");
    setShowForm(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setIsSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name,
        type,
        color: color || null,
        cost_per_kg: costPerKg ? Number(costPerKg) : null,
        supplier: supplier || null,
      });
      if (editingId) {
        await apiFetch(`${orgPath}/materials/${editingId}`, { method: "PATCH", accessToken, body });
      } else {
        await apiFetch(`${orgPath}/materials`, { method: "POST", accessToken, body });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar ingrediente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(m: Material) {
    if (!accessToken) return;
    if (!window.confirm(`Excluir o ingrediente "${m.name}"?`)) return;
    setError(null);
    try {
      await apiFetch(`${orgPath}/materials/${m.id}`, { method: "DELETE", accessToken });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir ingrediente.");
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
    <AppShell title="Ingredientes">
      <div className="mx-auto max-w-5xl space-y-6">
        {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}

        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">{materials.length} ingrediente(s) cadastrado(s)</p>
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {showForm ? "Cancelar" : "+ Novo ingrediente"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 sm:grid-cols-2"
          >
            <input required placeholder="Nome (ex: Leite condensado)" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <select value={type} onChange={(e) => setType(e.target.value as IngredientKind)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2">
              {INGREDIENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  Medido por {k.label}
                </option>
              ))}
            </select>
            <div className="space-y-2 rounded border border-neutral-800 p-3 sm:col-span-2">
              <p className="text-xs text-neutral-400">
                Preço do pacote que você compra — o sistema calcula o preço por {INGREDIENT_KINDS.find((k) => k.key === type)?.per}.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Preço do pacote (R$) — ex: 7,90"
                  value={packagePrice}
                  onChange={(e) => {
                    setPackagePrice(e.target.value);
                    const v = pricePerBase(type, Number(e.target.value), Number(packageSize));
                    if (v > 0) setCostPerKg(v.toFixed(2));
                  }}
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />
                <input
                  type="number"
                  step="any"
                  placeholder={`Tamanho do pacote (${INGREDIENT_KINDS.find((k) => k.key === type)?.unit}) — ex: ${type === "unidade" ? "30" : "395"}`}
                  value={packageSize}
                  onChange={(e) => {
                    setPackageSize(e.target.value);
                    const v = pricePerBase(type, Number(packagePrice), Number(e.target.value));
                    if (v > 0) setCostPerKg(v.toFixed(2));
                  }}
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">
                  Preço por {INGREDIENT_KINDS.find((k) => k.key === type)?.per} (R$) — calculado acima, ou digite direto
                </span>
                <input type="number" step="0.01" value={costPerKg} onChange={(e) => setCostPerKg(e.target.value)} className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
              </label>
            </div>
            <input placeholder="Marca (opcional)" value={color} onChange={(e) => setColor(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <input placeholder="Onde compra (opcional)" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
            <button type="submit" disabled={isSaving} className="rounded bg-blue-600 px-4 py-2 font-medium disabled:opacity-50 sm:col-span-2">
              {isSaving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar ingrediente"}
            </button>
          </form>
        )}

        <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">Carregando…</p>
          ) : materials.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">Nenhum ingrediente cadastrado. Cadastre leite condensado, creme de leite, farinha, ovos, chocolate… com o preço do pacote.</p>
          ) : (
            materials.map((m) => (
              <div key={m.id} className="flex flex-wrap items-start justify-between gap-2 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="text-sm text-neutral-400">
                    {INGREDIENT_KINDS.find((k) => k.key === ingredientKind(m))?.label}
                    {m.color ? ` · ${m.color}` : ""}
                  </p>
                  <p className="text-sm text-neutral-400">
                    {formatCurrency(m.cost_per_kg)}/{INGREDIENT_KINDS.find((k) => k.key === ingredientKind(m))?.per}
                  </p>
                  {m.supplier && <p className="text-xs text-neutral-500">{m.supplier}</p>}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button onClick={() => startEdit(m)} className="text-blue-400 hover:underline">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(m)} className="text-red-400 hover:underline">
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
