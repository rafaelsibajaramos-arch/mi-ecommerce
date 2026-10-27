"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { formatDisplayMoney, type DisplayCurrency, type MoneyKind } from "@/lib/currency";

type Rate = { copPerUsd: number; checkedAt: string; validUntil: string };
const KEY = "streamingmayor_display_currency";
const CurrencyContext = createContext<{
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  rate: Rate | null;
  formatMoney: (value: number | string | null | undefined, kind?: MoneyKind) => string;
} | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [preferred, setPreferred] = useState<DisplayCurrency>("COP");
  const [rate, setRate] = useState<Rate | null>(null);
  const pathname = usePathname();
  const currency = preferred === "USD" && rate && !pathname.startsWith("/admin") ? "USD" : "COP";

  useEffect(() => {
    const controller = new AbortController();
    const syncPreference = () => {
      try { setPreferred(localStorage.getItem(KEY) === "USD" ? "USD" : "COP"); } catch {}
    };
    syncPreference();
    const refresh = async () => {
      try {
        const response = await fetch("/api/exchange-rate", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const next = await response.json();
        if (Number.isFinite(next.copPerUsd) && next.copPerUsd > 0 && next.checkedAt && next.validUntil) setRate(next);
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
    formatDisplayMoney(value, currency, rate?.copPerUsd ?? null, kind), [currency, rate]);
  return <CurrencyContext.Provider value={{ currency, setCurrency, rate, formatMoney }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("CurrencyProvider no disponible");
  return context;
}
