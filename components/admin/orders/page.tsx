import { createClient } from "@/lib/supabase/server";
import AdminOrdersClient from "./AdminOrdersClient";

type OrderRow = {
  id: string;
  order_number: number | null;
  created_at: string;
  total: number | null;
  status: string | null;
  user_id: string | null;
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

export default async function OrdersPageContent() {
  const supabase = await createClient();

  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("id, order_number, created_at, total, status, user_id")
    .order("created_at", { ascending: false });

  if (ordersError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        Error cargando pedidos: {ordersError.message}
      </div>
    );
  }

  const rawOrders = (ordersData as OrderRow[]) || [];

  if (rawOrders.length === 0) {
    return <AdminOrdersClient orders={[]} />;
  }

  const orderIds = rawOrders.map((order) => order.id);
  const userIds = Array.from(
    new Set(rawOrders.map((order) => order.user_id).filter(Boolean))
  ) as string[];

  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select(
      "id, order_id, product_id, quantity, unit_price, product_name, variant_name"
    )
    .in("order_id", orderIds);

  if (itemsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        Error cargando productos del pedido: {itemsError.message}
      </div>
    );
  }

  let profilesMap = new Map<string, ProfileRow>();

  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    ((profilesData as ProfileRow[]) || []).forEach((profile) => {
      profilesMap.set(profile.id, profile);
    });
  }

  const { data: licensesData, error: licensesError } = await supabase
    .from("product_licenses")
    .select(
      "id, product_id, variant_id, license_text, status, assigned_order_id, assigned_order_item_id, assigned_user_id"
    )
    .in("assigned_order_id", orderIds)
    .eq("status", "assigned");

  if (licensesError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        Error cargando licencias: {licensesError.message}
      </div>
    );
  }

  const rawItems = (itemsData as OrderItemRow[]) || [];
  const rawLicenses = (licensesData as LicenseRow[]) || [];

  const formattedOrders = rawOrders.map((order) => {
    const profile = order.user_id ? profilesMap.get(order.user_id) : null;

    const items = rawItems
      .filter((item) => item.order_id === order.id)
      .map((item) => {
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
          product_name: item.product_name || "Producto",
          variant_name: item.variant_name || null,
          licenses: itemLicenses.map((license) => ({
            id: license.id,
            license_text: license.license_text,
          })),
        };
      });

    const orderLicenses = items.flatMap((item) =>
      item.licenses.map((license) => ({
        ...license,
        product_name: item.product_name,
        variant_name: item.variant_name,
      }))
    );

    return {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      total: Number(order.total || 0),
      status: order.status || "pending",
      user_id: order.user_id,
      customer_email: profile?.email || "Sin correo",
      customer_name: profile?.full_name || null,
      items,
      licenses: orderLicenses,
    };
  });

  return <AdminOrdersClient orders={formattedOrders} />;
}