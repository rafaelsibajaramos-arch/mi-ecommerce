"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  balance: number | null;
  role: string | null;
};

const PROFILE_CACHE_KEY = "streamingmayor_profile_cache";
const ADMIN_CACHE_KEY = "streamingmayor_is_admin";

export default function UserDropdown({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const cachedProfile = window.localStorage.getItem(PROFILE_CACHE_KEY);

      if (cachedProfile) {
        const parsedProfile = JSON.parse(cachedProfile) as Profile;
        setProfile(parsedProfile);
      }
    } catch {
      // Ignora errores de localStorage.
    }

    void loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setProfile(null);

        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
        } catch {
          // Ignora errores de localStorage.
        }

        return;
      }

      window.setTimeout(() => {
        void loadProfile();
      }, 0);

      window.setTimeout(() => {
        void loadProfile();
      }, 900);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current) return;

      if (!dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const loadProfile = async () => {
    try {
      let currentUser = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        currentUser = session?.user || null;

        if (!currentUser) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          currentUser = user || null;
        }

        if (currentUser) {
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      if (!currentUser) {
        setProfile(null);

        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
        } catch {
          // Ignora errores de localStorage.
        }

        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, balance, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error || !data) {
        return;
      }

      const nextProfile = data as Profile;

      setProfile(nextProfile);

      try {
        window.localStorage.setItem(
          PROFILE_CACHE_KEY,
          JSON.stringify(nextProfile)
        );

        window.localStorage.setItem(
          ADMIN_CACHE_KEY,
          nextProfile.role === "admin" ? "true" : "false"
        );
      } catch {
        // Ignora errores de localStorage.
      }
    } catch {
      // Si hay error temporal, deja el perfil cacheado visible.
    }
  };

  const logout = async () => {
    try {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      window.localStorage.removeItem(ADMIN_CACHE_KEY);
    } catch {
      // Ignora errores de localStorage.
    }

    await supabase.auth.signOut();

    setProfile(null);
    setOpen(false);

    router.replace("/");
    router.refresh();
  };

  if (!profile) return null;

  const rawBalance = Number(profile.balance || 0);

  const balance = new Intl.NumberFormat("es-CO").format(rawBalance);

  const compactBalance = new Intl.NumberFormat("es-CO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(rawBalance);

  const fullName = profile.full_name || "Usuario";
  const email = profile.email || "Sin correo";
  const canSeeAdmin = isAdmin || profile.role === "admin";

  const itemClass =
    "flex items-center gap-3 rounded-2xl px-3 py-2 text-[13px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white min-[390px]:py-2.5 min-[390px]:text-[14px] md:gap-2.5 md:px-3 md:py-2 md:text-[14px] xl:py-2";

  const iconWrapClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] min-[390px]:h-9 min-[390px]:w-9 md:h-8 md:w-8";

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[44px] max-w-[132px] items-center gap-1.5 rounded-[18px] border border-white/15 bg-white/[0.03] px-2 text-white transition hover:bg-white/[0.06] min-[350px]:max-w-[152px] min-[350px]:px-2.5 min-[390px]:h-[46px] min-[390px]:max-w-[175px] min-[390px]:gap-2 min-[390px]:px-3 min-[430px]:max-w-[220px] md:h-[50px] md:max-w-none md:gap-3 md:px-4"
      >
        <span className="hidden text-[11px] font-semibold text-white/95 min-[350px]:block min-[430px]:hidden">
          $ {compactBalance}
        </span>

        <span className="hidden text-[13px] font-semibold text-white/95 min-[430px]:block md:text-[16px]">
          $ {balance}
        </span>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black min-[390px]:h-9 min-[390px]:w-9">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21a8 8 0 1 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>

        <span
          className={`hidden text-white/40 transition min-[350px]:inline-block ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[54px] z-50 w-[calc(100vw-24px)] max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#050816]/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl min-[390px]:w-[calc(100vw-32px)] md:top-[58px] md:w-[320px] md:max-w-[320px] md:rounded-[22px] xl:w-[330px] xl:max-w-[330px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.03),transparent_34%)]" />

          <div className="relative z-10 max-h-[calc(100dvh-5.5rem)] overflow-y-auto p-3.5 min-[390px]:p-4 md:max-h-[calc(100dvh-6rem)] md:p-4 xl:p-4">
            <div className="flex items-start justify-between gap-3 min-[390px]:gap-4 md:gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-white min-[390px]:text-[14px] md:text-[14px]">
                  {fullName}
                </p>

                <p className="mt-1 truncate text-[11px] text-white/55 min-[390px]:text-xs md:text-xs">
                  {email}
                </p>
              </div>

              <span className="shrink-0 rounded-full border border-blue-400/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-300 capitalize shadow-[0_0_12px_rgba(59,130,246,0.35)] min-[390px]:px-3 min-[390px]:text-xs md:px-3 md:py-1 md:text-xs">
                {profile.role || "user"}
              </span>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 min-[390px]:mt-4 min-[390px]:px-4 min-[390px]:py-3.5 md:mt-3 md:px-3.5 md:py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 md:text-[10px]">
                Saldo disponible
              </p>

              <p className="mt-1.5 text-lg font-black text-sky-400 min-[390px]:text-xl md:text-xl">
                $ {balance}
              </p>
            </div>

            <div className="mt-3 space-y-1.5 min-[390px]:mt-4 min-[390px]:space-y-2 md:mt-3 md:space-y-1">
              <Link href="/" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 10.5 12 3l9 7.5" />
                    <path d="M5 9.5V21h14V9.5" />
                  </svg>
                </span>

                <span>Inicio</span>
              </Link>

              {canSeeAdmin && (
                <Link
                  href="/admin/products"
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  <span className={iconWrapClass}>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4Z" />
                      <path d="M9.5 12.5 11 14l3.5-3.5" />
                    </svg>
                  </span>

                  <span>Admin</span>
                </Link>
              )}

              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <span className={iconWrapClass}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21a8 8 0 1 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>

                <span>Mi perfil</span>
              </Link>

              <Link
                href="/account/wallet"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <span className={iconWrapClass}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 7h18" />
                    <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                    <path d="M16 13h.01" />
                  </svg>
                </span>

                <span>Mi billetera</span>
              </Link>

              <Link
                href="/recargas-automaticas"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <span className={iconWrapClass}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                </span>

                <span>Recargas automáticas</span>
              </Link>

              <Link
                href="/account/orders"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <span className={iconWrapClass}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>

                <span>Mis pedidos</span>
              </Link>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3 min-[390px]:mt-4 min-[390px]:pt-4 md:mt-3 md:pt-3">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-[13px] font-bold text-red-200 transition hover:bg-red-500/15 min-[390px]:py-3 md:py-2.5 md:text-[13px]"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}