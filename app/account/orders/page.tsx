"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type OrderRow = {
  id: string;
  order_number: number | null;
  user_id: string;
  total: number;
  status: string | null;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | null;
  product_name: string | null;
  variant_name: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
};

type LicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  license_text: string;
  status: string;
  assigned_order_id: string | null;
  assigned_order_item_id: string | null;
  assigned_user_id: string | null;
};

type OrderWithItems = {
  id: string;
  order_number: number | null;
  total: number;
  status: string;
  created_at: string;
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    product_id: string;
    product_name: string;
    variant_name: string | null;
    product_description: string | null;
    product_category: string | null;
    licenses: Array<{
      id: string;
      license_text: string;
    }>;
  }>;
};

export default function AccountOrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;

    if (selectedOrder) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previous || "";
    }

    return () => {
      document.body.style.overflow = previous || "";
    };
  }, [selectedOrder]);

  const loadOrders = async () => {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/login");
      return;
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, user_id, total, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (ordersError) {
      setMessage("No se pudieron cargar los pedidos.");
      setLoading(false);
      return;
    }

    const rawOrders = (ordersData as OrderRow[]) || [];

    if (rawOrders.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const orderIds = rawOrders.map((order) => order.id);

    const { data: itemsData, error: itemsError } = await supabase
  .from("order_items")
  .select("id, order_id, product_id, quantity, unit_price, product_name, variant_name")
  .in("order_id", orderIds);

    if (itemsError) {
      setMessage("No se pudieron cargar los productos de tus pedidos.");
      setLoading(false);
      return;
    }

    const rawItems = (itemsData as OrderItemRow[]) || [];
    const productIds = Array.from(
      new Set(rawItems.map((item) => item.product_id).filter(Boolean))
    );

    let productsMap = new Map<string, ProductRow>();

    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, description, category")
        .in("id", productIds);

      if (productsError) {
        setMessage("No se pudo cargar la información de los productos.");
        setLoading(false);
        return;
      }

      ((productsData as ProductRow[]) || []).forEach((product) => {
        productsMap.set(product.id, product);
      });
    }

    const { data: licensesData, error: licensesError } = await supabase
      .from("product_licenses")
      .select("id, product_id, variant_id, license_text, status, assigned_order_id, assigned_order_item_id, assigned_user_id")
      .in("assigned_order_id", orderIds)
      .eq("assigned_user_id", user.id)
      .eq("status", "assigned");

    if (licensesError) {
      setMessage("No se pudieron cargar las licencias entregadas.");
      setLoading(false);
      return;
    }

    const rawLicenses = (licensesData as LicenseRow[]) || [];

    const mergedOrders: OrderWithItems[] = rawOrders.map((order) => {
      const items = rawItems
        .filter((item) => item.order_id === order.id)
        .map((item) => {
          const product = productsMap.get(item.product_id);

          const itemLicenses = rawLicenses.filter((license) => {
            if (license.assigned_order_item_id) {
              return license.assigned_order_item_id === item.id;
            }

            return (
              license.assigned_order_id === order.id &&
              license.product_id === item.product_id
            );
          });

          return {
  id: item.id,
  quantity: Number(item.quantity || 0),
  price: Number(item.unit_price || 0),
  product_id: item.product_id,
  product_name: item.product_name || product?.name || "Producto",
  variant_name: item.variant_name || null,
  product_description: product?.description || null,
  product_category: product?.category || null,
            licenses: itemLicenses.map((license) => ({
              id: license.id,
              license_text: license.license_text,
            })),
          };
        });

      return {
        id: order.id,
        order_number: order.order_number,
        total: Number(order.total || 0),
        status: order.status || "completed",
        created_at: order.created_at,
        items,
      };
    });

    setOrders(mergedOrders);
    setLoading(false);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderDate = new Date(order.created_at);

      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`);
        if (orderDate < from) return false;
      }

      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59`);
        if (orderDate > to) return false;
      }

      return true;
    });
  }, [orders, dateFrom, dateTo]);

  const totalInvested = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  }, [filteredOrders]);

  const formatMoney = (value: number) => {
    return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
  };

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleDateString("es-CO", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Sin fecha";
    }
  };

  const formatOrderNumber = (value: number | null) => {
    if (!value) return "-----";
    return String(value).padStart(5, "0");
  };

  const getStatusLabel = (status: string) => {
    const normalized = (status || "").toLowerCase();

    if (normalized === "completed") return "Entregado";
    if (normalized === "paid") return "Pagado";
    if (normalized === "pending") return "Pendiente";
    if (normalized === "processing") return "Procesando";
    if (normalized === "cancelled") return "Cancelado";

    return status || "Completado";
  };

  const getStatusClasses = (status: string) => {
    const normalized = (status || "").toLowerCase();

    if (normalized === "completed" || normalized === "paid") {
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    }

    if (normalized === "pending") {
      return "border border-amber-400/20 bg-amber-400/10 text-amber-300";
    }

    if (normalized === "processing") {
      return "border border-blue-400/20 bg-blue-400/10 text-blue-300";
    }

    if (normalized === "cancelled") {
      return "border border-red-400/20 bg-red-400/10 text-red-300";
    }

    return "border border-white/10 bg-white/5 text-white/80";
  };

  const copyLicense = async (licenseText: string, licenseId: string) => {
    try {
      await navigator.clipboard.writeText(licenseText);
      setCopiedLicenseId(licenseId);
      setTimeout(() => setCopiedLicenseId(null), 1800);
    } catch {
      setCopiedLicenseId(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-transparent px-6 py-10 text-white">
        <div className="mx-auto max-w-7xl">Cargando pedidos...</div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-transparent px-4 py-8 text-white md:px-6 md:py-10">
        <section className="mx-auto max-w-7xl">
          <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  Pedidos
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
                  Mis pedidos
                </h1>
                <p className="mt-3 text-white/65">
                  Consulta tus comprobantes, servicios y licencias entregadas.
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/70">
                  Inversión total
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-300 md:text-3xl">
                  {formatMoney(totalInvested)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-800/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
              Filtrar por fecha
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-blue-500/50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-blue-500/50"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white md:w-auto"
                >
                  Limpiar filtro
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-800/80 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="border-b border-white/10 px-5 py-5 md:px-6">
              <h2 className="text-xl font-bold md:text-2xl">
                Historial de pedidos ({filteredOrders.length})
              </h2>
            </div>

            {message && (
              <div className="px-6 pt-5">
                <p className="text-sm text-red-400">{message}</p>
              </div>
            )}

            {filteredOrders.length === 0 ? (
              <div className="px-6 py-10 text-white/60">
                Todavía no tienes pedidos registrados para este filtro.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between md:px-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-6 w-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m7.5 4.27 9 5.15" />
                          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                          <path d="m3.3 7 8.7 5 8.7-5" />
                          <path d="M12 22V12" />
                        </svg>
                      </div>

                      <div>
                        <p className="text-lg font-bold text-white">
                          Pedido #{formatOrderNumber(order.order_number)}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-white/55">
                          <span>{formatDate(order.created_at)}</span>
                          <span>{order.items.length} servicio(s)</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${getStatusClasses(
                          order.status
                        )}`}
                      >
                        {getStatusLabel(order.status)}
                      </span>

                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                        {formatMoney(order.total)}
                      </span>

                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                      >
                        Ver comprobante
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-md"
            onClick={() => setSelectedOrder(null)}
          />

          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1220]/95 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 md:px-6">
              <div>
                <h3 className="text-2xl font-bold text-white">
                  Pedido recibido
                </h3>
                <p className="mt-1 text-sm text-white/45">
                  Comprobante #{formatOrderNumber(selectedOrder.order_number)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-5 md:p-6">
              <section className="grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/35">
                    Número del pedido
                  </p>
                  <p className="mt-3 text-lg font-bold text-white">
                    {formatOrderNumber(selectedOrder.order_number)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/35">
                    Estado
                  </p>
                  <div className="mt-3">
                    <span
                      className={`rounded-full px-3 py-2 text-sm font-semibold ${getStatusClasses(
                        selectedOrder.status
                      )}`}
                    >
                      {getStatusLabel(selectedOrder.status)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/35">
                    Fecha
                  </p>
                  <p className="mt-3 text-sm text-white/80">
                    {formatDate(selectedOrder.created_at)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/35">
                    Total
                  </p>
                  <p className="mt-3 text-lg font-bold text-emerald-300">
                    {formatMoney(selectedOrder.total)}
                  </p>
                </div>
              </section>

              <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <h4 className="text-lg font-bold text-white">
                  Servicios comprados
                </h4>

                <div className="mt-5 space-y-4">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-base font-bold text-white">
                            {item.product_name}
                            {item.variant_name ? ` - ${item.variant_name}` : ""}
                          </p>

                          <p className="mt-1 text-sm text-white/50">
                            {item.product_category || "Servicio digital"}
                          </p>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-sm text-white/50">
                            Cantidad: {item.quantity}
                          </p>
                          <p className="mt-1 text-base font-bold text-emerald-300">
                            {formatMoney(item.price * item.quantity)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <h4 className="text-lg font-bold text-white">
                  Licencias entregadas
                </h4>

                {selectedOrder.items.every((item) => item.licenses.length === 0) ? (
                  <p className="mt-4 text-sm text-white/55">
                    Este pedido todavía no tiene licencias asociadas.
                  </p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {selectedOrder.items.map((item) =>
                      item.licenses.map((license) => (
                        <div
                          key={license.id}
                          className="rounded-2xl border border-white/10 bg-black/20 p-4"
                        >
                          <p className="text-base font-bold text-white">
                            {item.product_name}
                            {item.variant_name ? ` - ${item.variant_name}` : ""}
                          </p>

                          <div className="mt-4 rounded-xl border border-white/10 bg-[#060b14] p-4">
                            <p className="text-xs uppercase tracking-[0.14em] text-white/35">
                              Licencia
                            </p>
                            <p className="mt-3 break-all text-sm leading-6 text-white/80">
                              {license.license_text}
                            </p>
                          </div>

                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                copyLicense(license.license_text, license.id)
                              }
                              className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
                            >
                              {copiedLicenseId === license.id
                                ? "Copiado"
                                : "Copiar licencia"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}