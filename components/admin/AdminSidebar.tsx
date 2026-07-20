"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const adminLinks = [
  { href: "/admin/orders", label: "Pedidos" },
  { href: "/admin/products", label: "Productos" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/wallet", label: "Wallet" },
  { href: "/admin/recargas-automaticas", label: "Recargas automáticas" },
  { href: "/admin/promociones-recargas", label: "Promociones" },
  { href: "/admin/license-alerts", label: "Alertas" },
];

// Barra lateral del panel administrativo con navegación responsive y cierre de sesión.
export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [pendingAlertsCount, setPendingAlertsCount] = useState(0);
  const [topupAlertsCount, setTopupAlertsCount] = useState(0); // 👈 NUEVO

  const isMenuOpen = open && openPathname === pathname;

  // Abre el menú lateral del panel administrativo.
  const openMenu = () => {
    setOpenPathname(pathname);
    setOpen(true);
  };

  // Cierra el menú lateral del panel administrativo.
  const closeMenu = () => {
    setOpen(false);
  };

  // Cierra la sesión desde el panel administrativo.
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  useEffect(() => {
    let mounted = true;

    const fetchPendingAlerts = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (mounted) setPendingAlertsCount(0);
        return;
      }

      try {
        const response = await fetch("/api/admin/license-alerts/summary", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const result = await response.json().catch(() => null);

        if (!mounted) return;

        if (!response.ok) {
          setPendingAlertsCount(0);
          return;
        }

        setPendingAlertsCount(Number(result?.pendingDueCount || 0));
      } catch {
        if (mounted) setPendingAlertsCount(0);
      }
    };

    // 👈 NUEVO: cuenta alertas de recargas demoradas (status OPEN) leyendo directo desde Supabase
    const fetchTopupAlerts = async () => {
      try {
        const { count, error } = await supabase
          .from("wallet_topup_alerts")
          .select("id", { count: "exact", head: true })
          .eq("status", "OPEN");

        if (!mounted) return;
        if (error) {
          setTopupAlertsCount(0);
          return;
        }
        setTopupAlertsCount(Number(count || 0));
      } catch {
        if (mounted) setTopupAlertsCount(0);
      }
    };

    void fetchPendingAlerts();
    void fetchTopupAlerts(); // 👈 NUEVO

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchPendingAlerts();
      void fetchTopupAlerts();
    };

    const interval = window.setInterval(refreshIfVisible, 180000);

    const handleFocus = () => {
      void fetchPendingAlerts();
      void fetchTopupAlerts();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("license-alerts-updated", handleFocus);
    window.addEventListener("topup-alerts-updated", handleFocus); // 👈 NUEVO

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("license-alerts-updated", handleFocus);
      window.removeEventListener("topup-alerts-updated", handleFocus); // 👈 NUEVO
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  const currentSection = useMemo(() => {
    const current = adminLinks.find((item) => {
      if (item.href === "/admin/orders") {
        return pathname === "/admin" || pathname === "/admin/orders";
      }
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });

    return current?.label || "Panel admin";
  }, [pathname]);

  // Indica si una ruta coincide con la sección actual del panel.
  const isActive = (href: string) => {
    if (href === "/admin/orders") {
      return pathname === "/admin" || pathname === "/admin/orders";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Devuelve las clases visuales de cada enlace del panel administrativo.
  const navClass = (href: string) =>
    isActive(href)
      ? "flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#050816] shadow-sm"
      : "flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-white/72 transition hover:bg-white/10 hover:text-white";

  // 👈 NUEVO: decide si un link debe mostrar punto rojo y cuántas alertas tiene
  const getAlertInfo = (href: string) => {
    if (href === "/admin/license-alerts") {
      return { show: pendingAlertsCount > 0, count: pendingAlertsCount };
    }
    if (href === "/admin/recargas-automaticas") {
      return { show: topupAlertsCount > 0, count: topupAlertsCount };
    }
    return { show: false, count: 0 };
  };

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
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
        onClick={closeMenu}
        className={`fixed inset-0 z-[130] bg-black/55 transition-opacity duration-300 lg:hidden ${isMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
          }`}
      />

      <aside
        className={`fixed left-0 top-0 z-[140] flex h-dvh w-[84vw] max-w-[320px] flex-col bg-[#050816] text-white shadow-2xl transition-transform duration-300 lg:hidden ${isMenuOpen ? "translate-x-0" : "-translate-x-full"
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
            onClick={closeMenu}
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
            {adminLinks.map((item) => {
              const alertInfo = getAlertInfo(item.href); // 👈 NUEVO

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className={`${navClass(item.href)} justify-between gap-3`}
                >
                  <span>{item.label}</span>
                  {alertInfo.show ? (
                    <span
                      className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.95)]"
                      aria-label={`${alertInfo.count} alerta(s) pendiente(s)`}
                    />
                  ) : null}
                </Link>
              );
            })}
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
            {adminLinks.map((item) => {
              const alertInfo = getAlertInfo(item.href); // 👈 NUEVO

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${navClass(item.href)} justify-between gap-3`}
                >
                  <span>{item.label}</span>
                  {alertInfo.show ? (
                    <span
                      className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.95)]"
                      aria-label={`${alertInfo.count} alerta(s) pendiente(s)`}
                    />
                  ) : null}
                </Link>
              );
            })}
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