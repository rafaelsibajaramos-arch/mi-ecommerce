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
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-[760px] overflow-hidden rounded-[32px] border border-white/10 bg-white shadow-2xl">
            <div className="grid lg:grid-cols-2">
              <div className="relative hidden bg-black p-10 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_40%)]" />
                <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-white/5 blur-3xl" />

                <div className="relative z-10">
                  <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/50">
                    StreamingMayor
                  </p>

                  <h2 className="text-5xl font-extrabold leading-tight">
                    {mode === "login" ? (
                      <>
                        Inicia
                        <br />
                        sesión
                      </>
                    ) : (
                      <>
                        Crea tu
                        <br />
                        cuenta
                      </>
                    )}
                  </h2>

                  <p className="mt-6 max-w-md text-lg leading-8 text-white/70">
                    {mode === "login"
                      ? "Accede a tu cuenta para comprar, gestionar pedidos y usar la plataforma."
                      : "Regístrate para comenzar a comprar y administrar todo desde un solo lugar."}
                  </p>
                </div>

                <div className="relative z-10 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
                  <p className="mb-3 text-sm uppercase tracking-[0.2em] text-white/50">
                    Plataforma
                  </p>
                  <h3 className="text-2xl font-bold">Servicios digitales premium</h3>
                  <p className="mt-3 leading-7 text-white/70">
                    Compra, recibe saldo, consulta licencias y controla tus pedidos
                    desde un solo lugar.
                  </p>
                </div>
              </div>

              <div className="bg-white px-6 py-8 sm:px-8 md:px-10">
                <div className="mx-auto w-full max-w-md">
                  {mode === "login" ? (
                    <>
                      <p className="mb-2 text-sm uppercase tracking-[0.2em] text-gray-500">
                        Bienvenido
                      </p>

                      <h1 className="text-4xl font-extrabold text-gray-900">
                        Iniciar sesión
                      </h1>

                      <p className="mt-3 text-gray-500">
                        Ingresa a tu cuenta para continuar.
                      </p>

                      <form className="mt-8 space-y-5" onSubmit={handleLogin}>
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
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                              className="text-sm text-blue-600 hover:underline"
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
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loginLoading}
                          className="w-full rounded-2xl bg-[#050816] py-4 font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                        >
                          {loginLoading ? "Entrando..." : "Iniciar sesión"}
                        </button>
                      </form>

                      {loginMessage && (
                        <p className="mt-4 text-center text-sm text-gray-600">
                          {loginMessage}
                        </p>
                      )}

                      <p className="mt-8 text-center text-sm text-gray-500">
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

                      <h1 className="text-4xl font-extrabold text-gray-900">
                        Crear cuenta
                      </h1>

                      <p className="mt-3 text-gray-500">
                        Completa tus datos para comenzar.
                      </p>

                      <form className="mt-8 space-y-5" onSubmit={handleRegister}>
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
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={registerLoading}
                          className="w-full rounded-2xl bg-[#050816] py-4 font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                        >
                          {registerLoading ? "Creando cuenta..." : "Crear cuenta"}
                        </button>
                      </form>

                      {registerMessage && (
                        <p className="mt-4 text-center text-sm text-gray-600">
                          {registerMessage}
                        </p>
                      )}

                      <p className="mt-8 text-center text-sm text-gray-500">
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
      )}
    </>
  );
}