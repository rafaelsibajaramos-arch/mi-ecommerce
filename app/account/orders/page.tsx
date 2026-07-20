"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import OrderReceiptModal, { type ReceiptOrder } from "../../../components/OrderReceiptModal";

type OrdersResponse = {
  ok?: boolean;
  orders?: ReceiptOrder[];
  summary?: { totalOrders?: number; totalInvested?: number };
  pagination?: { page?: number; total?: number; totalPages?: number };
  error?: string;
};

const PAGE_SIZE = 10;

function formatMoney(value: number) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Sin fecha";
  }
}

function formatOrderNumber(value: number | null | undefined) {
  return value ? String(value).padStart(5, "0") : "-----";
}

function statusLabel(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "Entregado";
  if (normalized === "paid") return "Pagado";
  if (normalized === "pending") return "Pendiente";
  if (normalized === "processing") return "Procesando";
  if (normalized === "cancelled") return "Cancelado";
  return status || "Completado";
}

export default function AccountOrdersPage() {
  const router = useRouter();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [orders, setOrders] = useState<ReceiptOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ReceiptOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [summary, setSummary] = useState({ totalOrders: 0, totalInvested: 0 });
  const [totalPages, setTotalPages] = useState(1);

  const rangeIsValid = !dateFrom || !dateTo || dateFrom <= dateTo;

  const loadOrders = useCallback(
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
          page: String(currentPage),
          pageSize: String(PAGE_SIZE),
          includeSummary: currentPage === 1 ? "true" : "false",
        });
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);

        const response = await fetch(`/api/account/orders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as OrdersResponse | null;

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || "No se pudieron cargar los pedidos.");
        }

        setOrders(result.orders || []);
        setSummary((current) => ({
          totalOrders: Number(result.summary?.totalOrders || 0),
          totalInvested:
            typeof result.summary?.totalInvested === "number"
              ? Number(result.summary.totalInvested)
              : current.totalInvested,
        }));
        setTotalPages(Math.max(1, Number(result.pagination?.totalPages || 1)));
      } catch (error) {
        setOrders([]);
        setMessage(error instanceof Error ? error.message : "No se pudieron cargar los pedidos.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentPage, dateFrom, dateTo, rangeIsValid, router]
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const visibleProducts = useMemo(
    () => orders.reduce((total, order) => total + order.items.length, 0),
    [orders]
  );

  const changePage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white">
        <div className="flex items-center gap-3 text-sm text-white/60">
          <RefreshCw className="h-4 w-4 animate-spin" /> Cargando pedidos...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-white">
      <section className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Cuenta</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Mis pedidos</h1>
            <p className="mt-2 text-sm text-white/45">Consulta tus compras y abre el comprobante con las licencias entregadas.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/75 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
          </button>
        </header>

        {message ? (
          <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{message}</p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="text-xs text-white/40">Pedidos del período</p>
            <p className="mt-1 text-2xl font-black">{summary.totalOrders}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="text-xs text-white/40">Total invertido</p>
            <p className="mt-1 text-2xl font-black text-violet-200">{formatMoney(summary.totalInvested)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="text-xs text-white/40">Productos en esta página</p>
            <p className="mt-1 text-2xl font-black">{visibleProducts}</p>
          </div>
        </div>

        <section className="mt-4 rounded-[24px] border border-white/10 bg-slate-900/75 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
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
            <div>
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
          {!rangeIsValid ? <p className="mt-3 text-xs font-semibold text-red-200">La fecha inicial no puede ser posterior a la final.</p> : null}
          {(dateFrom || dateTo) ? (
            <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setCurrentPage(1); }} className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/60">Limpiar fechas</button>
          ) : null}
        </section>

        <section ref={sectionRef} className="mt-4 space-y-3">
          {orders.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/15 px-5 py-12 text-center text-sm text-white/45">No hay pedidos en el período seleccionado.</div>
          ) : (
            orders.map((order) => (
              <article key={order.id} className="rounded-[24px] border border-white/10 bg-slate-900/75 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Pedido #{formatOrderNumber(order.order_number)}</p>
                    <p className="mt-1 text-lg font-black">{formatMoney(order.total)}</p>
                    <p className="mt-1 text-xs text-white/40">{formatDate(order.created_at)} · {order.items.length} producto(s)</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">{statusLabel(order.status)}</span>
                    <button type="button" onClick={() => setSelectedOrder(order)} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-950">Ver comprobante</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {order.items.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl bg-white/[0.04] px-3 py-3">
                      <p className="truncate text-sm font-bold">{item.product_name}</p>
                      <p className="mt-0.5 truncate text-xs text-white/40">{item.variant_name || item.product_category || "Producto digital"}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
            <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-xs font-semibold text-white/50">Página <span className="text-white">{currentPage}</span> de {totalPages}</p>
            <button type="button" onClick={() => changePage(currentPage + 1)} disabled={currentPage >= totalPages} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        ) : null}
      </section>

      {selectedOrder ? <OrderReceiptModal order={selectedOrder} onClose={() => setSelectedOrder(null)} /> : null}
    </main>
  );
}
