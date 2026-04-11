"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

type OrderDetailRow = {
  id: string;
  order_number: number | null;
  total: number | null;
  status: string | null;
  created_at: string;
  user_id: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
};

type LicenseRow = {
  id: string;
  product_id: string;
  license_text: string;
  assigned_order_item_id: string | null;
};

type OrderItemWithLicenses = OrderItemRow & {
  licenses: LicenseRow[];
};

// Pantalla de detalle de un pedido con productos entregados y licencias copiables.
export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id || "");

  const [order, setOrder] = useState<OrderDetailRow | null>(null);
  const [items, setItems] = useState<OrderItemWithLicenses[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    let mounted = true;

    // Carga el pedido solicitado, sus productos y las licencias entregadas.
    const fetchOrder = async () => {
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

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id, order_number, total, status, created_at, user_id")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (orderError) {
        setMessage("No se pudo cargar el pedido.");
        setLoading(false);
        return;
      }

      if (!orderData) {
        setOrder(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const safeOrder = orderData as OrderDetailRow;

      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, product_name, quantity, unit_price")
        .eq("order_id", safeOrder.id)
        .order("created_at", { ascending: true });

      if (!mounted) return;

      if (itemsError) {
        setMessage("No se pudieron cargar los productos del pedido.");
        setLoading(false);
        return;
      }

      const rawItems = ((itemsData as OrderItemRow[] | null) || []).map((item) => ({
        ...item,
        licenses: [],
      }));

      const { data: licensesData, error: licensesError } = await supabase
        .from("product_licenses")
        .select("id, product_id, license_text, assigned_order_item_id")
        .eq("assigned_order_id", safeOrder.id)
        .eq("assigned_user_id", user.id)
        .eq("status", "assigned")
        .order("created_at", { ascending: true });

      if (!mounted) return;

      if (licensesError) {
        setMessage("No se pudieron cargar las licencias del pedido.");
        setLoading(false);
        return;
      }

      const rawLicenses = (licensesData as LicenseRow[] | null) || [];

      const mergedItems = rawItems.map((item) => ({
        ...item,
        licenses: rawLicenses.filter((license) => {
          if (license.assigned_order_item_id) {
            return license.assigned_order_item_id === item.id;
          }

          return license.product_id === item.product_id;
        }),
      }));

      setOrder(safeOrder);
      setItems(mergedItems);
      setLoading(false);
    };

    void fetchOrder();

    return () => {
      mounted = false;
    };
  }, [orderId, router]);

  const totalLicenses = useMemo(() => {
    return items.reduce((sum, item) => sum + item.licenses.length, 0);
  }, [items]);

  // Formatea un valor numérico como dinero para mostrarlo en la interfaz.
  const formatMoney = (value: number | null | undefined) => {
    return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
  };

  // Convierte una fecha técnica en un texto legible para la interfaz.
  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleString("es-CO", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Sin fecha";
    }
  };

  // Formatea el número de pedido con longitud fija para mostrarlo mejor.
  const formatOrderNumber = (value: number | null) => {
    if (!value) return "-----";
    return String(value).padStart(5, "0");
  };

  // Copia una licencia individual al portapapeles.
  const copyLicense = async (licenseText: string, licenseId: string) => {
    try {
      await navigator.clipboard.writeText(licenseText);
      setCopiedLicenseId(licenseId);
      window.setTimeout(() => {
        setCopiedLicenseId((current) => (current === licenseId ? null : current));
      }, 1800);
    } catch {
      setCopiedLicenseId(null);
    }
  };

  if (loading) {
    return <p className="p-10 text-white">Cargando...</p>;
  }

  if (!order) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-white">
        <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
          Pedido no encontrado.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-white/45">
            Pedido
          </p>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">
            Comprobante #{formatOrderNumber(order.order_number)}
          </h1>
          <p className="mt-2 text-white/50">{formatDate(order.created_at)}</p>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/70">
            Total pagado
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">
            {formatMoney(order.total)}
          </p>
        </div>
      </div>

      {message && (
        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
          {message}
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">
            Estado
          </p>
          <p className="mt-3 text-lg font-bold text-white">
            {order.status || "Completado"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">
            Servicios
          </p>
          <p className="mt-3 text-lg font-bold text-white">{items.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">
            Licencias entregadas
          </p>
          <p className="mt-3 text-lg font-bold text-white">{totalLicenses}</p>
        </div>
      </div>

      <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-bold">Servicios incluidos</h2>

        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-white">
                    {item.product_name || "Producto"}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    Cantidad: {Number(item.quantity || 0)}
                  </p>
                </div>

                <p className="text-lg font-bold text-emerald-300">
                  {formatMoney(Number(item.unit_price || 0) * Number(item.quantity || 0))}
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-sm font-semibold text-white">Accesos entregados</p>

                {item.licenses.length === 0 ? (
                  <p className="mt-3 text-sm text-white/50">Sin licencias registradas.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {item.licenses.map((license) => (
                      <div
                        key={license.id}
                        className="rounded-xl border border-white/10 bg-black/35 p-3"
                      >
                        <div className="break-all rounded-xl bg-black/50 p-3 text-sm text-white/85">
                          {license.license_text}
                        </div>

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              copyLicense(license.license_text, license.id)
                            }
                            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                          >
                            {copiedLicenseId === license.id ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
