export type DisplayCurrency = "COP" | "USD";
export type MoneyKind = "price" | "balance";

// Integer arithmetic prevents floating point errors at decimal boundaries.
export function usdUnits(cop: number, rate: number, kind: MoneyKind): number {
  if (!Number.isFinite(cop) || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Importe o tasa inválidos");
  }
  const cents = Math.round(Math.abs(cop) * 100);
  const rateCents = Math.round(rate * 100);
  const scale = kind === "price" ? 10 : 100;
  if (!Number.isSafeInteger(cents * scale) || rateCents <= 0) {
    throw new Error("Importe fuera de rango");
  }
  const numerator = BigInt(cents) * BigInt(scale);
  const denominator = BigInt(rateCents);
  const units = kind === "price"
    ? (numerator + denominator - BigInt(1)) / denominator
    : numerator / denominator;
  return Math.sign(cop) * Number(units) / scale;
}

export function formatDisplayMoney(
  value: number | string | null | undefined,
  currency: DisplayCurrency,
  rate: number | null,
  kind: MoneyKind = "price",
) {
  const cop = Number(value || 0);
  if (currency === "USD" && rate && Number.isFinite(cop)) {
    return `USD ${usdUnits(cop, rate, kind).toFixed(kind === "price" ? 1 : 2)}`;
  }
  return `$ ${Number.isFinite(cop) ? cop.toLocaleString("es-CO") : "0"}`;
}
