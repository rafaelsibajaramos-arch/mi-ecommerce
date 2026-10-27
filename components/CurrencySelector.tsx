"use client";

import { useCurrency } from "@/context/CurrencyContext";
import { usePathname } from "next/navigation";

export default function CurrencySelector() {
  const { currency, setCurrency, rate } = useCurrency();
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <div className="flex flex-col items-end gap-1 text-xs text-white/70">
    <label className="flex items-center gap-2">
      <span>Moneda</span>
      <select aria-label="Moneda para visualizar precios" value={currency}
        onChange={event => setCurrency(event.target.value === "USD" ? "USD" : "COP")}
        className="rounded-lg border border-white/15 bg-[#090b12] px-2 py-1.5 text-white">
        <option value="COP">COP</option>
        <option value="USD" disabled={!rate}>USD</option>
      </select>
    </label>
    {currency === "USD" && rate && <p className="max-w-64 text-right text-[10px]">
      USD de referencia. Operaciones en COP.<br />
      1 USD = $ {rate.copPerUsd.toLocaleString("es-CO")} COP.
      <br /><a href="https://www.google.com/finance/quote/USD-COP" target="_blank" rel="noopener noreferrer" className="underline">Fuente: Google Finance</a>.
      <br />Consulta: {new Date(rate.checkedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}.
    </p>}
    {!rate && <span className="text-[10px]">USD no disponible temporalmente</span>}
  </div>;
}
