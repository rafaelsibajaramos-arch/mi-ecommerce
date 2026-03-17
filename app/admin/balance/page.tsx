"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function AdminBalancePage() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [actionType, setActionType] = useState<"add" | "subtract">("add");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!email || !amount) {
      setMessage("Completa el correo y el monto.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const numericAmount = Number(amount);

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setMessage("El monto debe ser mayor que 0.");
      return;
    }

    setSaving(true);

    try {
      const { data: user, error: userError } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", cleanEmail)
        .single();

      if (userError || !user) {
        setMessage("Usuario no encontrado.");
        return;
      }

      let newBalance = Number(user.balance || 0);

      if (actionType === "add") {
        newBalance += numericAmount;
      } else {
        if (newBalance < numericAmount) {
          setMessage("El usuario no tiene saldo suficiente.");
          return;
        }

        newBalance -= numericAmount;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user.id);

      if (updateError) {
        setMessage("Error actualizando saldo: " + updateError.message);
        return;
      }

      const transactionType = actionType === "add" ? "credit" : "debit";

      const { error: transactionError } = await supabase
        .from("wallet_transactions")
        .insert([
          {
            user_id: user.id,
            amount: numericAmount,
            type: transactionType,
          },
        ]);

      if (transactionError) {
        setMessage(
          "Se actualizó el saldo, pero no se guardó el movimiento: " +
            transactionError.message
        );
        return;
      }

      if (actionType === "add") {
        setMessage(
          `Crédito realizado correctamente: se agregaron $${numericAmount} a ${cleanEmail}.`
        );
      } else {
        setMessage(
          `Débito realizado correctamente: se descontaron $${numericAmount} a ${cleanEmail}.`
        );
      }

      setEmail("");
      setAmount("");
      setActionType("add");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
          Saldo
        </p>

        <h1 className="text-4xl font-extrabold text-gray-900 mt-2">
          Gestión de saldo
        </h1>

        <p className="text-gray-600 mt-3">
          Agrega o descuenta saldo a los usuarios usando su correo electrónico.
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
          {message}
        </div>
      )}

      <div className="bg-white rounded-3xl border p-6 shadow-sm max-w-xl">
        <h2 className="text-2xl font-bold text-gray-900">
          Nuevo movimiento
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Correo del usuario
            </label>

            <input
              type="email"
              placeholder="usuario@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tipo de movimiento
            </label>

            <select
              value={actionType}
              onChange={(e) =>
                setActionType(e.target.value as "add" | "subtract")
              }
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            >
              <option value="add">Agregar saldo</option>
              <option value="subtract">Descontar saldo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Monto
            </label>

            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="40000"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-[#050816] py-3 text-white font-semibold disabled:opacity-70"
          >
            {saving ? "Guardando..." : "Guardar movimiento"}
          </button>
        </form>
      </div>
    </div>
  );
}