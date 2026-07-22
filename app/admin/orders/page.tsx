"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import OrderReceiptModal, {
  type ReceiptOrder,
} from "../../../components/OrderReceiptModal";

type AdminOrder = ReceiptOrder & {
  customer_email: string;
  customer_full_name: string;
  is_reverted: boolean;
  reverted_at: string | null;
  reverted_by: string | null;
  released_license_count: number;
};

type BannerState = {
  kind: "error" | "success";
  text: string;
} | null;

const PAGE_SIZE = 10;

function buildPagination(current: number, total: number): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, "...", total];
  }

  if (current >= total - 3) {
    return [1, "...", total - 3, total - 2, total - 1, total];
  }

  return [1, "...", current - 1, current, current + 1, "...", total];
}

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Sin fecha";
  }
}

function formatOrderNumber(value: number | null | undefined) {
  return value ? `#${value}` : "#Sin número";
}

function getStatusLabel(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase().trim();

  if (normalized === "paid") return "Pagado";
  if (normalized === "pending") return "Pendiente";
  if (normalized === "cancelled") return "Cancelado";
  if (normalized === "completed") return "Completado";
  if (normalized === "reverted") return "Revertido";

  return status || "Completado";
}

function getStatusClasses(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase().trim();

  if (normalized === "paid" || normalized === "completed") {
    return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }

  if (normalized === "pending") {
    return "border border-amber-400/20 bg-amber-400/10 text-amber-300";
  }

  if (normalized === "cancelled" || normalized === "reverted") {
    return "border border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700";
}

export default function AdminOrdersPage() {
  const ordersSectionRef = useRef<HTMLDivElement | null>(null);

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "REVERTED" | "ALL">("ACTIVE");
  const [selectedOrder, setSelectedOrder] = useState<ReceiptOrder | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [reversingOrderId, setReversingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setBanner(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setBanner({
          kind: "error",
          text: "Tu sesión expiró. Inicia sesión de nuevo.",
        });
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/orders/list", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "No se pudieron cargar los pedidos.");
      }

      setOrders((result?.orders as AdminOrder[]) || []);
      setCurrentPage(1);
    } catch (error) {
      setOrders([]);
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error cargando los pedidos.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadOrders]);

  const reverseOrder = async (order: AdminOrder) => {
    if (order.is_reverted || reversingOrderId) return;

    const confirmed = window.confirm(
      `¿Revertir el pedido ${formatOrderNumber(order.order_number)}?\n\nSe devolverán ${formatMoney(order.total)} al cliente, las licencias volverán al stock y el pedido desaparecerá de su historial.`
    );

    if (!confirmed) return;

    setReversingOrderId(order.id);
    setBanner(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
      }

      const response = await fetch("/api/admin/orders/reverse", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "No se pudo revertir el pedido.");
      }

      if (selectedOrder?.id === order.id) {
        setSelectedOrder(null);
      }

      await loadOrders();
      setStatusFilter("REVERTED");
      setBanner({
        kind: "success",
        text: `Pedido revertido. Se devolvieron ${formatMoney(result?.refundAmount || order.total)} y se liberaron ${Number(result?.releasedLicenses || 0)} licencia(s).`,
      });
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "No se pudo revertir el pedido.",
      });
    } finally {
      setReversingOrderId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "REVERTED" ? order.is_reverted : !order.is_reverted);

      if (!matchesStatus) return false;
      if (!term) return true;

      const orderNumber = String(order.order_number || "").toLowerCase();
      const email = (order.customer_email || "").toLowerCase();
      const fullName = (order.customer_full_name || "").toLowerCase();

      const licensesText = order.items
        .flatMap((item) => item.licenses.map((license) => license.license_text))
        .join(" ")
        .toLowerCase();

      return (
        orderNumber.includes(term) ||
        email.includes(term) ||
        fullName.includes(term) ||
        licensesText.includes(term)
      );
    });
  }, [orders, search, statusFilter]);

  const totalRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      if (statusFilter === "REVERTED") {
        return sum + Number(order.total || 0);
      }

      return order.is_reverted ? sum : sum + Number(order.total || 0);
    }, 0);
  }, [filteredOrders, statusFilter]);

  const totalLicenses = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      if (order.is_reverted) {
        return sum + Number(order.released_license_count || 0);
      }

      return (
        sum +
        order.items.reduce((itemAcc, item) => itemAcc + item.licenses.length, 0)
      );
    }, 0);
  }, [filteredOrders]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  }, [filteredOrders.length]);

  const effectiveCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOrders = useMemo(() => {
    const start = (effectiveCurrentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredOrders.slice(start, end);
  }, [effectiveCurrentPage, filteredOrders]);

  const paginationItems = useMemo(() => {
    return buildPagination(effectiveCurrentPage, totalPages);
  }, [effectiveCurrentPage, totalPages]);

  const pageStart =
    filteredOrders.length === 0 ? 0 : (effectiveCurrentPage - 1) * PAGE_SIZE + 1;

  const pageEnd = Math.min(effectiveCurrentPage * PAGE_SIZE, filteredOrders.length);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    ordersSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const getLicensesPreview = (order: AdminOrder) => {
    const preview = order.items
      .flatMap((item) => item.licenses.map((license) => license.license_text))
      .filter(Boolean)
      .slice(0, 2);

    return preview;
  };

  return (
    <>
      <section className="space-y-6 text-slate-900" ref={ordersSectionRef}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Administración
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Pedidos
            </h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Revisa compras, correos del cliente, licencias entregadas y
              comprobantes.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_180px] lg:max-w-2xl">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Buscar pedido
              </label>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Número, correo o licencia"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Mostrar
              </label>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "ACTIVE" | "REVERTED" | "ALL");
                  setCurrentPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="ACTIVE">Pedidos activos</option>
                <option value="REVERTED">Revertidos</option>
                <option value="ALL">Todos</option>
              </select>
            </div>
          </div>
        </div>

        {banner && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
              banner.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Pedidos
            </p>
            <p className="mt-4 text-4xl font-extrabold text-slate-900">
              {filteredOrders.length}
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {statusFilter === "REVERTED" ? "Monto devuelto" : "Facturación"}
            </p>
            <p className="mt-4 text-4xl font-extrabold text-slate-900">
              {formatMoney(totalRevenue)}
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {statusFilter === "REVERTED" ? "Licencias restauradas" : "Licencias entregadas"}
            </p>
            <p className="mt-4 text-4xl font-extrabold text-slate-900">
              {totalLicenses}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="px-6 py-10">
              <p className="text-slate-500">Cargando pedidos...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="px-6 py-10">
              <p className="text-slate-500">
                No se encontraron pedidos con ese filtro.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[0.8fr_1.3fr_1fr_0.7fr_0.8fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-500 xl:grid">
                <span>Pedido</span>
                <span>Cliente</span>
                <span>Fecha</span>
                <span>Total</span>
                <span className="text-right">Acción</span>
              </div>

              <div className="divide-y divide-slate-200">
                {paginatedOrders.map((order) => {
                  const licensesCount = order.is_reverted
                    ? Number(order.released_license_count || 0)
                    : order.items.reduce(
                        (sum, item) => sum + item.licenses.length,
                        0
                      );

                  const licensesPreview = getLicensesPreview(order);

                  return (
                    <div key={order.id} className="px-5 py-5 sm:px-6">
                      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.3fr_1fr_0.7fr_0.8fr] xl:items-center">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                            Pedido
                          </p>
                          <p className="text-xl font-extrabold text-slate-900">
                            {formatOrderNumber(order.order_number)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                            Cliente
                          </p>
                          <p className="break-all text-base font-semibold text-slate-900">
                            {order.customer_email}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {order.customer_full_name}
                          </p>

                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Licencias
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-700">
                              {licensesCount > 0
                                ? `${licensesCount} licencia(s) ${order.is_reverted ? "restaurada(s)" : ""}`
                                : "Sin licencias"}
                            </p>

                            {licensesPreview.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {licensesPreview.map((text, index) => (
                                  <p
                                    key={`${order.id}-license-preview-${index}`}
                                    className="break-all rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700"
                                  >
                                    {text}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                            Fecha
                          </p>
                          <p className="text-sm text-slate-700">
                            {formatDate(order.created_at)}
                          </p>
                          <span
                            className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                              order.status
                            )}`}
                          >
                            {getStatusLabel(order.status)}
                          </span>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                            Total
                          </p>
                          <p className="text-xl font-extrabold text-slate-900">
                            {formatMoney(order.total)}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 xl:items-end">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="inline-flex w-full items-center justify-center rounded-2xl bg-[#050816] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 xl:w-auto"
                          >
                            Ver comprobante
                          </button>

                          {!order.is_reverted ? (
                            <button
                              type="button"
                              onClick={() => void reverseOrder(order)}
                              disabled={Boolean(reversingOrderId)}
                              className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
                            >
                              {reversingOrderId === order.id ? "Revirtiendo..." : "Revertir pedido"}
                            </button>
                          ) : (
                            <p className="text-xs font-semibold text-rose-600">
                              Revertido {order.reverted_at ? formatDate(order.reverted_at) : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!loading && filteredOrders.length > 0 && (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{pageStart}</span> -{" "}
              <span className="font-semibold">{pageEnd}</span> de{" "}
              <span className="font-semibold">{filteredOrders.length}</span>{" "}
              pedidos
            </p>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(Math.max(effectiveCurrentPage - 1, 1))
                  }
                  disabled={effectiveCurrentPage === 1}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ‹
                </button>

                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`orders-ellipsis-${index}`}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handlePageChange(item)}
                      className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${
                        effectiveCurrentPage === item
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(
                      Math.min(effectiveCurrentPage + 1, totalPages)
                    )
                  }
                  disabled={effectiveCurrentPage === totalPages}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <OrderReceiptModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}