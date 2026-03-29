"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import { Bebas_Neue } from "next/font/google";
import UserDropdown from "@/components/UserDropdown";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
});

export default function Navbar() {
  const { cart, openCart } = useCart();
  const pathname = usePathname();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    checkSessionAndRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkSessionAndRole();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkSessionAndRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsLoggedIn(false);
      setIsAdmin(false);
      return;
    }

    setIsLoggedIn(true);

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setIsAdmin(data?.role === "admin");
  }

  const navLinkClass = (href: string) =>
    pathname === href
      ? "inline-flex h-11 items-center rounded-full border border-white/14 bg-white/[0.12] px-5 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"
      : "inline-flex h-11 items-center rounded-full border border-transparent bg-transparent px-5 text-[14px] font-semibold text-white/70 transition duration-200 hover:border-white/10 hover:bg-white/[0.06] hover:text-white";

  const logoClass = `${bebasNeue.className} select-none whitespace-nowrap uppercase leading-none tracking-[-0.03em] text-[clamp(18px,5.9vw,29px)] min-[390px]:text-[clamp(20px,5.8vw,31px)] md:text-[50px] md:tracking-[-0.018em]`;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-black/42 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-2xl supports-[backdrop-filter]:bg-black/28">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_center,rgba(255,255,255,0.04),transparent_55%)]" />

        <div className="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between gap-2 px-3 min-[390px]:gap-3 min-[390px]:px-4 md:h-[80px] md:gap-4 md:px-6">
          <div className="min-w-0 flex-1 overflow-hidden">
            <Link
              href="/"
              aria-label="Ir al inicio"
              className="inline-flex max-w-full items-center whitespace-nowrap leading-none"
            >
              <span className={`${logoClass} text-[#DA010D]`}>STREAMING</span>
              <span className={`${logoClass} text-[#FCFCFC]`}>MAYOR</span>
            </Link>
          </div>

          {isLoggedIn && (
            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-3 lg:flex">
              <Link href="/" className={navLinkClass("/")}>
                Inicio
              </Link>

              {isAdmin && (
                <Link
                  href="/admin/products"
                  className={navLinkClass("/admin/products")}
                >
                  Admin
                </Link>
              )}
            </nav>
          )}

          <div className="flex shrink-0 items-center gap-2 min-[390px]:gap-3">
            <button
              type="button"
              aria-label="Abrir carrito"
              onClick={() => {
                if (!isLoggedIn) return;
                openCart();
              }}
              disabled={!isLoggedIn}
              className="relative flex h-[44px] w-[44px] items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.045] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_28px_rgba(0,0,0,0.28)] transition duration-200 hover:border-white/18 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 min-[390px]:h-[46px] min-[390px]:w-[46px] md:h-[52px] md:w-[52px] md:rounded-[18px]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] min-[390px]:h-5 min-[390px]:w-5 md:h-[21px] md:w-[21px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.9a1 1 0 0 0 1-.8L21 7H7" />
              </svg>

              {isLoggedIn && totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white/20 bg-white px-1 text-[9px] font-bold text-black shadow min-[390px]:h-5 min-[390px]:min-w-5 min-[390px]:text-[10px]">
                  {totalItems}
                </span>
              )}
            </button>

            {isLoggedIn && <UserDropdown isAdmin={isAdmin} />}
          </div>
        </div>
      </header>

      <div className="h-[68px] md:h-[80px]" aria-hidden="true" />
    </>
  );
}