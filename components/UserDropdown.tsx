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

const PROFILE_CACHE_KEY = "streamxpress_profile_cache";
const ADMIN_CACHE_KEY = "streamxpress_is_admin";

export default function UserDropdown({
  isAdmin = false,
}: {
  isAdmin?: boolean;
}) {
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
    } catch {}

    void loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setProfile(null);
        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
        } catch {}
        return;
      }
      window.setTimeout(() => { void loadProfile(); }, 0);
      window.setTimeout(() => { void loadProfile(); }, 800);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, []);

  const loadProfile = async () => {
    try {
      let currentUser = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        if (!currentUser) {
          const { data: { user } } = await supabase.auth.getUser();
          currentUser = user || null;
        }
        if (currentUser) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (!currentUser) {
        setProfile(null);
        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
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
        window.localStorage.setItem(ADMIN_CACHE_KEY, nextProfile.role === "admin" ? "true" : "false");
      } catch {}
    } catch {}
  };

  const logout = async () => {
    try {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      window.localStorage.removeItem(ADMIN_CACHE_KEY);
    } catch {}
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
    "group relative flex items-center gap-1.5 overflow-hidden rounded-[12px] border border-white/8 bg-white/[0.018] px-2 py-1.5 text-[11px] font-semibold text-[#ECECEC] transition duration-300 hover:border-blue-400/30 hover:bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(59,130,246,0.06))] hover:text-white md:gap-2 md:rounded-[14px] md:px-3 md:py-2 md:text-[12px]";

  const iconWrapClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] text-[#f5f5f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_6px_16px_rgba(0,0,0,0.28)] transition duration-300 group-hover:border-blue-400/30 group-hover:text-[#93c5fd] md:h-8 md:w-8 md:rounded-[10px]";

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[42px] max-w-[132px] items-center gap-1.5 rounded-[16px] border border-white/15 bg-gradient-to-b from-white/[0.07] to-white/[0.025] px-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_26px_rgba(0,0,0,0.42)] transition duration-200 hover:border-blue-400/25 hover:bg-white/[0.08] min-[350px]:max-w-[148px] min-[350px]:px-2.5 min-[390px]:h-[44px] min-[390px]:max-w-[168px] min-[390px]:gap-2 min-[390px]:px-3 min-[430px]:max-w-[208px] md:h-[48px] md:max-w-none md:gap-2.5 md:px-3.5"
      >
        <span className="hidden text-[11px] font-black text-[#F6F2E8] min-[350px]:block min-[430px]:hidden">
          $ {compactBalance}
        </span>
        <span className="hidden text-[13px] font-black text-[#F6F2E8] min-[430px]:block md:text-[15px]">
          $ {balance}
        </span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#e2e8f0,#b0b8c4)] text-black shadow-[0_0_16px_rgba(148,163,184,0.20)] md:h-9 md:w-9">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21a8 8 0 1 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <span className={`hidden text-slate-400/80 transition min-[350px]:inline-block ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-[48px] z-50 w-[calc(100vw-18px)] max-w-[255px] overflow-hidden rounded-[18px] border border-blue-400/15 bg-[#06070a]/92 shadow-[0_24px_70px_rgba(0,0,0,0.70),0_0_22px_rgba(59,130,246,0.08)] backdrop-blur-2xl min-[390px]:w-[calc(100vw-24px)] min-[390px]:max-w-[275px] md:top-[54px] md:w-[300px] md:max-w-[300px] md:rounded-[20px]">

          {/* Ambient overlays */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.06),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.02),transparent_30%,rgba(59,130,246,0.03))]" />
          {/* Top shimmer — platino */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />
          {/* Corner glows */}
          <div className="pointer-events-none absolute left-[-40px] top-[-40px] h-28 w-28 rounded-full bg-blue-500/8 blur-3xl" />
          <div className="pointer-events-none absolute right-[-50px] top-[70px] h-28 w-28 rounded-full bg-red-500/[0.06] blur-3xl" />

          <div className="relative z-10 max-h-[calc(100dvh-78px)] overflow-y-auto p-2 md:p-2.5">

            {/* Header card */}
            <div className="rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:rounded-[16px] md:p-3">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-black tracking-tight text-[#F5F5F5] md:text-[16px]">
                    {fullName}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#d3d3d3]/75 md:text-[11px]">
                    {email}
                  </p>
                </div>
                {/* Badge — azul */}
                <span className="shrink-0 rounded-full border border-blue-400/35 bg-[linear-gradient(180deg,rgba(59,130,246,0.20),rgba(59,130,246,0.08))] px-2 py-0.5 text-[10px] font-black capitalize text-blue-200 shadow-[0_0_16px_rgba(59,130,246,0.15)]">
                  {profile.role || "user"}
                </span>
              </div>

              {/* Balance — platino/blanco */}
              <div className="mt-2 overflow-hidden rounded-[13px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-2.5 py-1.5 md:mt-2.5 md:rounded-[15px] md:px-3 md:py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 md:text-[10px]">
                  Saldo disponible
                </p>
                <p className="mt-0.5 text-[19px] font-black leading-none text-[#e2e8f0] drop-shadow-[0_0_12px_rgba(148,163,184,0.15)] md:mt-1 md:text-[22px]">
                  $ {balance}
                </p>
              </div>
            </div>

            {/* Nav links */}
            <div className="mt-2 space-y-1 md:mt-2.5 md:space-y-1.5">
              <Link href="/" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-3 w-3 md:h-3.5 md:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
                  </svg>
                </span>
                <span>Inicio</span>
              </Link>

              {canSeeAdmin && (
                <Link href="/admin/products" onClick={() => setOpen(false)} className={itemClass}>
                  <span className={iconWrapClass}>
                    <svg viewBox="0 0 24 24" className="h-3 w-3 md:h-3.5 md:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4Z" /><path d="M9.5 12.5 11 14l3.5-3.5" />
                    </svg>
                  </span>
                  <span>Admin</span>
                </Link>
              )}

              <Link href="/account" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-3 w-3 md:h-3.5 md:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21a8 8 0 1 0-16 0" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span>Mi perfil</span>
              </Link>

              <Link href="/account/wallet" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-3 w-3 md:h-3.5 md:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7h18" /><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M16 13h.01" />
                  </svg>
                </span>
                <span>Mi billetera</span>
              </Link>

              <Link href="/recargas-automaticas" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-3 w-3 md:h-3.5 md:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                  </svg>
                </span>
                <span>Recargas automáticas</span>
              </Link>

              <Link href="/account/orders" onClick={() => setOpen(false)} className={itemClass}>
                <span className={iconWrapClass}>
                  <svg viewBox="0 0 24 24" className="h-3 w-3 md:h-3.5 md:w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <span>Mis pedidos</span>
              </Link>
            </div>

            {/* Logout — rojo */}
            <div className="mt-2 border-t border-white/10 pt-2 md:mt-2.5 md:pt-2.5">
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-[13px] border border-red-500/25 bg-[linear-gradient(180deg,rgba(239,68,68,0.10),rgba(239,68,68,0.05))] px-3 py-1.5 text-[12px] font-black text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-300 hover:border-red-400/45 hover:bg-[linear-gradient(180deg,rgba(239,68,68,0.16),rgba(239,68,68,0.10))] hover:text-red-100 md:rounded-[15px] md:px-4 md:py-2 md:text-[13px]"
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