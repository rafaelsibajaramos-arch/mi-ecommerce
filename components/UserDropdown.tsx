"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const ADMIN_ROLE_EVENT = "streamingmayor:admin-role-change";
const PHOTO_MODE_KEY = "streamingmayor_photo_mode";
const PHOTO_MODE_EVENT = "streamingmayor:photo-mode-change";

export default function UserDropdown({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photoMode, setPhotoMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUser = session?.user || null;

      if (!currentUser) {
        setProfile(null);

        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
          window.dispatchEvent(new Event(ADMIN_ROLE_EVENT));
        } catch {}

        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, balance, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error || !data) return;

      const nextProfile = data as Profile;
      setProfile(nextProfile);

      try {
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
        window.localStorage.setItem(
          ADMIN_CACHE_KEY,
          nextProfile.role === "admin" ? "true" : "false"
        );
        window.dispatchEvent(new Event(ADMIN_ROLE_EVENT));
      } catch {}
    } catch {}
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      try {
        const cachedProfile = window.localStorage.getItem(PROFILE_CACHE_KEY);

        if (cachedProfile) {
          setProfile(JSON.parse(cachedProfile) as Profile);
        }
      } catch {}

      void loadProfile();
    }, 0);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;

      if (!session?.user) {
        setProfile(null);

        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
          window.dispatchEvent(new Event(ADMIN_ROLE_EVENT));
        } catch {}

        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        window.setTimeout(() => void loadProfile(), 0);
      }
    });

    return () => {
      window.clearTimeout(initialTimer);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    const syncPhotoMode = () => {
      try {
        setPhotoMode(window.localStorage.getItem(PHOTO_MODE_KEY) === "true");
      } catch {
        setPhotoMode(false);
      }
    };

    syncPhotoMode();

    window.addEventListener("storage", syncPhotoMode);
    window.addEventListener(PHOTO_MODE_EVENT, syncPhotoMode);

    return () => {
      window.removeEventListener("storage", syncPhotoMode);
      window.removeEventListener(PHOTO_MODE_EVENT, syncPhotoMode);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, []);

  const togglePhotoMode = () => {
    const nextValue = !photoMode;

    setPhotoMode(nextValue);

    try {
      window.localStorage.setItem(PHOTO_MODE_KEY, nextValue ? "true" : "false");
      window.dispatchEvent(new CustomEvent(PHOTO_MODE_EVENT, { detail: nextValue }));
    } catch {
      // Ignora errores de localStorage.
    }
  };

  const logout = async () => {
    try { window.localStorage.removeItem(PROFILE_CACHE_KEY); window.localStorage.removeItem(ADMIN_CACHE_KEY); } catch {}
    await supabase.auth.signOut();
    setProfile(null);
    setOpen(false);
    router.replace("/");
    router.refresh();
  };

  if (!profile) return null;

  const rawBalance = Number(profile.balance || 0);
  const balance = new Intl.NumberFormat("es-CO").format(rawBalance);
  const compactBalance = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(rawBalance);
  const fullName = profile.full_name || "Usuario";
  const email = profile.email || "Sin correo";
  const canSeeAdmin = isAdmin || profile.role === "admin";

  // Tamaños streamingmayor + hover azul streamingmayor
  const itemClass =
    "group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.018] px-3 py-2 text-[13px] font-medium text-white/85 transition duration-300 hover:bg-white/[0.05] hover:text-white min-[390px]:py-2.5 min-[390px]:text-[14px] md:gap-2.5 md:px-3 md:py-2 md:text-[14px] xl:py-2";

  // Tamaños streamingmayor + estilo icono streamxpress
  const iconWrapClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-500/70 bg-[linear-gradient(145deg,#0d1f4a,#071230)] text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(100,160,255,0.15)] transition duration-300 group-hover:border-blue-400 group-hover:text-blue-300 group-hover:shadow-[0_0_16px_rgba(59,130,246,0.7)] min-[390px]:h-9 min-[390px]:w-9 md:h-8 md:w-8";

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger — idéntico a streamingmayor */}
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
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21a8 8 0 1 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <span className={`hidden text-white/40 transition min-[350px]:inline-block ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Panel — estructura streamxpress + colores streamingmayor */}
      {open && (
<div className="absolute right-0 top-[54px] z-50 w-[calc(100vw-24px)] max-w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#050816]/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)] min-[390px]:w-[calc(100vw-32px)] md:top-[58px] md:w-[320px] md:max-w-[320px] md:rounded-[22px] xl:w-[330px] xl:max-w-[330px]">
          {/* Ambient — igual que streamxpress pero en azul */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.03),transparent_34%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />

          <div className="relative z-10 max-h-[calc(100dvh-5.5rem)] overflow-y-auto p-3.5 min-[390px]:p-4 md:max-h-[calc(100dvh-6rem)] md:p-4 xl:p-4">

            {/* Header card — estilo streamxpress */}
<div>              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-white min-[390px]:text-[14px] md:text-[14px]">
                    {fullName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-white/55 min-[390px]:text-xs md:text-xs">
                    {email}
                  </p>
                </div>
                {/* Badge — azul streamingmayor */}
                {canSeeAdmin ? (
                  <button
                    type="button"
                    onClick={togglePhotoMode}
                    title={photoMode ? "Desactivar modo foto" : "Activar modo foto"}
                    className={`shrink-0 rounded-full border border-blue-400/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold capitalize text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.35)] transition duration-200 hover:border-blue-300 hover:bg-blue-500/20 hover:text-blue-200 min-[390px]:px-3 min-[390px]:text-xs md:px-3 md:py-1 md:text-xs ${
                      photoMode ? "border-sky-300/55 bg-sky-400/20 text-sky-100" : ""
                    }`}
                  >
                    {photoMode ? "Foto" : profile.role || "user"}
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full border border-blue-400/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold capitalize text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.35)] min-[390px]:px-3 min-[390px]:text-xs md:px-3 md:py-1 md:text-xs">
                    {profile.role || "user"}
                  </span>
                )}
              </div>

              {/* Balance — sky-400 streamingmayor dentro de card streamxpress */}
<div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 min-[390px]:mt-4 min-[390px]:px-4 min-[390px]:py-3.5 md:mt-3 md:px-3.5 md:py-3">                <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 md:text-[10px]">
                  Saldo disponible
                </p>
                <p className="mt-1.5 text-lg font-black text-sky-400 min-[390px]:text-xl md:text-xl">
                  $ {balance}
                </p>
              </div>
            </div>

            {/* Nav */}
            <div className="mt-3 space-y-1.5 min-[390px]:mt-4 min-[390px]:space-y-2 md:mt-3 md:space-y-1">
              <Link href="/" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
                  </svg>
                </span>
                <span>Inicio</span>
              </Link>

              {canSeeAdmin && (
                <Link href="/admin/products" onClick={() => setOpen(false)} className={itemClass}>
                  <span className={iconWrapClass}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4Z" /><path d="M9.5 12.5 11 14l3.5-3.5" />
                    </svg>
                  </span>
                  <span>Admin</span>
                </Link>
              )}

              <Link href="/account" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21a8 8 0 1 0-16 0" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span>Mi perfil</span>
              </Link>

              <Link href="/account/wallet" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7h18" /><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M16 13h.01" />
                  </svg>
                </span>
                <span>Mi billetera</span>
              </Link>

<Link href="/recargas-automaticas" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                  </svg>
                </span>
                <span>Recargas automáticas</span>
              </Link>

              <Link href="/account/orders" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 min-[390px]:h-5 min-[390px]:w-5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <span>Mis pedidos</span>
              </Link>
            </div>

            {/* Logout — rojo streamingmayor */}
            <div className="mt-3 border-t border-white/10 pt-3 min-[390px]:mt-4 min-[390px]:pt-4 md:mt-3 md:pt-3">
             <button
  type="button"
  onClick={logout}
  className="group relative flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-300 hover:border-red-400/25 hover:bg-red-500/10 hover:text-red-200"
>
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>

  <span>Cerrar sesión</span>
</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
