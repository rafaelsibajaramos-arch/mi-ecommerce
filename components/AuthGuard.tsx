"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type AuthMode = "login" | "register";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setIsLoggedIn(!!session?.user);
      setCheckingAuth(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
      setCheckingAuth(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (checkingAuth) return;

    if (!isLoggedIn) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [checkingAuth, isLoggedIn]);

  const isAuthBlocked = useMemo(() => {
    if (checkingAuth) return true;
    if (isLoggedIn) return false;

    const allowedPaths = ["/", "/login", "/register"];
    return allowedPaths.includes(pathname);
  }, [checkingAuth, isLoggedIn, pathname]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (error) {
      setLoginMessage(error.message);
      setLoginLoading(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setLoginMessage("No se pudo iniciar sesión.");
      setLoginLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setLoginLoading(false);

    if (profile?.role === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }

    router.refresh();
  };

  const handleForgotPassword = async () => {
    setLoginMessage("");

    if (!loginEmail.trim()) {
      setLoginMessage("Escribe tu correo electrónico para recuperar tu contraseña.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      loginEmail.trim(),
      {
        redirectTo: "https://streamingmayor1.com/reset-password",
      }
    );

    if (error) {
      setLoginMessage(error.message);
      return;
    }

    setLoginMessage("Te enviamos un enlace para restablecer tu contraseña.");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    setRegisterMessage("");

    const cleanName = registerFullName.trim();
    const cleanEmail = registerEmail.trim();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: registerPassword,
      options: {
        data: {
          full_name: cleanName,
        },
      },
    });

    if (error) {
      setRegisterMessage(error.message);
      setRegisterLoading(false);
      return;
    }

    let user = data.user;

    if (!data.session) {
      const { data: loginData, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: registerPassword,
        });

      if (loginError) {
        setRegisterMessage(
          "Cuenta creada, pero no se pudo iniciar sesión automáticamente."
        );
        setRegisterLoading(false);
        return;
      }

      user = loginData.user;
    }

    if (!user) {
      setRegisterMessage("Cuenta creada, pero no se pudo obtener el usuario.");
      setRegisterLoading(false);
      return;
    }

    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: cleanEmail,
        full_name: cleanName,
      },
      { onConflict: "id" }
    );

    let role: string | null = null;

    for (let i = 0; i < 5; i++) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileData?.role) {
        role = profileData.role;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    setRegisterLoading(false);

    if (role === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }

    router.refresh();
  };

  return (
    <>
      <div
        className={
          !checkingAuth && !isLoggedIn
            ? "pointer-events-none select-none blur-[10px] brightness-75 transition duration-300"
            : "transition duration-300"
        }
        aria-hidden={!checkingAuth && !isLoggedIn}
      >
        {children}
      </div>

      {isAuthBlocked && (
        <div className="fixed inset-0 z-[120] bg-black/50 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
          <div className="flex min-h-full items-center justify-center">
            <div className="max-h-[95vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl">
              <div className="grid max-h-[95vh] overflow-y-auto lg:grid-cols-2">
                <div className="relative overflow-hidden bg-black p-6 text-white sm:p-8 lg:flex lg:min-h-full lg:flex-col lg:justify-between lg:p-10">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_35%)]" />
                  <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
                  <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:34px_34px]" />

                  <span className="pointer-events-none absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
                  <span className="pointer-events-none absolute left-[22%] top-[30%] h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_14px_rgba(255,255,255,0.8)]" />
                  <span className="pointer-events-none absolute right-[18%] top-[22%] h-1 w-1 rounded-full bg-blue-200/80 shadow-[0_0_12px_rgba(191,219,254,0.8)]" />
                  <span className="pointer-events-none absolute right-[28%] bottom-[28%] h-1 w-1 rounded-full bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                  <span className="pointer-events-none absolute left-[18%] bottom-[22%] h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_12px_rgba(255,255,255,0.8)]" />

                  <span className="pointer-events-none absolute left-[8%] top-[16%] h-px w-24 rotate-[25deg] bg-gradient-to-r from-white/0 via-white/70 to-white/0 opacity-70 animate-[shootingStar_6s_linear_infinite]" />
                  <span className="pointer-events-none absolute right-[12%] top-[38%] h-px w-20 rotate-[25deg] bg-gradient-to-r from-blue-200/0 via-blue-200/80 to-blue-200/0 opacity-60 animate-[shootingStar_8s_linear_infinite]" />
                  <span className="pointer-events-none absolute left-[30%] bottom-[24%] h-px w-16 rotate-[25deg] bg-gradient-to-r from-white/0 via-white/60 to-white/0 opacity-60 animate-[shootingStar_7s_linear_infinite]" />

                  <div className="relative z-10">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.32em] text-white/50 sm:mb-4 sm:text-sm">
                      StreamingMayor
                    </p>

                    <h2 className="text-4xl font-extrabold leading-tight sm:text-5xl">
                      {mode === "login" ? (
                        <>
                          Bienvenido
                        </>
                      ) : (
                        <>
                          Crea tu cuenta
                        </>
                      )}
                    </h2>

                    <p className="mt-4 max-w-md text-base leading-7 text-white/72 sm:mt-6 sm:text-lg sm:leading-8">
                      {mode === "login"
                        ? "Accede y continúa tu experiencia digital."
                        : "Regístrate y empieza en segundos."}
                    </p>
                  </div>

                  <div className="relative z-10 mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:mt-8 sm:p-6">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />
                    <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:26px_26px]" />

                    <span className="pointer-events-none absolute left-[14%] top-[26%] h-1 w-1 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                    <span className="pointer-events-none absolute right-[16%] top-[22%] h-1 w-1 rounded-full bg-blue-200/70 shadow-[0_0_10px_rgba(191,219,254,0.8)]" />
                    <span className="pointer-events-none absolute left-[28%] bottom-[24%] h-1 w-1 rounded-full bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                    <span className="pointer-events-none absolute right-[26%] bottom-[30%] h-px w-12 rotate-[25deg] bg-gradient-to-r from-white/0 via-white/70 to-white/0 opacity-60 animate-[shootingStar_5s_linear_infinite]" />

                    <div className="relative z-10">
                      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/50 sm:mb-3 sm:text-sm">
                        Plataforma
                      </p>

                      <h3 className="text-xl font-bold leading-tight sm:text-2xl">
                        {mode === "login"
                          ? "Todo en un solo lugar"
                          : "Acceso rápido y seguro"}
                      </h3>

                      <p className="mt-3 max-w-sm text-sm leading-6 text-white/68 sm:text-base sm:leading-7">
                        {mode === "login"
                          ? "Compra, gestiona y sigue tus pedidos fácilmente."
                          : "Crea tu cuenta y empieza a comprar sin complicaciones."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white px-5 py-6 sm:px-8 sm:py-8 md:px-10">
                  <div className="mx-auto w-full max-w-md">
                    {mode === "login" ? (
                      <>
                        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-gray-500">
                          Bienvenido
                        </p>

                        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                          Iniciar sesión
                        </h1>

                        <p className="mt-3 text-sm text-gray-500 sm:text-base">
                          Ingresa a tu cuenta para continuar.
                        </p>

                        <form className="mt-7 space-y-4 sm:mt-8 sm:space-y-5" onSubmit={handleLogin}>
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                              Correo electrónico
                            </label>

                            <input
                              type="email"
                              placeholder="tucorreo@email.com"
                              value={loginEmail}
                              onChange={(e) => setLoginEmail(e.target.value)}
                              required
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                            />
                          </div>

                          <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <label className="block text-sm font-semibold text-gray-700">
                                Contraseña
                              </label>

                              <button
                                type="button"
                                onClick={handleForgotPassword}
                                className="text-xs text-blue-600 hover:underline sm:text-sm"
                              >
                                ¿Olvidaste tu contraseña?
                              </button>
                            </div>

                            <input
                              type="password"
                              placeholder="********"
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              required
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={loginLoading}
                            className="w-full rounded-2xl bg-[#050816] py-3.5 font-semibold text-white transition hover:opacity-95 disabled:opacity-50 sm:py-4"
                          >
                            {loginLoading ? "Entrando..." : "Iniciar sesión"}
                          </button>
                        </form>

                        {loginMessage && (
                          <p className="mt-4 text-center text-sm text-gray-600">
                            {loginMessage}
                          </p>
                        )}

                        <p className="mt-7 text-center text-sm text-gray-500 sm:mt-8">
                          ¿No tienes cuenta?{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setLoginMessage("");
                              setMode("register");
                            }}
                            className="font-semibold text-blue-600 hover:underline"
                          >
                            Regístrate
                          </button>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-gray-500">
                          Registro
                        </p>

                        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                          Crear cuenta
                        </h1>

                        <p className="mt-3 text-sm text-gray-500 sm:text-base">
                          Completa tus datos para comenzar.
                        </p>

                        <form
                          className="mt-7 space-y-4 sm:mt-8 sm:space-y-5"
                          onSubmit={handleRegister}
                        >
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                              Nombre completo
                            </label>

                            <input
                              type="text"
                              placeholder="Tu nombre"
                              value={registerFullName}
                              onChange={(e) => setRegisterFullName(e.target.value)}
                              required
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                              Correo electrónico
                            </label>

                            <input
                              type="email"
                              placeholder="tucorreo@email.com"
                              value={registerEmail}
                              onChange={(e) => setRegisterEmail(e.target.value)}
                              required
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                              Contraseña
                            </label>

                            <input
                              type="password"
                              placeholder="********"
                              value={registerPassword}
                              onChange={(e) => setRegisterPassword(e.target.value)}
                              required
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={registerLoading}
                            className="w-full rounded-2xl bg-[#050816] py-3.5 font-semibold text-white transition hover:opacity-95 disabled:opacity-50 sm:py-4"
                          >
                            {registerLoading ? "Creando cuenta..." : "Crear cuenta"}
                          </button>
                        </form>

                        {registerMessage && (
                          <p className="mt-4 text-center text-sm text-gray-600">
                            {registerMessage}
                          </p>
                        )}

                        <p className="mt-7 text-center text-sm text-gray-500 sm:mt-8">
                          ¿Ya tienes cuenta?{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setRegisterMessage("");
                              setMode("login");
                            }}
                            className="font-semibold text-blue-600 hover:underline"
                          >
                            Inicia sesión
                          </button>
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}