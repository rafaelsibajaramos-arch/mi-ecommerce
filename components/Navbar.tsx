"use client";

import Link from "next/link";
import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import UserDropdown from "@/components/UserDropdown";

export default function Navbar() {
  const { cart, openCart } = useCart();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkSession();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsLoggedIn(!!user);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[70px] max-w-7xl items-center justify-between px-4 md:h-[76px] md:px-6">
        <Link
          href="/"
          className="text-[20px] font-extrabold tracking-[0.01em] text-white sm:text-[24px] md:text-[30px]"
        >
          STREAMINGMAYOR
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={openCart}
            className="relative flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white transition hover:bg-white/[0.07] md:h-[50px] md:w-[50px]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 md:h-[22px] md:w-[22px]"
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

          {isLoggedIn && <UserDropdown />}
        </div>
      </div>
    </header>
  );
}