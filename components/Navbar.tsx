"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import UserDropdown from "@/components/UserDropdown";

export default function Navbar() {
  const { cart, openCart } = useCart();
  const pathname = usePathname();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

  const checkSessionAndRole = async () => {
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
  };

  const navLinkClass = (href: string) =>
    pathname === href
      ? "border-b-2 border-white pb-1 text-sm font-semibold text-white md:text-[15px]"
      : "text-sm font-semibold text-white/70 transition hover:text-white md:text-[15px]";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 md:h-[78px] md:px-6">
        <Link
          href="/"
          className="text-[20px] font-extrabold tracking-[0.01em] text-white sm:text-[24px] md:text-[30px]"
        >
          STREAMINGMAYOR
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 lg:flex">
          <Link href="/" className={navLinkClass("/")}>
            Inicio
          </Link>

          <a
            href="/#catalogo"
            className="text-sm font-semibold text-white/70 transition hover:text-white md:text-[15px]"
          >
            Catálogo
          </a>

          {!isLoggedIn && (
            <Link href="/login" className={navLinkClass("/login")}>
              Iniciar sesión
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin/products"
              className={navLinkClass("/admin/products")}
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          {!isLoggedIn && (
            <Link
              href="/login"
              className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] sm:inline-flex"
            >
              Login
            </Link>
          )}

          <button
            type="button"
            onClick={openCart}
            className="relative flex h-[48px] w-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white transition hover:bg-white/[0.07] md:h-[52px] md:w-[52px]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 md:h-6 md:w-6"
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

            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black md:h-6 md:min-w-6 md:text-[11px]">
                {totalItems}
              </span>
            )}
          </button>

          <UserDropdown />
        </div>
      </div>
    </header>
  );
}