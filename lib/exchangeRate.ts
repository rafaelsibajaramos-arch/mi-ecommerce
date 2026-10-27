import "server-only";
import { unstable_cache } from "next/cache";

export const EXCHANGE_RATE_TAG = "cop-usd-exchange-rate";

export type ExchangeRate = {
  copPerUsd: number;
  validFrom: string;
  validUntil: string;
  checkedAt: string;
};

// 13:00 UTC is 08:00 in Colombia all year. Before then retain yesterday's TRM.
export function rateDate(now = new Date()) {
  return new Date(now.getTime() - 13 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function fetchOfficialRate(): Promise<ExchangeRate> {
  const date = rateDate();
  const params = new URLSearchParams({
    "$where": `vigenciadesde <= '${date}T00:00:00' AND vigenciahasta >= '${date}T00:00:00'`,
    "$order": "vigenciadesde DESC",
    "$limit": "1",
  });
  const response = await fetch(`https://www.datos.gov.co/resource/32sa-8pi3.json?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("No se pudo consultar la TRM oficial");
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  const copPerUsd = Number(row?.valor);
  if (!Number.isFinite(copPerUsd) || copPerUsd < 100 || copPerUsd > 100000 ||
      !row?.vigenciadesde || !row?.vigenciahasta) {
    throw new Error("La fuente no devolvió una TRM válida");
  }
  return { copPerUsd, validFrom: row.vigenciadesde, validUntil: row.vigenciahasta,
    checkedAt: new Date().toISOString() };
}

// Next's persistent Data Cache keeps the last successful result when revalidation fails.
// The short interval also recovers automatically if the daily cron is delayed.
export const getExchangeRate = unstable_cache(fetchOfficialRate,
  ["official-cop-usd-v1"], { revalidate: 60, tags: [EXCHANGE_RATE_TAG] });
