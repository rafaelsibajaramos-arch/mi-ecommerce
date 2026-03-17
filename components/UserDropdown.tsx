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

export default function UserDropdown() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadProfile();
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

    if (!user) return;

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
    router.push("/");
    router.refresh();
  };

  if (!profile) return null;

  const balance = Number(profile.balance || 0).toLocaleString();
  const fullName = profile.full_name || "Usuario";
  const email = profile.email || "Sin correo";

  return (
    <div ref={dropdownRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-[56px] items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-4 text-white transition hover:bg-white/[0.06]"
      >
        <span className="text-[17px] font-semibold text-white/95">
          $ {balance}
        </span>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black">
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
        <div 
        className="absolute right-0 top-[70px] z-50 w-[380px] overflow-hidden rounded-[28px] border border-white/10 bg-[#050816]/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.03),transparent_34%)]" />

          <div className="relative z-10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-white">
                  {fullName}
                </p>
                <p className="mt-1 truncate text-sm text-white/55">{email}</p>
              </div>

              <span className="shrink-0 rounded-full border border-blue-400/40 bg-blue-500/15 px-4 py-[6px] text-sm font-semibold text-blue-300 capitalize shadow-[0_0_12px_rgba(59,130,246,0.35)]">
  {profile.role || "user"}
</span>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                Saldo disponible
              </p>
              <p className="mt-2 text-2xl font-black text-sky-400">
                $ {balance}
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white"
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
                <span>Mi Perfil</span>
              </Link>

              <Link
  href="/account/wallet"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white"
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
                <span>Mi Billetera</span>
              </Link>

              <Link
                href="/account/orders"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium text-white/85 transition hover:bg-white/[0.05] hover:text-white"
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

            <div className="mt-5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
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