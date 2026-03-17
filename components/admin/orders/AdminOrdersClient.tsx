"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type OrderRow = {
  id: string;
  order_number: number | null;
  user_id: string | null;
  total: number | null;
  created_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  product_name: string | null;
  variant_name: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role?: string | null;
};

type LicenseRow = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  license_text: string;
  status: string | null;
  assigned_order_id: string | null;
  assigned_order_item_id: string | null;
  assigned_user_id: string | null;
};

type FormattedLicense = {
  id: string;
  license_text: string;
  product_name: string;
  variant_name: string | null;
};

type FormattedItem = {
  id: string;
  quantity: number;
  price: number;
  product_name: string;
  variant_name: string | null;
  licenses: {
    id: string;
    license_text: string;
  }[];
};

type FormattedOrder = {
  id: string;
  order_number: number | null;
  created_at: string;
  total: number;
  customer_email: string;
  customer_name: string | null;
  licenses: FormattedLicense[];
  items: FormattedItem[];
};

function formatMoney(value: number) {
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

function formatOrderNumber(value: number | null) {
  if (!value) return "-----";
  return String(value).padStart(5, "0");
}

function truncateLicense(value: string, max = 72) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export default function AdminOrdersClient() {
  const router = useRouter();

  const [orders, setOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(null);

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  async function checkAdminAndLoad() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile || profile.role !== "admin") {
        router.push("/");
        return;
      }

      await loadOrders();
    } catch (err) {
      console.error(err);
      setError("No se pudo validar el acceso al panel.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    setError("");

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, user_id, total, created_at")
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Error cargando orders:", ordersError);
      setError(ordersError.message || "No se pudieron cargar los pedidos.");
      return;
    }

    const rawOrders = (ordersData as OrderRow[]) || [];
    const orderIds = rawOrders.map((order) => order.id);
    const userIds = Array.from(
      new Set(rawOrders.map((order) => order.user_id).filter(Boolean))
    ) as string[];

    let itemsData: OrderItemRow[] = [];
    if (orderIds.length > 0) {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, unit_price, product_name, variant_name")
        .in("order_id", orderIds);

      if (error) {
        console.error("Error cargando order_items:", error);
      } else {
        itemsData = (data as OrderItemRow[]) || [];
      }
    }

    let profilesData: ProfileRow[] = [];
    if (userIds.length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (error) {
        console.error("Error cargando profiles:", error);
      } else {
        profilesData = (data as ProfileRow[]) || [];
      }
    }

    let licensesData: LicenseRow[] = [];
    if (orderIds.length > 0) {
      const { data, error } = await supabase
        .from("product_licenses")
        .select(
          "id, product_id, variant_id, license_text, status, assigned_order_id, assigned_order_item_id, assigned_user_id"
        )
        .in("assigned_order_id", orderIds);

      if (error) {
        console.error("Error cargando licencias:", error);
      } else {
        licensesData = (data as LicenseRow[]) || [];
      }
    }

    const profileMap = new Map<string, ProfileRow>();
    profilesData.forEach((profile) => {
      profileMap.set(profile.id, profile);
    });

    const formattedOrders: FormattedOrder[] = rawOrders.map((order) => {
      const customer = order.user_id ? profileMap.get(order.user_id) : null;
      const orderItems = itemsData.filter((item) => item.order_id === order.id);

      const orderLicenses: FormattedLicense[] = licensesData
        .filter((license) => license.assigned_order_id === order.id)
        .map((license) => {
          let matchedItem =
            orderItems.find((item) => item.id === license.assigned_order_item_id) ||
            orderItems.find((item) => item.product_id === license.product_id);

          return {
            id: license.id,
            license_text: license.license_text,
            product_name: matchedItem?.product_name || "Producto",
            variant_name: matchedItem?.variant_name || null,
          };
        });

      const formattedItems: FormattedItem[] = orderItems.map((item) => {
        const itemLicenses = licensesData.filter(
          (license) =>
            license.assigned_order_item_id === item.id ||
            (!license.assigned_order_item_id &&
              license.assigned_order_id === order.id &&
              license.product_id === item.product_id)
        );

        return {
          id: item.id,
          quantity: Number(item.quantity || 0),
          price: Number(item.unit_price || 0),
          product_name: item.product_name || "Producto",
          variant_name: item.variant_name || null,
          licenses: itemLicenses.map((license) => ({
            id: license.id,
            license_text: license.license_text,
          })),
        };
      });

      return {
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at || "",
        total: Number(order.total || 0),
        customer_email: customer?.email || "Sin correo",
        customer_name: customer?.full_name || null,
        licenses: orderLicenses,
        items: formattedItems,
      };
    });

    setOrders(formattedOrders);
  }

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return orders;

    return orders.filter((order) => {
      const email = (order.customer_email || "").toLowerCase();
      const licenseText = order.licenses
        .map(
          (license) =>
            `${license.license_text} ${license.product_name || ""} ${license.variant_name || ""}`.toLowerCase()
        )
        .join(" ");

      return email.includes(term) || licenseText.includes(term);
    });
  }, [orders, search]);

  return (
    <>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1a1a1a_0%,_#0b0b0b_45%,_#000000_100%)] text-white">
        <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                Administración
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
                Pedidos
              </h1>
              <p className="mt-2 text-white/60">
                Revisa compras, correos del cliente, licencias entregadas y comprobantes.
              </p>
            </div>

            <div className="w-full md:max-w-md">
              <label className="mb-2 block text-sm font-medium text-white/65">
                Buscar pedido
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por correo o licencias entregadas"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/20"
              />
            </div>
          </div>

          <div className="mb-5 flex justify-end">
            <button
              onClick={loadOrders}
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Recargar
            </button>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 shadow-sm backdrop-blur-xl">
            <div className="hidden grid-cols-5 gap-4 border-b border-white/10 px-6 py-4 text-sm font-semibold text-white/55 xl:grid">
              <span>Pedido</span>
              <span>Correo cliente</span>
              <span>Fecha compra</span>
              <span>Total</span>
              <span className="text-right">Comprobante</span>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-white/60">Cargando pedidos...</div>
            ) : error ? (
              <div className="px-6 py-10 text-red-300">{error}</div>
            ) : filteredOrders.length === 0 ? (
              <div className="px-6 py-10 text-white/60">
                No se encontraron pedidos con ese criterio.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="px-5 py-5 md:px-6">
                    <div className="grid gap-4 xl:grid-cols-5 xl:items-start">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40 xl:hidden">
                          Pedido
                        </p>
                        <p className="text-sm font-bold text-white">
                          #{formatOrderNumber(order.order_number)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40 xl:hidden">
                          Correo cliente
                        </p>
                        <p className="break-all text-sm font-medium text-white/85">
                          {order.customer_email}
                        </p>
                        {order.customer_name && (
                          <p className="mt-1 text-xs text-white/45">
                            {order.customer_name}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40 xl:hidden">
                          Fecha compra
                        </p>
                        <p className="text-sm text-white/75">
                          {formatDate(order.created_at)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40 xl:hidden">
                          Total
                        </p>
                        <p className="text-sm font-bold text-white">
                          {formatMoney(order.total)}
                        </p>

                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                            Licencias entregadas
                          </p>

                          {order.licenses.length === 0 ? (
                            <p className="text-sm text-white/45">Sin licencias</p>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-emerald-300">
                                {order.licenses.length} licencia
                                {order.licenses.length > 1 ? "s" : ""}
                              </p>

                              <div className="space-y-1">
                                {order.licenses.slice(0, 2).map((license) => (
                                  <div
                                    key={license.id}
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                                  >
                                    <p className="text-xs font-semibold text-white/65">
                                      {license.product_name}
                                      {license.variant_name ? ` - ${license.variant_name}` : ""}
                                    </p>
                                    <p className="mt-1 break-all text-xs text-white/80">
                                      {truncateLicense(license.license_text)}
                                    </p>
                                  </div>
                                ))}

                                {order.licenses.length > 2 && (
                                  <p className="text-xs text-white/45">
                                    +{order.licenses.length - 2} más
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start justify-start xl:justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                          Ver comprobante
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedOrder(null)}
          />

          <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0c0c] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-6">
              <div>
                <h3 className="text-xl font-black md:text-2xl">
                  Comprobante del pedido
                </h3>
                <p className="mt-1 text-sm text-white/50">
                  Pedido #{formatOrderNumber(selectedOrder.order_number)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[85vh] overflow-y-auto p-4 md:p-6">
              <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Número pedido
                  </p>
                  <p className="mt-3 text-lg font-bold text-white">
                    #{formatOrderNumber(selectedOrder.order_number)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2 xl:col-span-1">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Cliente
                  </p>
                  <p className="mt-3 break-all text-sm font-medium text-white">
                    {selectedOrder.customer_email}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Fecha
                  </p>
                  <p className="mt-3 text-sm text-white">
                    {formatDate(selectedOrder.created_at)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Total
                  </p>
                  <p className="mt-3 text-lg font-bold text-emerald-300">
                    {formatMoney(selectedOrder.total)}
                  </p>
                </div>
              </section>

              <section className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <h4 className="text-lg font-bold text-white">Servicios comprados</h4>

                {selectedOrder.items.length === 0 ? (
                  <p className="mt-4 text-sm text-white/55">
                    Este pedido no tiene items asociados.
                  </p>
                ) : (
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
                          </div>

                          <div className="text-left md:text-right">
                            <p className="text-sm text-white/55">
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
                )}
              </section>

              <section className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <h4 className="text-lg font-bold text-white">Licencias entregadas</h4>

                {selectedOrder.licenses.length === 0 ? (
                  <p className="mt-4 text-sm text-white/55">
                    Este pedido todavía no tiene licencias asociadas.
                  </p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {selectedOrder.licenses.map((license) => (
                      <div
                        key={license.id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <p className="text-base font-bold text-white">
                          {license.product_name}
                          {license.variant_name ? ` - ${license.variant_name}` : ""}
                        </p>

                        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                            Licencia
                          </p>
                          <p className="mt-3 break-all text-sm leading-6 text-white/85">
                            {license.license_text}
                          </p>
                        </div>
                      </div>
                    ))}
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