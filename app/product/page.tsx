"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

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

export default function ProductPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Error cargando productos: " + error.message);
      setLoading(false);
      return;
    }

    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(
        products
          .map((product) => (product.category || "").trim())
          .filter(Boolean)
      )
    );

    return ["Todas", ...uniqueCategories];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.category || "").toLowerCase().includes(term) ||
        (product.description || "").toLowerCase().includes(term);

      const matchesCategory =
        selectedCategory === "Todas" ||
        (product.category || "").trim() === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  return (
    <main className="min-h-screen bg-transparent text-white">
      <section className="relative overflow-hidden border-b border-white/10">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.02),transparent_26%)]" />
  <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:44px_44px]" />

  <div className="relative mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.28em] text-white/45">
              Catálogo
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              Productos digitales con una presentación premium
            </h1>

            <p className="mt-5 text-lg leading-8 text-white/65">
              Explora tu catálogo en una vista más limpia, elegante y profesional
              para el público.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 md:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-md">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/40">
                Buscar
              </p>

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <input
                  type="text"
                  placeholder="Busca por nombre o categoría"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/40">
                Categorías
              </p>

              <div className="mt-3 space-y-2">
                {categories.map((category) => {
                  const active = selectedCategory === category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={
                        active
                          ? "w-full rounded-2xl border border-white/20 bg-white/[0.08] px-4 py-3 text-left text-sm font-semibold text-white transition"
                          : "w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                      }
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-white/45">
                  {loading
                    ? "Cargando productos..."
                    : `${filteredProducts.length} producto(s) disponibles`}
                </p>
              </div>
            </div>

            {message && (
              <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
                {message}
              </div>
            )}

            {!loading && filteredProducts.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                <p className="text-lg font-semibold text-white">
                  No encontramos productos con ese filtro
                </p>
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <article
                    key={product.id}
                    className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/20"
                  >
                    <div className="relative">
                      <div className="h-56 w-full overflow-hidden bg-white/[0.02]">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <div className="text-center">
                              <p className="text-lg font-bold text-white/80">
                                {product.category || "Producto digital"}
                              </p>
                              <p className="mt-1 text-sm text-white/35">
                                Sin imagen
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="flex min-h-[64px] items-start justify-between gap-3">
                        <h3 className="text-lg font-bold leading-7 text-white">
                          {product.name}
                        </h3>

                        <span
                          className={
                            product.stock > 0
                              ? "shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300"
                              : "shrink-0 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[11px] font-bold text-red-300"
                          }
                        >
                          {product.stock > 0 ? "Disponible" : "Agotado"}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 min-h-[48px] text-sm leading-6 text-white/58">
                        {product.description ||
                          "Producto digital disponible para compra dentro de la plataforma."}
                      </p>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/70">
                          Stock: {product.stock}
                        </span>

                        {product.category && (
                          <span className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/70">
                            {product.category}
                          </span>
                        )}
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                            Precio
                          </p>
                          <p className="mt-1 text-2xl font-black text-white">
                            ${Number(product.price).toLocaleString()}
                          </p>
                        </div>

                        <Link
                          href={`/product/${product.id}`}
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-bold text-black transition hover:bg-slate-100"
                        >
                          Ver producto
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}