"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Package,
  ShoppingCart,
  Users,
  Wallet,
  Settings,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";

const menuItems = [
  { name: "Productos", href: "/admin/products", icon: Package },
  { name: "Pedidos", href: "/admin/orders", icon: ShoppingCart },
  { name: "Usuarios", href: "/admin/users", icon: Users },
  { name: "Saldo", href: "/admin/balance", icon: Wallet },
  { name: "Ajustes", href: "/admin/settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = useMemo(() => {
    return (
      menuItems.find(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/")
      ) || menuItems[1]
    );
  }, [pathname]);

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur xl:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              StreamingMayor
            </p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900">
              {activeItem.name}
            </p>
          </div>

          <button
            type="button"
            aria-label="Abrir menú admin"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />

          <aside className="absolute left-0 top-0 flex h-full w-[86%] max-w-[320px] flex-col border-r border-white/10 bg-[#08111f] text-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                  StreamingMayor
                </p>
                <h2 className="mt-3 text-2xl font-black">Admin</h2>
                <p className="mt-1 text-sm text-white/55">
                  Panel de control
                </p>
              </div>

              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/80 transition hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                      active
                        ? "bg-white text-[#08111f] shadow-sm"
                        : "text-white/72 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="flex-1 text-sm font-semibold">
                      {item.name}
                    </span>
                    <ChevronRight
                      size={16}
                      className={active ? "opacity-70" : "opacity-35"}
                    />
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <aside className="hidden xl:flex xl:min-h-screen xl:w-[248px] xl:flex-col xl:border-r xl:border-black/5 xl:bg-[#08111f] xl:text-white">
        <div className="border-b border-white/10 px-6 py-7">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
            StreamingMayor
          </p>
          <h1 className="mt-3 text-[28px] font-black leading-none">Admin</h1>
          <p className="mt-2 text-sm text-white/50">
            Gestión simple y ordenada
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                  active
                    ? "bg-white text-[#08111f] shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                <span className="flex-1 text-sm font-semibold">{item.name}</span>
                <ChevronRight
                  size={16}
                  className={`transition ${
                    active ? "opacity-70" : "opacity-0 group-hover:opacity-40"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="rounded-2xl bg-white/5 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/35">
              Configuración
            </p>
            <p className="mt-2 text-sm font-semibold text-white/90">
              Panel administrativo
            </p>
            <p className="mt-1 text-xs text-white/45">
              Diseño limpio y responsive
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}