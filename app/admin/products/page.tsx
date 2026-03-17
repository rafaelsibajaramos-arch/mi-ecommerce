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
  created_at: string;
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Error cargando productos: " + error.message);
      setLoading(false);
      return;
    }

    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(`¿Seguro que deseas eliminar "${name}"?`);
    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      setMessage("Error eliminando producto: " + error.message);
      return;
    }

    setMessage(`Producto eliminado: ${name}`);
    fetchProducts();
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Admin
          </p>

          <h1 className="mt-2 text-4xl font-extrabold text-gray-900">
            Productos
          </h1>

          <p className="mt-3 text-gray-600">
            Gestiona los productos de tu tienda.
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="rounded-2xl bg-[#050816] px-5 py-3 font-semibold text-white"
        >
          Nuevo producto
        </Link>
      </div>

      {message && (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-gray-600">Cargando productos...</div>
        ) : products.length === 0 ? (
          <div className="p-6 text-gray-600">No hay productos creados aún.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b bg-gray-50">
                <tr className="text-left text-sm text-gray-600">
                  <th className="px-4 py-3 font-semibold">Imagen</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Precio</th>
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-14 w-14 rounded-xl border object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border bg-gray-100 text-xs text-gray-400">
                          Sin imagen
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">
                        {product.name}
                      </div>
                      <div className="line-clamp-1 text-sm text-gray-500">
                        {product.description || "Sin descripción"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      {product.category || "Sin categoría"}
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      ${Number(product.price).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-gray-700">{product.stock}</td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          product.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {product.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="rounded-xl border px-3 py-2 text-sm font-medium text-gray-700"
                        >
                          Editar
                        </Link>

                        <button
                          onClick={() =>
                            handleDelete(product.id, product.name)
                          }
                          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600"
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
        )}
      </div>
    </div>
  );
}