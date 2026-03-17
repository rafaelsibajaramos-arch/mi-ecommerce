"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    let user = data.user;

    if (!data.session) {
      const { data: loginData, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError) {
        setMessage("Cuenta creada, pero no se pudo iniciar sesión automáticamente.");
        setLoading(false);
        return;
      }

      user = loginData.user;
    }

    if (!user) {
      setMessage("Cuenta creada, pero no se pudo obtener el usuario.");
      setLoading(false);
      return;
    }

    let profile = null;

    for (let i = 0; i < 5; i++) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileData) {
        profile = profileData;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (profile?.role === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }

    router.refresh();
    setLoading(false);
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
              Crea tu
              <br />
              cuenta
            </h1>

            <p className="text-white/70 mt-6 text-lg max-w-md leading-8">
              Regístrate para comprar con saldo, consultar licencias y llevar el
              control de tus pedidos.
            </p>
          </div>

          <div className="relative z-10">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.2em] text-white/50 mb-3">
                Acceso seguro
              </p>
              <h2 className="text-2xl font-bold">Tu cuenta en un solo lugar</h2>
              <p className="text-white/70 mt-3 leading-7">
                Accede a compras, historial, saldo disponible y soporte
                personalizado desde tu panel.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white px-6 py-8 md:px-10 md:py-4 flex items-center">
          <div className="w-full max-w-md mx-auto">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-2">
              Registro
            </p>

            <h2 className="text-4xl font-extrabold text-gray-900">
              Crear cuenta
            </h2>

            <p className="text-gray-500 mt-3">
              Completa tus datos para comenzar.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleRegister}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nombre completo
                </label>
                <input
                  type="text"
                  placeholder="Tu nombre"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contraseña
                </label>
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
                {loading ? "Creando cuenta..." : "Crear cuenta"}
              </button>
            </form>

            {message && (
              <p className="text-sm mt-4 text-center text-gray-600">{message}</p>
            )}

            <p className="text-sm text-gray-500 mt-8 text-center">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/login"
                className="text-blue-600 font-semibold hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}