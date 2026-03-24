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

  const publicPaths = useMemo(() => ["/", "/login", "/register"], []);
  const isPublicPath = publicPaths.includes(pathname);

  const shouldShowLoginModal = !checkingAuth && !isLoggedIn && isPublicPath;
  const shouldBlockPrivatePage = !checkingAuth && !isLoggedIn && !isPublicPath;

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("Error obteniendo sesión:", error.message);
          setIsLoggedIn(false);
        } else {
          setIsLoggedIn(!!session?.user);
        }
      } catch (error) {
        console.error("Error inesperado revisando sesión:", error);
        if (!mounted) return;
        setIsLoggedIn(false);
      } finally {
        if (mounted) setCheckingAuth(false);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
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

    const previousOverflow = document.body.style.overflow;
    const previousOverflowX = document.body.style.overflowX;

    if (!isLoggedIn && isPublicPath) {
      document.body.style.overflow = "hidden";
      document.body.style.overflowX = "hidden";
    } else {
      document.body.style.overflow = "";
      document.body.style.overflowX = "";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overflowX = previousOverflowX;
    };
  }, [checkingAuth, isLoggedIn, isPublicPath]);

  useEffect(() => {
    if (checkingAuth) return;

    if (shouldBlockPrivatePage) {
      router.replace("/");
    }
  }, [checkingAuth, shouldBlockPrivatePage, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage("");

    try {
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
    } catch (error) {
      console.error("Error iniciando sesión:", error);
      setLoginMessage("Ocurrió un error inesperado al iniciar sesión.");
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLoginMessage("");

    if (!loginEmail.trim()) {
      setLoginMessage(
        "Escribe tu correo electrónico para recuperar tu contraseña."
      );
      return;
    }

    try {
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
    } catch (error) {
      console.error("Error recuperando contraseña:", error);
      setLoginMessage("No se pudo procesar la recuperación de contraseña.");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    setRegisterMessage("");

    try {
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
    } catch (error) {
      console.error("Error registrando usuario:", error);
      setRegisterMessage("Ocurrió un error inesperado creando la cuenta.");
      setRegisterLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <>
        <div className="transition duration-300">{children}</div>

        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/35 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-[#050816] px-5 py-4 text-sm font-semibold text-white shadow-xl">
            Verificando sesión...
          </div>
        </div>
      </>
    );
  }

  if (shouldBlockPrivatePage) {
    return (
      <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black text-white">
        <div className="rounded-2xl border border-white/10 bg-[#050816] px-5 py-4 text-sm font-semibold shadow-xl">
          Redirigiendo al inicio...
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={
          shouldShowLoginModal
            ? "pointer-events-none select-none brightness-75 transition duration-300"
            : "transition duration-300"
        }
        aria-hidden={shouldShowLoginModal}
      >
        {children}
      </div>

      {shouldShowLoginModal && (
        <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm">
          <div className="absolute inset-0" />

          <div
            className="absolute left-1/2 top-1/2 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl"
            style={{ maxHeight: "calc(100dvh - 32px)" }}
          >
            <div
              className="overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-8 sm:py-8 md:px-10 md:py-9"
              style={{ maxHeight: "calc(100dvh - 32px)" }}
            >
              <div className="w-full">
                {mode === "login" ? (
                  <>
                    <p className="mb-2 text-sm uppercase tracking-[0.2em] text-gray-500">
                      Bienvenido
                    </p>

                    <h1 className="text-[2rem] font-extrabold leading-tight text-gray-900 sm:text-4xl">
                      Iniciar sesión
                    </h1>

                    <p className="mt-3 text-sm text-gray-500 sm:text-base">
                      Ingresa a tu cuenta para continuar.
                    </p>

                    <form
                      className="mt-7 space-y-4 sm:mt-8 sm:space-y-5"
                      onSubmit={handleLogin}
                    >
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
                          autoComplete="email"
                          className="block w-full min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                        />
                      </div>

                      <div>
                        <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <label className="block text-sm font-semibold text-gray-700">
                            Contraseña
                          </label>

                          <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-left text-xs text-blue-600 hover:underline sm:text-sm"
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
                          autoComplete="current-password"
                          className="block w-full min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="block w-full rounded-2xl bg-[#050816] px-4 py-3.5 text-center font-semibold text-white transition hover:opacity-95 disabled:opacity-50 sm:py-4"
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

                    <h1 className="text-[2rem] font-extrabold leading-tight text-gray-900 sm:text-4xl">
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
                          autoComplete="name"
                          className="block w-full min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
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
                          autoComplete="email"
                          className="block w-full min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
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
                          autoComplete="new-password"
                          className="block w-full min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:py-4"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={registerLoading}
                        className="block w-full rounded-2xl bg-[#050816] px-4 py-3.5 text-center font-semibold text-white transition hover:opacity-95 disabled:opacity-50 sm:py-4"
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
      )}
    </>
  );
}