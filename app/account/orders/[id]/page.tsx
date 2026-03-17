"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", params.id)
        .single();

      const { data: itemsData } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", params.id);

      setOrder(orderData);
      setItems(itemsData || []);
      setLoading(false);
    };

    fetchOrder();
  }, [params.id]);

  if (loading) return <p className="p-10 text-white">Cargando...</p>;
  if (!order) return <p className="p-10 text-white">Pedido no encontrado</p>;

  return (
    <main className="min-h-screen text-white px-5 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-2">
        Pedido #{order.id}
      </h1>

      <p className="text-white/50 mb-6">
        {new Date(order.created_at).toLocaleString()}
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
        <p className="text-sm text-white/50">Total</p>
        <p className="text-2xl font-bold text-blue-400">
          ${Number(order.total).toLocaleString()}
        </p>
      </div>

      {/* Productos */}
      <div className="space-y-4 mb-8">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <p className="font-semibold">{item.product_name}</p>
            <p className="text-sm text-white/50">
              x{item.quantity} — $
              {Number(item.unit_price * item.quantity).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Licencias */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-bold mb-4">🔑 Accesos entregados</h2>

        {items.map((item) => (
          <div key={item.id} className="mb-4">
            <p className="font-semibold">{item.product_name}</p>

            {/* Aquí luego conectamos las licencias reales */}
            <div className="mt-2 text-sm text-white/70">
              <p>correo@email.com</p>
              <p>********</p>
            </div>

            <button className="mt-2 text-xs text-blue-400 hover:underline">
              Copiar
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}