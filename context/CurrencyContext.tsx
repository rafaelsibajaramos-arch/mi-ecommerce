"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { formatDisplayMoney, type DisplayCurrency, type MoneyKind } from "@/lib/currency";

type Rate = { copPerUsd: number; checkedAt: string; validUntil: string };
type MxnRate = { copPerMxn: number; checkedAt: string; validUntil: string };
type PenRate = { copPerPen: number; checkedAt: string; validUntil: string };
const KEY = "streamingmayor_display_currency";
const CurrencyContext = createContext<{
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  rate: Rate | null;
  mxnRate: MxnRate | null;
  penRate: PenRate | null;
  formatMoney: (value: number | string | null | undefined, kind?: MoneyKind) => string;
} | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [preferred, setPreferred] = useState<DisplayCurrency>("COP");
  const [rate, setRate] = useState<Rate | null>(null);
  const [mxnRate, setMxnRate] = useState<MxnRate | null>(null);
  const [penRate, setPenRate] = useState<PenRate | null>(null);
  const pathname = usePathname();
  const currency: DisplayCurrency = pathname.startsWith("/admin") ? "COP"
    : preferred === "USD" && rate ? "USD"
    : preferred === "MXN" && mxnRate ? "MXN"
    : preferred === "PEN" && penRate ? "PEN" : "COP";

  useEffect(() => {
    const controller = new AbortController();
    const syncPreference = () => {
      try {
        const saved = localStorage.getItem(KEY);
        setPreferred(saved === "USD" || saved === "MXN" || saved === "PEN" ? saved : "COP");
      } catch {}
    };
    syncPreference();
    const refresh = async () => {
      try {
        const response = await fetch("/api/exchange-rate", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const next = await response.json();
        if (Number.isFinite(next.copPerUsd) && next.copPerUsd > 0 && next.checkedAt && next.validUntil) setRate(next);
        if (Number.isFinite(next.pen?.copPerPen) && next.pen.copPerPen > 0 && next.pen.checkedAt && next.pen.validUntil) setPenRate(next.pen);
        if (Number.isFinite(next.mxn?.copPerMxn) && next.mxn.copPerMxn > 0 && next.mxn.checkedAt && next.mxn.validUntil) setMxnRate(next.mxn);
      } catch { /* Preserve the last valid rate in this session. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("storage", syncPreference);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("storage", syncPreference);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const setCurrency = (next: DisplayCurrency) => {
    setPreferred(next);
    try { localStorage.setItem(KEY, next); } catch {}
  };
  const formatMoney = useCallback((value: number | string | null | undefined, kind: MoneyKind = "price") =>
    formatDisplayMoney(value, currency, currency === "PEN" ? penRate?.copPerPen ?? null : currency === "MXN" ? mxnRate?.copPerMxn ?? null : rate?.copPerUsd ?? null, kind), [currency, rate, mxnRate, penRate]);
  return <CurrencyContext.Provider value={{ currency, setCurrency, rate, mxnRate, penRate, formatMoney }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("CurrencyProvider no disponible");
  return context;
}
