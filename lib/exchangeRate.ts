import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

import { parseGoogleRate } from "@/lib/googleRate";
export const EXCHANGE_RATE_TAG = "google-cop-usd-exchange-rate";
export const MXN_EXCHANGE_RATE_TAG = "google-cop-mxn-exchange-rate";

export type ExchangeRate = {
  source: string;
  copPerUsd: number;
  validFrom: string;
  validUntil: string;
  checkedAt: string;
};

// Daily snapshot boundary: 08:00 Colombia / 13:00 UTC.
export function rateDate(now = new Date()) {
  return new Date(now.getTime() - 13 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchCurrencyRate(currency: "USD" | "MXN") {
  const response = await fetch(`https://www.google.com/finance/quote/${currency}-COP?hl=en`, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Google Finance unavailable");
  const copPerUnit = parseGoogleRate(await response.text(), currency);
  const checkedAt = new Date().toISOString();
  const nextRefresh = new Date(rateDate() + "T13:00:00.000Z");
  nextRefresh.setUTCDate(nextRefresh.getUTCDate() + 1);
  return { copPerUnit, validFrom: checkedAt, validUntil: nextRefresh.toISOString(),
    checkedAt, source: "Google Finance" };
}

export async function fetchGoogleRate(): Promise<ExchangeRate> {
  const { copPerUnit, ...metadata } = await fetchCurrencyRate("USD");
  return { ...metadata, copPerUsd: copPerUnit };
}

export async function fetchGoogleMxnRate() {
  const { copPerUnit, ...metadata } = await fetchCurrencyRate("MXN");
  return { ...metadata, copPerMxn: copPerUnit };
}

// Keep the last successful snapshot when the source fails. A separate cache key
// ensures the previous official TRM is never presented as a Google quote.
const cachedRate = unstable_cache(fetchGoogleRate,
  ["google-finance-usd-cop-v1"], { revalidate: false, tags: [EXCHANGE_RATE_TAG] });

const cachedMxnRate = unstable_cache(fetchGoogleMxnRate,
  ["google-finance-mxn-cop-v1"], { revalidate: false, tags: [MXN_EXCHANGE_RATE_TAG] });

export async function getMxnExchangeRate() {
  const rate = await cachedMxnRate();
  if (rateDate(new Date(rate.checkedAt)) < rateDate()) {
    revalidateTag(MXN_EXCHANGE_RATE_TAG, "max");
    return cachedMxnRate();
  }
  return rate;
}

export async function getExchangeRate() {
  const rate = await cachedRate();
  if (rateDate(new Date(rate.checkedAt)) < rateDate()) {
    revalidateTag(EXCHANGE_RATE_TAG, "max");
    return cachedRate();
  }
  return rate;
}
