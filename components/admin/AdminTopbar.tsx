"use client";

import { Bell, Search } from "lucide-react";

export default function AdminTopbar() {
  return (
    <header className="h-[88px] bg-white border-b border-gray-200 px-8 flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-gray-900">
          Panel administrativo
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona productos, usuarios, saldo y pedidos
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 min-w-[260px]">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="bg-transparent outline-none text-sm w-full"
          />
        </div>

        <button className="relative rounded-2xl border border-gray-200 bg-white p-3 hover:bg-gray-50 transition">
          <Bell size={20} className="text-gray-700" />
        </button>

        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2">
          <div className="w-10 h-10 rounded-full bg-[#050816] text-white flex items-center justify-center font-bold">
            A
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-gray-900">Administrador</p>
            <p className="text-xs text-gray-500">Control principal</p>
          </div>
        </div>
      </div>
    </header>
  );
}