import { createClient } from "@/lib/supabase/server";
import AdminOrdersClient from "./AdminOrdersClient";

export default async function AdminOrdersPage() {
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      created_at,
      total_amount,
      status,
      user_id
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          Error cargando pedidos: {error.message}
        </div>
      </main>
    );
  }

  const orderIds = (orders || []).map((o) => o.id);

  let licensesMap: Record<string, any[]> = {};

  if (orderIds.length > 0) {
    const { data: licenses } = await supabase
      .from("order_licenses")
      .select(`
        id,
        order_id,
        product_name,
        delivered_email,
        delivered_username,
        delivered_password,
        delivered_access_url,
        delivered_note,
        created_at
      `)
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    licensesMap =
      licenses?.reduce((acc: Record<string, any[]>, item: any) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
      }, {}) || {};
  }

  const formattedOrders =
    orders?.map((order) => ({
      ...order,
      licenses: licensesMap[order.id] || [],
    })) || [];

  return <AdminOrdersClient orders={formattedOrders} />;
}