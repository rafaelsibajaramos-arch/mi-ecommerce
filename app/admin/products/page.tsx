"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  created_at?: string;
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("No se pudieron cargar los productos: " + error.message);
      setProducts([]);
      setLoading(false);
      return;
    }

    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar este producto?"
    );

    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      setMessage("No se pudo eliminar el producto: " + error.message);
      return;
    }

    setProducts((prev) => prev.filter((item) => item.id !== id));
    setMessage("Producto eliminado correctamente.");
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const formatPrice = (value: number) => {
    return `$${Number(value || 0).toLocaleString("es-CO")}`;
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      !normalizedSearch ||
      product.name.toLowerCase().includes(normalizedSearch) ||
      (product.description || "").toLowerCase().includes(normalizedSearch) ||
      (product.category || "").toLowerCase().includes(normalizedSearch);

    const matchesStock = !onlyOutOfStock || (product.stock ?? 0) <= 0;

    return matchesSearch && matchesStock;
  });

  return (
    <div className="space-y-5 sm:space-y-6 text-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Admin
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
            Productos
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-[15px] text-slate-600">
            Gestiona todos los productos de tu tienda.
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Nuevo producto
        </Link>
      </div>

      {message && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Total
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {products.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Activos
          </p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600">
            {products.filter((product) => product.is_active).length}
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Sin stock
          </p>
          <p className="mt-2 text-2xl font-extrabold text-rose-600">
            {products.filter((product) => (product.stock ?? 0) <= 0).length}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex-1">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, descripción o categoría..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOnlyOutOfStock((prev) => !prev)}
            className={`inline-flex min-h-[48px] items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              onlyOutOfStock
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Solo sin stock
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] sm:rounded-[28px] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-5 sm:p-6 text-sm text-slate-600">
            Cargando productos...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-5 sm:p-6 text-sm text-slate-600">
            {products.length === 0
              ? "No hay productos creados todavía."
              : "No se encontraron productos con esos filtros."}
          </div>
        ) : (
          <>
            {/* MOBILE */}
            <div className="grid gap-4 p-4 sm:p-5 md:hidden">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-16 w-16 rounded-xl border border-slate-200 object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[11px] text-slate-400">
                        Sin img
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 break-words">
                          {product.name}
                        </p>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            product.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {product.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {product.description || "Sin descripción"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Categoría
                      </p>
                      <p className="mt-1 font-medium text-slate-700">
                        {product.category || "Sin categoría"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Stock
                      </p>
                      <p className="mt-1 font-medium text-slate-700">
                        {product.stock ?? 0}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Precio
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatPrice(product.price)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Editar
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDelete(product.id)}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* TABLET / DESKTOP */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left text-sm text-slate-600">
                    <th className="px-5 py-4 font-semibold">Producto</th>
                    <th className="px-5 py-4 font-semibold">Categoría</th>
                    <th className="px-5 py-4 font-semibold">Precio</th>
                    <th className="px-5 py-4 font-semibold">Stock</th>
                    <th className="px-5 py-4 font-semibold">Estado</th>
                    <th className="px-5 py-4 font-semibold">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="border-t border-slate-200 text-sm text-slate-700"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-12 w-12 rounded-xl border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-400">
                              Sin img
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {product.name}
                            </p>
                            <p className="max-w-[320px] truncate text-xs text-slate-500">
                              {product.description || "Sin descripción"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {product.category || "Sin categoría"}
                      </td>

                      <td className="px-5 py-4">
                        {formatPrice(product.price)}
                      </td>

                      <td className="px-5 py-4">{product.stock ?? 0}</td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            product.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {product.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Editar
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleDelete(product.id)}
                            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}