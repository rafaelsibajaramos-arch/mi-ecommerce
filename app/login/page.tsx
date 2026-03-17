"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setMessage("No se pudo iniciar sesión.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      setMessage("No se pudo cargar el perfil: " + profileError.message);
      setLoading(false);
      return;
    }

    if (profile.role === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }

    router.refresh();
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setMessage("");

    if (!email) {
      setMessage("Escribe tu correo electrónico para recuperar tu contraseña.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/reset-password",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Te enviamos un enlace para restablecer tu contraseña.");
  };

  return (
    <main className="relative min-h-screen bg-black flex items-center justify-center px-6 py-10 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:40px_40px]" />

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-white">
        <div className="hidden lg:flex relative bg-black text-white p-12 flex-col justify-between overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_40%)]" />
          <div className="pointer-events-none absolute -top-20 -left-20 w-96 h-96 bg-white/5 blur-3xl rounded-full" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 w-96 h-96 bg-white/5 blur-3xl rounded-full" />

          <div className="relative z-10">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4">
              StreamingMayor
            </p>

            <h1 className="text-5xl font-extrabold leading-tight">
              Accede a tu
              <br />
              cuenta
            </h1>

            <p className="text-white/70 mt-6 text-lg max-w-md leading-8">
              Administra tus compras, consulta tus licencias y accede a una
              experiencia digital moderna y automatizada.
            </p>
          </div>

          <div className="relative z-10">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.2em] text-white/50 mb-3">
                Plataforma
              </p>
              <h2 className="text-2xl font-bold">Servicios digitales premium</h2>
              <p className="text-white/70 mt-3 leading-7">
                Compra, recibe saldo, administra pedidos y obtén tus accesos
                desde un solo lugar.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white px-6 py-8 md:px-10 md:py-4 flex items-center">
          <div className="w-full max-w-md mx-auto">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-2">
              Bienvenido
            </p>

            <h2 className="text-4xl font-extrabold text-gray-900">
              Iniciar sesión
            </h2>

            <p className="text-gray-500 mt-3">
              Ingresa a tu cuenta para continuar.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleLogin}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Correo electrónico
                </label>

                <input
                  type="email"
                  placeholder="tucorreo@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Contraseña
                  </label>

                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <input
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#050816] py-4 text-white font-semibold hover:opacity-95 transition disabled:opacity-50"
              >
                {loading ? "Entrando..." : "Iniciar sesión"}
              </button>
            </form>

            {message && (
              <p className="text-sm mt-4 text-center text-red-500">
                {message}
              </p>
            )}

            <p className="text-sm text-gray-500 mt-8 text-center">
              ¿No tienes cuenta?{" "}
              <Link
                href="/register"
                className="text-blue-600 font-semibold hover:underline"
              >
                Regístrate
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}