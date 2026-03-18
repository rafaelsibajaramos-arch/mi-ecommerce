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

export default function UserDropdown({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadProfile();
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, balance, role")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfile(data);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!profile) return null;

  const balance = Number(profile.balance || 0).toLocaleString();
  const fullName = profile.full_name || "Usuario";
  const email = profile.email || "Sin correo";

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-[46px] items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] px-3 text-white transition hover:bg-white/[0.06] md:h-[50px] md:gap-3 md:px-4"
      >
        <span className="text-[13px] font-semibold text-white/95 md:text-[16px]">
          $ {balance}
        </span>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
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
          className={`text-white/40 transition ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[58px] z-50 w-[92vw] max-w-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-[#050816]/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl md:top-[64px] md:w-[360px] md:rounded-[26px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.03),transparent_34%)]" />

          <div className="relative z-10 p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-white md:text-[15px]">
                  {fullName}
                </p>
                <p className="mt-1 truncate text-xs text-white/55 md:text-sm">
                  {email}
                </p>
              </div>

              <span className="shrink-0 rounded-full border border-blue-400/40 bg-blue-500/15 px-3 py-[5px] text-xs font-semibold text-blue-300 capitalize shadow-[0_0_12px_rgba(59,130,246,0.35)] md:px-4 md:py-[6px] md:text-sm">
                {profile.role || "user"}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 md:mt-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 md:text-xs">
                Saldo disponible
              </p>
              <p className="mt-2 text-xl font-black text-sky-400 md:text-2xl">
                $ {balance}
              </p>
            </div>

            <div className="mt-4 space-y-2 md:mt-5">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white md:text-[15px]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
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

              {isAdmin && (
                <Link
                    href="/admin/products"
                    onClick={() => setOpen(false)}
                     className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white md:text-[15px]"
                   >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
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
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white md:text-[15px]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
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
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white md:text-[15px]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
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
                href="/account/orders"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white md:text-[15px]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
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

            <div className="mt-4 border-t border-white/10 pt-4 md:mt-5">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[14px] font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300 md:text-[15px]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                </span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}