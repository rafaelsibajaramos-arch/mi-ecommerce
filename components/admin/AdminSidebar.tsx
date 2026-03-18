"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const adminLinks = [
  { href: "/admin/orders", label: "Pedidos" },
  { href: "/admin/products", label: "Productos" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/wallet", label: "Wallet" },
];

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const currentSection = useMemo(() => {
    const current = adminLinks.find((item) => {
      if (item.href === "/admin/orders") {
        return pathname === "/admin" || pathname === "/admin/orders";
      }
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });

    return current?.label || "Panel admin";
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/admin/orders") {
      return pathname === "/admin" || pathname === "/admin/orders";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navClass = (href: string) =>
    isActive(href)
      ? "flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#050816] shadow-sm"
      : "flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-white/72 transition hover:bg-white/10 hover:text-white";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-[96px] z-[120] inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50 lg:hidden"
        aria-label="Abrir menú admin"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <div className="pointer-events-none fixed left-20 top-[101px] z-[119] hidden rounded-2xl border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur sm:block lg:hidden">
        {currentSection}
      </div>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[130] bg-black/55 transition-opacity duration-300 lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed left-0 top-0 z-[140] flex h-dvh w-[84vw] max-w-[320px] flex-col bg-[#050816] text-white shadow-2xl transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              StreamingMayor
            </p>
            <h2 className="mt-1 text-xl font-extrabold">Panel admin</h2>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/15"
            aria-label="Cerrar menú"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            Administración
          </p>

          <nav className="space-y-2">
            {adminLinks.map((item) => (
              <Link key={item.href} href={item.href} className={navClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={handleLogout}
            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col border-r border-slate-900/5 bg-[#050816] text-white lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            StreamingMayor
          </p>
          <h2 className="mt-2 text-2xl font-extrabold">Panel admin</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
            Administración
          </p>

          <nav className="space-y-2">
            {adminLinks.map((item) => (
              <Link key={item.href} href={item.href} className={navClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={handleLogout}
            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}