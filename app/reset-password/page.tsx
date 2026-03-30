"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

function getSafeMessage(message: string) {
  const normalized = (message || "").toLowerCase();

  if (
    normalized.includes("pkce code verifier not found in storage") ||
    normalized.includes("code verifier") ||
    normalized.includes("@supabase/ssr")
  ) {
    return "";
  }

  return message;
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!password || !confirmPassword) {
      setMessage("Completa ambos campos.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      const safeMessage = getSafeMessage(error.message);

      if (safeMessage) {
        setMessage(safeMessage);
      } else {
        setMessage("");
      }

      setLoading(false);
      return;
    }

    setMessage("Contraseña actualizada correctamente. Ahora puedes iniciar sesión.");
    setLoading(false);

    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 1500);
  };

  const visibleMessage = getSafeMessage(message);

  return (
    <main className="min-h-screen bg-[#060b18] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-white p-8 md:p-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-2">
          Recuperación
        </p>

        <h1 className="text-4xl font-extrabold text-gray-900">
          Restablecer contraseña
        </h1>

        <p className="text-gray-500 mt-3">
          Escribe tu nueva contraseña para recuperar el acceso a tu cuenta.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleUpdatePassword}>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nueva contraseña
            </label>
            <input
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 caret-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Confirmar contraseña
            </label>
            <input
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 caret-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#050816] py-4 text-white font-semibold hover:opacity-95 transition disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Guardar nueva contraseña"}
          </button>
        </form>

        {visibleMessage && (
          <p className="text-sm mt-4 text-center text-gray-600">
            {visibleMessage}
          </p>
        )}
      </div>
    </main>
  );
}