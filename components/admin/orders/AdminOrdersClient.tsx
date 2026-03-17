"use client";

import { useState } from "react";
import OrderDetailsModal from "@/components/admin/OrderDetailsModal";
import DashboardSidebar from "@/components/DashboardSidebar";

type LicenseItem = {
  id: string;
  product_name: string | null;
  delivered_email: string | null;
  delivered_username: string | null;
  delivered_password: string | null;
  delivered_access_url: string | null;
  delivered_note: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  created_at: string;
  total_amount: number | null;
  status: string | null;
  user_id: string | null;
  licenses: LicenseItem[];
};

export default function AdminOrdersClient({
  orders,
}: {
  orders: OrderItem[];
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);

  return (
    <main className="flex min-h-screen bg-gradient-to-b from-[#111111] via-[#090909] to-[#000000] text-white">
      <DashboardSidebar />

      <section className="flex-1 p-8 md:p-10">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">
            Administración
          </p>
          <h1 className="mt-2 text-4xl font-extrabold">Pedidos</h1>
          <p className="mt-2 text-white/60">
            Aquí puedes revisar los pedidos y las licencias entregadas.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="grid grid-cols-5 gap-4 border-b border-white/10 bg-white/5 px-6 py-4 text-sm font-semibold text-white/70">
            <span>ID</span>
            <span>Fecha</span>
            <span>Total</span>
            <span>Estado</span>
            <span className="text-right">Acción</span>
          </div>

          {orders.length === 0 ? (
            <div className="px-6 py-8 text-white/60">
              Todavía no hay pedidos registrados.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-5 gap-4 px-6 py-5 text-sm items-center"
                >
                  <span className="truncate">{order.id.slice(0, 8)}...</span>
                  <span>
                    {new Date(order.created_at).toLocaleDateString("es-CO")}
                  </span>
                  <span>${Number(order.total_amount || 0).toLocaleString("es-CO")}</span>
                  <span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                      {order.status || "pendiente"}
                    </span>
                  </span>
                  <div className="text-right">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="rounded-full border border-white/15 px-4 py-2 font-medium text-white transition hover:bg-white hover:text-black"
                    >
                      Detalles
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <OrderDetailsModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          orderId={selectedOrder?.id || ""}
          licenses={selectedOrder?.licenses || []}
        />
      </section>
    </main>
  );
}