"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Wallet,
  KeyRound,
  Tags,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";

const menuItems = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Productos", href: "/admin/products", icon: Package },
  { name: "Pedidos", href: "/admin/orders", icon: ShoppingCart },
  { name: "Usuarios", href: "/admin/users", icon: Users },
  { name: "Saldo", href: "/admin/balance", icon: Wallet },
  { name: "Licencias", href: "/admin/licenses", icon: KeyRound },
  { name: "Categorías", href: "/admin/categories", icon: Tags },
  { name: "Reportes", href: "/admin/reports", icon: BarChart3 },
  { name: "Ajustes", href: "/admin/settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[280px] min-h-screen bg-[#050816] text-white flex flex-col border-r border-white/10">
      <div className="px-6 py-8 border-b border-white/10">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">
          StreamingMayor
        </p>
        <h1 className="text-2xl font-extrabold mt-3">Admin Panel</h1>
        <p className="text-sm text-white/60 mt-2">
          Control total de la plataforma
        </p>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                active
                  ? "bg-white text-[#050816] font-semibold"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/75 hover:bg-white/10 hover:text-white transition">
          <LogOut size={20} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}