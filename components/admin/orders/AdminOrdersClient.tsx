"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  variant_id: string | null;
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

type CatalogProductRow = {
  id: string;
  name: string | null;
};

type CatalogVariantRow = {
  id: string;
  product_id: string;
  name: string | null;
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

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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

export default function AdminOrdersClient() {
  const router = useRouter();
  const sectionTopRef = useRef<HTMLElement | null>(null);

  const [orders, setOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [catalogSuggestions, setCatalogSuggestions] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  function handlePageChange(page: number) {
    setCurrentPage(page);
    sectionTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
        .select(
          "id, order_id, product_id, variant_id, quantity, unit_price, product_name, variant_name"
        )
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

    const [{ data: catalogProducts }, { data: catalogVariants }] = await Promise.all([
      supabase.from("products").select("id, name").order("name"),
      supabase.from("product_variants").select("id, product_id, name").order("name"),
    ]);
    const productNameMap = new Map<string, string>();
    const variantNameMap = new Map<string, string>();

    ((catalogProducts || []) as CatalogProductRow[]).forEach((product) => {
      if (product.name) productNameMap.set(product.id, product.name);
    });
    ((catalogVariants || []) as CatalogVariantRow[]).forEach((variant) => {
      if (variant.name) variantNameMap.set(variant.id, variant.name);
    });

    setCatalogSuggestions([
      ...Array.from(productNameMap.values()),
      ...((catalogVariants || []) as CatalogVariantRow[]).flatMap((variant) => {
        const productName = productNameMap.get(variant.product_id);
        return productName && variant.name ? [`${productName} - ${variant.name}`] : [];
      }),
    ]);

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
          const matchedItem =
            orderItems.find((item) => item.id === license.assigned_order_item_id) ||
            orderItems.find(
              (item) =>
                item.product_id === license.product_id &&
                item.variant_id === license.variant_id
            ) ||
            orderItems.find(
              (item) => item.product_id === license.product_id && !license.variant_id
            );

          return {
            id: license.id,
            license_text: license.license_text,
            product_name:
              matchedItem?.product_name ||
              productNameMap.get(license.product_id || "") ||
              "Producto",
            variant_name:
              matchedItem?.variant_name ||
              variantNameMap.get(license.variant_id || "") ||
              null,
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
          product_name: item.product_name || productNameMap.get(item.product_id || "") || "Producto",
          variant_name:
            item.variant_name || variantNameMap.get(item.variant_id || "") || null,
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
    setCurrentPage(1);
  }

  const filteredOrders = useMemo(() => {
    const term = normalizeSearchText(search);

    if (!term) return orders;
    const searchTerms = term.split(/\s+/).filter(Boolean);

    return orders.filter((order) => {
      const idText = (order.id || "").toLowerCase();
      const numberText = String(order.order_number || "").toLowerCase();
      const emailText = (order.customer_email || "").toLowerCase();
      const licensesText = order.licenses
        .map(
          (license) =>
            `${license.license_text} ${license.product_name || ""} ${license.variant_name || ""
              }`.toLowerCase()
        )
        .join(" ");
      const itemsText = order.items
        .map(
          (item) =>
            `${item.product_name} ${item.variant_name || ""} ${item.licenses
              .map((license) => license.license_text)
              .join(" ")}`.toLowerCase()
        )
        .join(" ");

      const searchableText = normalizeSearchText(
        [idText, numberText, emailText, licensesText, itemsText].join(" ")
      );

      return (
        idText.includes(term) ||
        numberText.includes(term) ||
        emailText.includes(term) ||
        licensesText.includes(term) ||
        itemsText.includes(term) ||
        searchTerms.every((searchTerm) => searchableText.includes(searchTerm))
      );
    });
  }, [orders, search]);

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

  const pageStart = filteredOrders.length === 0 ? 0 : (effectiveCurrentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(effectiveCurrentPage * PAGE_SIZE, filteredOrders.length);

  const searchSuggestions = useMemo(() => {
    const values = new Set<string>(catalogSuggestions);

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const itemName = [item.product_name, item.variant_name].filter(Boolean).join(" - ");
        if (itemName) values.add(itemName);
      });

      order.licenses.forEach((license) => {
        const licenseName = [license.product_name, license.variant_name]
          .filter(Boolean)
          .join(" - ");
        if (licenseName) values.add(licenseName);
        if (license.license_text) values.add(license.license_text);
      });
    });

    const term = normalizeSearchText(search);
    if (!term) return [];

    return Array.from(values)
      .filter((value) => normalizeSearchText(value).includes(term))
      .sort((first, second) => first.localeCompare(second, "es"))
      .slice(0, 8);
  }, [catalogSuggestions, orders, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAdminAndLoad();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const totalRevenue = useMemo(() => {
    return orders.reduce((acc, order) => acc + Number(order.total || 0), 0);
  }, [orders]);

  const totalLicenses = useMemo(() => {
    return orders.reduce((acc, order) => acc + order.licenses.length, 0);
  }, [orders]);

  return (
    <>
      <section ref={sectionTopRef} className="space-y-6 text-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Administración
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Pedidos
            </h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Revisa compras, correos del cliente, licencias entregadas y comprobantes.
            </p>
          </div>

          <div className="relative w-full lg:max-w-md">
            <label className="mb-2 block text-sm font-medium text-slate-600">
              Buscar pedido
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Buscar por ID, número, correo o licencia"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
            {searchFocused && searchSuggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Sugerencias
                </p>
                {searchSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setSearch(suggestion);
                      setCurrentPage(1);
                      setSearchFocused(false);
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pedidos
            </p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900">
              {orders.length}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Facturación
            </p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900">
              {formatMoney(totalRevenue)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Licencias entregadas
            </p>
            <p className="mt-3 text-3xl font-extrabold text-slate-900">
              {totalLicenses}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[0.9fr_1.2fr_1fr_0.9fr_0.9fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-500 lg:grid">
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Fecha</span>
            <span>Total</span>
            <span className="text-right">Acción</span>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-slate-500">Cargando pedidos...</div>
          ) : error ? (
            <div className="px-6 py-10 text-red-600">{error}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="px-6 py-10 text-slate-500">
              No se encontraron pedidos con ese criterio.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {paginatedOrders.map((order) => (
                <div key={order.id} className="px-5 py-5 md:px-6">
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr_1fr_0.9fr_0.9fr] lg:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                        Pedido
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        #{formatOrderNumber(order.order_number)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                        Cliente
                      </p>
                      <p className="break-all text-sm font-medium text-slate-800">
                        {order.customer_email}
                      </p>
                      {order.customer_name && (
                        <p className="mt-1 text-xs text-slate-500">
                          {order.customer_name}
                        </p>
                      )}

                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Licencias
                        </p>
                        {order.licenses.length === 0 ? (
                          <p className="text-sm text-slate-500">Sin licencias</p>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-emerald-600">
                              {order.licenses.length} licencia
                              {order.licenses.length > 1 ? "s" : ""}
                            </p>

                            {order.licenses.map((license) => (
                              <div
                                key={license.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                              >
                                <p className="text-xs font-semibold text-slate-700">
                                  {license.product_name}
                                  {license.variant_name
                                    ? ` - ${license.variant_name}`
                                    : ""}
                                </p>
                                <p className="mt-1 break-all text-xs text-slate-600">
                                  {truncateLicense(license.license_text)}
                                </p>
                              </div>
                            ))}

                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                        Fecha
                      </p>
                      <p className="text-sm text-slate-700">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                        Total
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatMoney(order.total)}
                      </p>
                    </div>

                    <div className="flex items-start justify-start lg:justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
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

        {!loading && !error && filteredOrders.length > 0 && (
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
                  onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                  disabled={currentPage === 1}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ‹
                </button>

                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handlePageChange(item)}
                      className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${currentPage === item
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
                    handlePageChange(Math.min(currentPage + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedOrder(null)}
          />

          <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 md:px-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 md:text-2xl">
                  Comprobante del pedido
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Pedido #{formatOrderNumber(selectedOrder.order_number)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[85vh] overflow-y-auto p-4 md:p-6">
              <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Número pedido
                  </p>
                  <p className="mt-3 text-lg font-bold text-slate-900">
                    #{formatOrderNumber(selectedOrder.order_number)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-1">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Cliente
                  </p>
                  <p className="mt-3 break-all text-sm font-medium text-slate-900">
                    {selectedOrder.customer_email}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Fecha
                  </p>
                  <p className="mt-3 text-sm text-slate-900">
                    {formatDate(selectedOrder.created_at)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Total
                  </p>
                  <p className="mt-3 text-lg font-bold text-emerald-600">
                    {formatMoney(selectedOrder.total)}
                  </p>
                </div>
              </section>

              <section className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-lg font-bold text-slate-900">Servicios comprados</h4>

                {selectedOrder.items.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Este pedido no tiene items asociados.
                  </p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {selectedOrder.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-base font-bold text-slate-900">
                              {item.product_name}
                              {item.variant_name ? ` - ${item.variant_name}` : ""}
                            </p>
                          </div>

                          <div className="text-left md:text-right">
                            <p className="text-sm text-slate-500">
                              Cantidad: {item.quantity}
                            </p>
                            <p className="mt-1 text-base font-bold text-emerald-600">
                              {formatMoney(item.price * item.quantity)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <h4 className="text-lg font-bold text-slate-900">Licencias entregadas</h4>

                {selectedOrder.licenses.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Este pedido todavía no tiene licencias asociadas.
                  </p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {selectedOrder.licenses.map((license) => (
                      <div
                        key={license.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <p className="text-base font-bold text-slate-900">
                          {license.product_name}
                          {license.variant_name ? ` - ${license.variant_name}` : ""}
                        </p>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                            Licencia
                          </p>
                          <p className="mt-3 break-all text-sm leading-6 text-slate-700">
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