"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function DashboardSidebar() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-64 bg-[#050816] text-white min-h-screen p-6">
      <h2 className="text-2xl font-extrabold mb-8">StreamingMayor</h2>

      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-4">
          Cliente
        </p>

        <nav className="space-y-4 text-sm">
          <Link href="/account" className="block hover:text-blue-400">
            Dashboard
          </Link>
          <Link href="/account/orders" className="block hover:text-blue-400">
            Mis pedidos
          </Link>
          <Link href="/account/licenses" className="block hover:text-blue-400">
            Mis licencias
          </Link>
          <Link href="/account/wallet" className="block hover:text-blue-400">
            Mi saldo
          </Link>
        </nav>
      </div>

      <div className="border-t border-white/10 my-6"></div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-4">
          Administración
        </p>

        <nav className="space-y-4 text-sm">
          <Link href="/admin" className="block hover:text-blue-400">
            Panel admin
          </Link>
          <Link href="/admin/products" className="block hover:text-blue-400">
            Productos
          </Link>
          <Link href="/admin/licenses" className="block hover:text-blue-400">
            Licencias
          </Link>
          <Link href="/admin/users" className="block hover:text-blue-400">
            Usuarios
          </Link>
          <Link href="/admin/wallet" className="block hover:text-blue-400">
            Wallet
          </Link>
        </nav>
      </div>

      <div className="border-t border-white/10 my-6"></div>

      <button
        onClick={handleLogout}
        className="w-full rounded-2xl bg-white/10 py-3 text-sm font-semibold hover:bg-white/20 transition"
      >
        Cerrar sesión
      </button>
    </aside>
  );
}