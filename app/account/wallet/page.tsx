"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
};

type FilterType = "all" | "credit" | "debit";

type DateRange = {
  from: string;
  to: string;
};

const PAGE_SIZE = 8;
const BOGOTA_TIME_ZONE = "America/Bogota";

function getBogotaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
  };
}

function buildMonthRange(year: number, month: number): DateRange {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthText = String(month).padStart(2, "0");

  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function getCurrentMonthRange(): DateRange {
  const { year, month } = getBogotaDateParts();
  return buildMonthRange(year, month);
}

function getPreviousMonthRange(): DateRange {
  const { year, month } = getBogotaDateParts();
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return buildMonthRange(previous.getUTCFullYear(), previous.getUTCMonth() + 1);
}

function formatInputDate(value: string) {
  if (!value) return "Sin fecha";

  try {
    return new Date(`${value}T12:00:00.000-05:00`).toLocaleDateString("es-CO", {
      timeZone: BOGOTA_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function getTransactionKind(tx: WalletTransaction): "credit" | "debit" {
  const txType = (tx.type || "").toLowerCase().trim();

  if (
    txType === "debit" ||
    txType === "purchase" ||
    txType === "order" ||
    txType.includes("debito") ||
    txType.includes("débito") ||
    txType.includes("compra")
  ) {
    return "debit";
  }

  if (
    txType === "credit" ||
    txType === "deposit" ||
    txType.includes("credito") ||
    txType.includes("crédito") ||
    txType.includes("deposito") ||
    txType.includes("depósito") ||
    txType.includes("recarga")
  ) {
    return "credit";
  }

  return "debit";
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("es-CO");
}

function formatSignedMoney(tx: WalletTransaction) {
  const amount = Number(tx.amount || 0);
  const kind = getTransactionKind(tx);
  return `${kind === "credit" ? "+" : "-"}$ ${formatMoney(amount)}`;
}

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleString("es-CO", {
      timeZone: BOGOTA_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Sin fecha";
  }
}

function formatTransactionNote(tx: WalletTransaction) {
  const note = tx.note || "";

  return note
    .replace(/Recarga Wompi aprobada/gi, "Recarga Bre-B / Llaves aprobada")
    .replace(/Wompi/gi, "Bre-B / Llaves")
    .trim();
}

function getTransactionTitle(tx: WalletTransaction) {
  const txType = (tx.type || "").toLowerCase().trim();
  const txNote = (tx.note || "").toLowerCase().trim();

  if (
    txNote.includes("compra") ||
    txNote.includes("pedido") ||
    txType === "purchase" ||
    txType === "order"
  ) {
    return "Venta";
  }

  if (
    txType === "debit" ||
    txType.includes("debito") ||
    txType.includes("débito")
  ) {
    return "Débito";
  }

  return "Recarga";
}

export default function WalletPage() {
  const router = useRouter();
  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const initialRange = useMemo(() => getCurrentMonthRange(), []);

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [periodSales, setPeriodSales] = useState(0);
  const [periodCredits, setPeriodCredits] = useState(0);
  const [creditCount, setCreditCount] = useState(0);

  const loadWallet = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setTransactions([]);
      setTotalTransactionCount(0);
      setPeriodSales(0);
      setPeriodCredits(0);
      setCreditCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const params = new URLSearchParams({
      from: dateFrom,
      to: dateTo,
      filter,
      page: String(currentPage),
      pageSize: String(PAGE_SIZE),
    });

    try {
      const response = await fetch(`/api/account/wallet/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        transactions?: WalletTransaction[];
        totals?: {
          sales?: number;
          credits?: number;
          creditCount?: number;
          transactionCount?: number;
        };
        pagination?: { total?: number };
      } | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "No se pudo cargar la billetera.");
      }

      setTransactions(result.transactions || []);
      setTotalTransactionCount(Number(result.pagination?.total || 0));
      setPeriodSales(Number(result.totals?.sales || 0));
      setPeriodCredits(Number(result.totals?.credits || 0));
      setCreditCount(Number(result.totals?.creditCount || 0));
    } catch {
      setTransactions([]);
      setTotalTransactionCount(0);
      setPeriodSales(0);
      setPeriodCredits(0);
      setCreditCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, dateFrom, dateTo, filter, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWallet();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWallet]);

  const rangeIsValid = !dateFrom || !dateTo || dateFrom <= dateTo;
  const filteredTransactions = transactions;
  const totalPages = Math.max(1, Math.ceil(totalTransactionCount / PAGE_SIZE));
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTransactions = filteredTransactions;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyRange = (range: DateRange) => {
    setDateFrom(range.from);
    setDateTo(range.to);
    setCurrentPage(1);
  };

  const changeFilter = (nextFilter: FilterType) => {
    setFilter(nextFilter);
    setCurrentPage(1);
  };

  const periodLabel = `${formatInputDate(dateFrom)} — ${formatInputDate(dateTo)}`;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 text-sm text-white/60">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando billetera...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-white">
      <section className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">
              Billetera
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Resumen de ventas</h1>
          </div>

          <button
            type="button"
            onClick={() => void loadWallet(true)}
            disabled={refreshing}
            aria-label="Actualizar billetera"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </header>

        <section className="mt-5 overflow-hidden rounded-[24px] border border-violet-400/20 bg-gradient-to-br from-violet-500/20 via-slate-900/90 to-slate-950/90 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-violet-200/75">Vendido en el período</p>
                <p className="mt-1 break-words text-3xl font-black text-white sm:text-4xl">
                  $ {formatMoney(periodSales)}
                </p>
                <p className="mt-1 truncate text-xs text-white/45 sm:text-sm">{periodLabel}</p>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-200">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold text-white/55">Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-400/50"
                />
              </div>

              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold text-white/55">Hasta</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-400/50"
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => applyRange(getCurrentMonthRange())}
                className="flex-1 rounded-xl border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-100 transition hover:bg-violet-400/20"
              >
                Este mes
              </button>
              <button
                type="button"
                onClick={() => applyRange(getPreviousMonthRange())}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/65 transition hover:bg-white/10 hover:text-white"
              >
                Mes anterior
              </button>
            </div>

            {!rangeIsValid ? (
              <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
                La fecha inicial no puede ser posterior a la fecha final.
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-emerald-300">
              <ArrowUpRight className="h-4 w-4" />
              <p className="text-xs font-semibold">Recargas</p>
            </div>
            <p className="mt-2 break-words text-xl font-black text-white">
              $ {formatMoney(periodCredits)}
            </p>
            <p className="mt-1 text-[11px] text-white/35">{creditCount} movimiento(s)</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-sky-300">
              <History className="h-4 w-4" />
              <p className="text-xs font-semibold">Movimientos</p>
            </div>
            <p className="mt-2 text-xl font-black text-white">{totalTransactionCount}</p>
            <p className="mt-1 text-[11px] text-white/35">En el período</p>
          </div>
        </div>

        <section
          ref={historySectionRef}
          className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/75 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl"
        >
          <div className="border-b border-white/10 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Historial
                </p>
                <h2 className="mt-1 text-lg font-extrabold">Movimientos</h2>
              </div>
              <span className="text-xs text-white/40">{totalTransactionCount}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-black/20 p-1">
              {(
                [
                  ["all", "Todos"],
                  ["credit", "Recargas"],
                  ["debit", "Ventas"],
                ] as Array<[FilterType, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeFilter(value)}
                  className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                    filter === value
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-white/45">
              No hay movimientos en el período seleccionado.
            </div>
          ) : (
            <div className="divide-y divide-white/8">
              {paginatedTransactions.map((tx) => {
                const kind = getTransactionKind(tx);

                return (
                  <article key={tx.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        kind === "credit"
                          ? "bg-emerald-500/12 text-emerald-300"
                          : "bg-red-500/12 text-red-300"
                      }`}
                    >
                      {kind === "credit" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-white">
                          {getTransactionTitle(tx)}
                        </p>
                        <p
                          className={`shrink-0 text-sm font-black ${
                            kind === "credit" ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {formatSignedMoney(tx)}
                        </p>
                      </div>

                      <p className="mt-0.5 truncate text-xs text-white/40">
                        {formatTransactionNote(tx) || "Movimiento registrado"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/25">{formatDate(tx.created_at)}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {totalTransactionCount > PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => handlePageChange(Math.max(effectiveCurrentPage - 1, 1))}
                disabled={effectiveCurrentPage === 1}
                aria-label="Página anterior"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <p className="text-xs font-semibold text-white/45">
                Página <span className="text-white">{effectiveCurrentPage}</span> de {totalPages}
              </p>

              <button
                type="button"
                onClick={() => handlePageChange(Math.min(effectiveCurrentPage + 1, totalPages))}
                disabled={effectiveCurrentPage === totalPages}
                aria-label="Página siguiente"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
