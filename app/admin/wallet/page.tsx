"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import DashboardSidebar from "../../../components/DashboardSidebar";

export default function AdminWalletPage() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .single();

    if (profileError || !profile) {
      setMessage("Usuario no encontrado.");
      setLoading(false);
      return;
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", profile.id)
      .single();

    if (walletError || !wallet) {
      setMessage("Wallet no encontrada.");
      setLoading(false);
      return;
    }

    const newBalance = Number(wallet.balance) + Number(amount);

    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", profile.id);

    if (updateError) {
      setMessage("No se pudo actualizar el saldo.");
      setLoading(false);
      return;
    }

    const { error: txError } = await supabase.from("wallet_transactions").insert({
      user_id: profile.id,
      type: "deposit",
      amount: Number(amount),
      note: note || "Recarga manual por administrador",
    });

    if (txError) {
      setMessage("Saldo actualizado, pero falló el registro del movimiento.");
      setLoading(false);
      return;
    }

    setMessage("Saldo cargado correctamente.");
    setEmail("");
    setAmount("");
    setNote("");
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen bg-[#f4f6fb]">
      <DashboardSidebar />

      <section className="flex-1 p-10">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Admin Wallet
          </p>
          <h1 className="text-4xl font-extrabold mt-2">
            Cargar saldo manualmente
          </h1>
          <p className="text-gray-600 mt-3">
            Busca un usuario y acredita saldo a su wallet.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
          <div className="bg-white rounded-3xl border border-black/5 p-8">
            <h2 className="text-2xl font-extrabold mb-6">Recarga manual</h2>

            <form className="space-y-5" onSubmit={handleRecharge}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Correo del cliente
                </label>
                <input
                  type="email"
                  placeholder="cliente@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Monto a cargar
                </label>
                <input
                  type="number"
                  placeholder="50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nota
                </label>
                <textarea
                  rows={4}
                  placeholder="Pago validado por WhatsApp"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#050816] py-4 text-white font-semibold hover:opacity-95 transition disabled:opacity-50"
              >
                {loading ? "Cargando..." : "Cargar saldo"}
              </button>
            </form>

            {message && (
              <p className="mt-4 text-sm text-gray-600">{message}</p>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-black/5 p-8">
            <h3 className="text-2xl font-extrabold mb-4">Historial reciente</h3>
            <p className="text-gray-500">
              Aquí verás las últimas recargas realizadas por el administrador.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}