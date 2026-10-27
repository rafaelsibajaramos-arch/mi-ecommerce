"use client";

import { useCurrency } from "@/context/CurrencyContext";
import { usePathname } from "next/navigation";

export default function CurrencySelector() {
  const { currency, setCurrency, rate } = useCurrency();
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-base font-semibold text-white">
      <span>Moneda</span>
      <span className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-[#090b12] pl-3 pr-1">
        <svg viewBox="0 0 32 22" aria-hidden="true" className="h-[22px] w-8 shrink-0 overflow-hidden rounded-[3px]">
          {currency === "COP" ? <>
            <path fill="#FCD116" d="M0 0h32v11H0z" />
            <path fill="#003893" d="M0 11h32v5.5H0z" />
            <path fill="#CE1126" d="M0 16.5h32V22H0z" />
          </> : <>
            <path fill="#fff" d="M0 0h32v22H0z" />
            {Array.from({ length: 7 }, (_, row) => <path key={row} fill="#B22234" d={`M0 ${row * 44 / 13}h32v${22 / 13}H0z`} />)}
            <path fill="#3C3B6E" d="M0 0h13v11.85H0z" />
            {Array.from({ length: 9 }, (_, row) => Array.from({ length: row % 2 === 0 ? 6 : 5 }, (_, col) =>
              <circle key={`${row}-${col}`} cx={1.1 + col * 2.15 + (row % 2) * 1.075} cy={0.8 + row * 1.27} r="0.4" fill="white" />
            ))}
          </>}
        </svg>
        <select aria-label="Moneda para visualizar precios" value={currency}
          onChange={event => setCurrency(event.target.value === "USD" ? "USD" : "COP")}
          className="min-h-11 cursor-pointer rounded-xl bg-[#090b12] py-2 pr-2 text-base font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          <option value="COP">COP</option>
          <option value="USD" disabled={!rate}>USD</option>
        </select>
      </span>
    </label>
  );
}
