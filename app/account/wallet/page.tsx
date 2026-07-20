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
type DateRange = { from: string; to: string };

type WalletResponse = {
  ok?: boolean;
  transactions?: WalletTransaction[];
  totals?: {
    sales?: number;
    credits?: number;
    creditCount?: number;
    transactionCount?: number;
  };
  pagination?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
  error?: string;
};

const PAGE_SIZE = 8;
const BOGOTA_TIME_ZONE = "America/Bogota";

function getBogotaDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BOGOTA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return { year: Number(parts.year), month: Number(parts.month) };
}

function buildMonthRange(year: number, month: number): DateRange {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthText = String(month).padStart(2, "0");
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function getCurrentMonthRange() {
  const { year, month } = getBogotaDateParts();
  return buildMonthRange(year, month);
}

function getPreviousMonthRange() {
  const { year, month } = getBogotaDateParts();
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return buildMonthRange(previous.getUTCFullYear(), previous.getUTCMonth() + 1);
}

function getTransactionKind(tx: WalletTransaction): "credit" | "debit" {
  const type = String(tx.type || "").toLowerCase();
  const note = String(tx.note || "").toLowerCase();
  if (
    type === "credit" ||
    type.includes("credito") ||
    type.includes("crédito") ||
    type.includes("deposit") ||
    type.includes("depósito") ||
    type.includes("recarga")
  ) {
    return "credit";
  }
  if (note.includes("compra") || note.includes("pedido")) return "debit";
  return "debit";
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("es-CO");
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

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
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

function transactionTitle(tx: WalletTransaction) {
  const type = String(tx.type || "").toLowerCase();
  const note = String(tx.note || "").toLowerCase();
  if (note.includes("compra") || note.includes("pedido") || type === "purchase" || type === "order") return "Venta";
  if (getTransactionKind(tx) === "debit") return "Débito";
  return "Recarga";
}

function transactionNote(tx: WalletTransaction) {
  return String(tx.note || "")
    .replace(/Recarga Wompi aprobada/gi, "Recarga Bre-B / Llaves aprobada")
    .replace(/Wompi/gi, "Bre-B / Llaves")
    .trim();
}

export default function WalletPage() {
  const router = useRouter();
  const historyRef = useRef<HTMLDivElement | null>(null);
  const initialRange = useMemo(() => getCurrentMonthRange(), []);

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [totals, setTotals] = useState({ sales: 0, credits: 0, creditCount: 0, transactionCount: 0 });
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const rangeIsValid = Boolean(dateFrom && dateTo && dateFrom <= dateTo);

  const loadWallet = useCallback(
    async (showRefreshing = false) => {
      if (!rangeIsValid) return;
      if (showRefreshing) setRefreshing(true);
      setMessage("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/login");
          return;
        }

        const params = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
          filter,
          page: String(currentPage),
          pageSize: String(PAGE_SIZE),
        });

        const response = await fetch(`/api/account/wallet/summary?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as WalletResponse | null;

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || "No se pudo cargar la billetera.");
        }

        setTransactions(result.transactions || []);
        setTotals({
          sales: Number(result.totals?.sales || 0),
          credits: Number(result.totals?.credits || 0),
          creditCount: Number(result.totals?.creditCount || 0),
          transactionCount: Number(result.totals?.transactionCount || 0),
        });
        setPagination({
          total: Number(result.pagination?.total || 0),
          totalPages: Math.max(1, Number(result.pagination?.totalPages || 1)),
        });
      } catch (error) {
        setTransactions([]);
        setMessage(error instanceof Error ? error.message : "No se pudo cargar la billetera.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentPage, dateFrom, dateTo, filter, rangeIsValid, router]
  );

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const applyRange = (range: DateRange) => {
    setCurrentPage(1);
    setDateFrom(range.from);
    setDateTo(range.to);
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Billetera</p>
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

        {message ? (
          <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{message}</p>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-[24px] border border-violet-400/20 bg-gradient-to-br from-violet-500/20 via-slate-900/90 to-slate-950/90 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-violet-200/75">Vendido en el período</p>
                <p className="mt-1 break-words text-3xl font-black text-white sm:text-4xl">$ {formatMoney(totals.sales)}</p>
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
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]"
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
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => applyRange(getCurrentMonthRange())} className="flex-1 rounded-xl border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-100">
                Este mes
              </button>
              <button type="button" onClick={() => applyRange(getPreviousMonthRange())} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/65">
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
            <div className="flex items-center gap-2 text-emerald-300"><ArrowUpRight className="h-4 w-4" /><p className="text-xs font-semibold">Recargas</p></div>
            <p className="mt-2 break-words text-xl font-black text-white">$ {formatMoney(totals.credits)}</p>
            <p className="mt-1 text-[11px] text-white/35">{totals.creditCount} movimiento(s)</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-sky-300"><History className="h-4 w-4" /><p className="text-xs font-semibold">Movimientos</p></div>
            <p className="mt-2 text-xl font-black text-white">{totals.transactionCount}</p>
            <p className="mt-1 text-[11px] text-white/35">En el período</p>
          </div>
        </div>

        <section ref={historyRef} className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/75 backdrop-blur-xl">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Historial</p><h2 className="mt-1 text-lg font-extrabold">Movimientos</h2></div>
              <span className="text-xs text-white/40">{pagination.total}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-black/20 p-1">
              {([['all','Todos'],['credit','Recargas'],['debit','Ventas']] as Array<[FilterType,string]>).map(([value,label]) => (
                <button key={value} type="button" onClick={() => { setFilter(value); setCurrentPage(1); }} className={`rounded-xl px-2 py-2 text-xs font-bold transition ${filter === value ? 'bg-white text-slate-950' : 'text-white/50'}`}>{label}</button>
              ))}
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-white/45">No hay movimientos en el período seleccionado.</div>
          ) : (
            <div className="divide-y divide-white/8">
              {transactions.map((tx) => {
                const kind = getTransactionKind(tx);
                return (
                  <article key={tx.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kind === 'credit' ? 'bg-emerald-500/12 text-emerald-300' : 'bg-red-500/12 text-red-300'}`}>
                      {kind === 'credit' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-white">{transactionTitle(tx)}</p>
                        <p className={`shrink-0 text-sm font-black ${kind === 'credit' ? 'text-emerald-300' : 'text-red-300'}`}>{kind === 'credit' ? '+' : '-'}$ {formatMoney(Math.abs(Number(tx.amount || 0)))}</p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-white/40">{transactionNote(tx) || 'Movimiento registrado'}</p>
                      <p className="mt-0.5 text-[11px] text-white/25">{formatDate(tx.created_at)}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 sm:px-5">
              <button type="button" onClick={() => { setCurrentPage((page) => Math.max(1, page - 1)); historyRef.current?.scrollIntoView({ behavior: 'smooth' }); }} disabled={currentPage === 1} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <p className="text-xs font-semibold text-white/45">Página <span className="text-white">{currentPage}</span> de {pagination.totalPages}</p>
              <button type="button" onClick={() => { setCurrentPage((page) => Math.min(pagination.totalPages, page + 1)); historyRef.current?.scrollIntoView({ behavior: 'smooth' }); }} disabled={currentPage >= pagination.totalPages} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
