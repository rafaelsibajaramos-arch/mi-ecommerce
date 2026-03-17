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

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (data?.role === "admin") {
      setIsAdmin(true);
    }
  };

  const navLinkClass = (href: string) =>
    pathname === href
      ? "border-b-2 border-white pb-2 text-[16px] font-semibold text-white"
      : "text-[16px] font-semibold text-white/70 transition hover:text-white";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[84px] max-w-7xl items-center justify-between px-4 md:px-6">
        
        {/* LOGO */}
        <Link
          href="/"
          className="text-[28px] font-extrabold tracking-[0.01em] text-white md:text-[38px]"
        >
          STREAMINGMAYOR
        </Link>

        {/* MENU CENTRADO */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 lg:flex">
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

        {/* ACCIONES DERECHA */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={openCart}
            className="relative flex h-[56px] w-[56px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white transition hover:bg-white/[0.07]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
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
              <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-black">
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