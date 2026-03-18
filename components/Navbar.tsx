"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import UserDropdown from "@/components/UserDropdown";

type SiteSettingsRow = {
  navbar_logo_url: string | null;
  navbar_logo_width_desktop: number | null;
  navbar_logo_height_desktop: number | null;
  navbar_logo_width_mobile: number | null;
  navbar_logo_height_mobile: number | null;
};

export default function Navbar() {
  const { cart, openCart } = useCart();
  const pathname = usePathname();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [navbarLogoUrl, setNavbarLogoUrl] = useState("");
  const [logoWidthDesktop, setLogoWidthDesktop] = useState(290);
  const [logoHeightDesktop, setLogoHeightDesktop] = useState(46);
  const [logoWidthMobile, setLogoWidthMobile] = useState(180);
  const [logoHeightMobile, setLogoHeightMobile] = useState(34);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    checkSessionAndRole();
    loadBranding();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkSessionAndRole();
      loadBranding();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadBranding() {
    const { data, error } = await supabase
      .from("site_settings")
      .select(
        "navbar_logo_url, navbar_logo_width_desktop, navbar_logo_height_desktop, navbar_logo_width_mobile, navbar_logo_height_mobile"
      )
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error cargando branding:", error);
      return;
    }

    const row = data?.[0] as SiteSettingsRow | undefined;
    if (!row) return;

    setNavbarLogoUrl(row.navbar_logo_url || "");
    setLogoWidthDesktop(row.navbar_logo_width_desktop || 290);
    setLogoHeightDesktop(row.navbar_logo_height_desktop || 46);
    setLogoWidthMobile(row.navbar_logo_width_mobile || 180);
    setLogoHeightMobile(row.navbar_logo_height_mobile || 34);
  }

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
      ? "border-b-2 border-white pb-1 text-sm font-semibold text-white md:text-[15px]"
      : "text-sm font-semibold text-white/70 transition hover:text-white md:text-[15px]";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[70px] max-w-7xl items-center justify-between px-4 md:h-[76px] md:px-6">
        <div className="shrink-0">
          {navbarLogoUrl ? (
            <>
              <div
                className="relative md:hidden"
                style={{
                  width: `${logoWidthMobile}px`,
                  height: `${logoHeightMobile}px`,
                }}
              >
                <div className="pointer-events-none absolute inset-0">
                  <Image
                    src={navbarLogoUrl}
                    alt="StreamingMayor"
                    fill
                    className="object-contain object-left"
                    sizes="180px"
                    priority
                    unoptimized
                  />
                </div>

                <Link
                  href="/"
                  aria-label="Ir al inicio"
                  className="absolute left-0 top-0 z-10 block"
                  style={{
                    width: `${logoWidthMobile}px`,
                    height: `${Math.min(70, logoHeightMobile)}px`,
                  }}
                />
              </div>

              <div
                className="relative hidden md:block"
                style={{
                  width: `${logoWidthDesktop}px`,
                  height: `${logoHeightDesktop}px`,
                }}
              >
                <div className="pointer-events-none absolute inset-0">
                  <Image
                    src={navbarLogoUrl}
                    alt="StreamingMayor"
                    fill
                    className="object-contain object-left"
                    sizes="290px"
                    priority
                    unoptimized
                  />
                </div>

                <Link
                  href="/"
                  aria-label="Ir al inicio"
                  className="absolute left-0 top-0 z-10 block"
                  style={{
                    width: `${logoWidthDesktop}px`,
                    height: `${Math.min(76, logoHeightDesktop)}px`,
                  }}
                />
              </div>
            </>
          ) : (
            <Link href="/" className="inline-block leading-none">
              <span className="inline-block text-[20px] font-extrabold tracking-[0.01em] text-white sm:text-[24px] md:text-[30px]">
                STREAMINGMAYOR
              </span>
            </Link>
          )}
        </div>

        {isLoggedIn && (
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 lg:flex">
            <Link href="/" className={navLinkClass("/")}>
              Inicio
            </Link>

            {isAdmin && (
              <Link href="/admin/orders" className={navLinkClass("/admin/orders")}>
                Admin
              </Link>
            )}
          </nav>
        )}

        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => {
              if (!isLoggedIn) return;
              openCart();
            }}
            disabled={!isLoggedIn}
            className="relative flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 md:h-[50px] md:w-[50px]"
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

            {isLoggedIn && totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black md:h-6 md:min-w-6 md:text-[11px]">
                {totalItems}
              </span>
            )}
          </button>

          {isLoggedIn && <UserDropdown isAdmin={isAdmin} />}
        </div>
      </div>
    </header>
  );
}