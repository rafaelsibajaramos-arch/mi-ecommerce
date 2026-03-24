"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthMode = "login" | "register";

type ProfileRow = {
  id: string;
  role: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

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

  const isPublicPath = pathname === "/reset-password";

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
    if (isPublicPath) return;

    if (!isLoggedIn) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [checkingAuth, isLoggedIn, isPublicPath]);

  const ensureOwnProfile = async (
    user: User,
    fallback?: { fullName?: string; email?: string }
  ): Promise<{ profile: ProfileRow | null; errorMessage: string | null }> => {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfileError) {
      return {
        profile: null,
        errorMessage: getErrorMessage(
          existingProfileError,
          "No se pudo consultar tu perfil."
        ),
      };
    }

    if (existingProfile) {
      return {
        profile: existingProfile,
        errorMessage: null,
      };
    }

    const safeEmail = fallback?.email?.trim() || user.email?.trim() || "";
    const safeFullName =
      fallback?.fullName?.trim() ||
      String(user.user_metadata?.full_name || "").trim() ||
      safeEmail ||
      "Usuario";

    const { error: insertProfileError } = await supabase.from("profiles").insert({
      id: user.id,
      email: safeEmail,
      full_name: safeFullName,
      role: "user",
      balance: 0,
    });

    if (insertProfileError) {
      return {
        profile: null,
        errorMessage: getErrorMessage(
          insertProfileError,
          "La sesión inició, pero no se pudo crear tu perfil."
        ),
      };
    }

    const { data: createdProfile, error: createdProfileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (createdProfileError || !createdProfile) {
      return {
        profile: null,
        errorMessage: getErrorMessage(
          createdProfileError,
          "La sesión inició, pero no se pudo cargar tu perfil."
        ),
      };
    }

    return {
      profile: createdProfile,
      errorMessage: null,
    };
  };

  const redirectByRole = (role: string | null | undefined) => {
    if (role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/");
    }

    router.refresh();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage("");

    const cleanEmail = loginEmail.trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
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

    const { profile, errorMessage } = await ensureOwnProfile(user, {
      email: cleanEmail,
    });

    if (errorMessage || !profile) {
      setLoginMessage(errorMessage || "No se pudo cargar tu perfil.");
      setLoginLoading(false);
      return;
    }

    setLoginLoading(false);
    redirectByRole(profile.role);
  };

  const handleForgotPassword = async () => {
    setLoginMessage("");

    if (!loginEmail.trim()) {
      setLoginMessage(
        "Escribe tu correo electrónico para recuperar tu contraseña."
      );
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
          "Cuenta creada. Revisa tu correo para confirmar o inicia sesión manualmente."
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

    const { profile, errorMessage } = await ensureOwnProfile(user, {
      fullName: cleanName,
      email: cleanEmail,
    });

    if (errorMessage || !profile) {
      setRegisterMessage(errorMessage || "No se pudo crear tu perfil.");
      setRegisterLoading(false);
      return;
    }

    setRegisterLoading(false);
    redirectByRole(profile.role);
  };

  const showAuthModal = !checkingAuth && !isLoggedIn && !isPublicPath;

  return (
    <>
      <div
        className={
          showAuthModal
            ? "pointer-events-none select-none brightness-75 transition duration-300"
            : "transition duration-300"
        }
        aria-hidden={showAuthModal}
      >
        {children}
      </div>

      {showAuthModal && (
        <div className="fixed inset-0 z-[120] bg-black/50 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
          <div className="flex min-h-full items-center justify-center">
            <div className="max-h-[92vh] w-full max-w-[560px] overflow-hidden rounded-[26px] border border-white/10 bg-white shadow-2xl">
              <div className="max-h-[92vh] overflow-y-auto bg-white px-5 py-6 sm:px-8 sm:py-8 md:px-10 md:py-9">
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
      )}
    </>
  );
}