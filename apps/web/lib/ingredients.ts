// Ingredientes da confeitaria (cadastrados em "Ingredientes", que usam a
// estrutura de Materiais): o campo `type` diz como o ingrediente é medido e
// `cost_per_kg` guarda o preço por kg (peso), por litro (volume) ou por
// unidade (ovos, caixinhas, velas…).
export type IngredientKind = "peso" | "volume" | "unidade";

export const INGREDIENT_KINDS: { key: IngredientKind; label: string; unit: string; per: string }[] = [
  { key: "peso", label: "Peso (g / kg)", unit: "g", per: "kg" },
  { key: "volume", label: "Volume (ml / litro)", unit: "ml", per: "litro" },
  { key: "unidade", label: "Unidade (ovo, caixa, vela…)", unit: "un", per: "unidade" },
];

export function ingredientKind(m: { type?: string | null }): IngredientKind {
  const t = (m.type ?? "").toLowerCase();
  if (t === "volume") return "volume";
  if (t === "unidade") return "unidade";
  return "peso";
}

export function ingredientUnit(m: { type?: string | null }): "g" | "ml" | "un" {
  const k = ingredientKind(m);
  return k === "volume" ? "ml" : k === "unidade" ? "un" : "g";
}

// Preço por kg/litro/unidade a partir do pacote comprado
// (ex.: leite condensado 395 g por R$ 7,90 → R$ 20,00/kg).
export function pricePerBase(kind: IngredientKind, packagePrice: number, packageSize: number): number {
  if (!(packagePrice > 0) || !(packageSize > 0)) return 0;
  return kind === "unidade" ? packagePrice / packageSize : (packagePrice / packageSize) * 1000;
}
