"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";

type ProductType = "simple" | "variable" | "composite";

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
  product_type?: ProductType;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  sort_order: number;
};

type CategoryItem = {
  name: string;
  count: number;
};

export default function HomePage() {
  const router = useRouter();
  const { addToCart } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [variantsMap, setVariantsMap] = useState<Record<string, ProductVariant[]>>(
    {}
  );
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(
    {}
  );
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchRole();
  }, []);

  const fetchRole = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsAdmin(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    setIsAdmin(data?.role === "admin");
  };

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

    const safeProducts = (data as Product[]) || [];
    setProducts(safeProducts);

    const variableProducts = safeProducts.filter(
      (product) => product.product_type === "variable"
    );

    if (variableProducts.length > 0) {
      const productIds = variableProducts.map((product) => product.id);

      const { data: variantsData } = await supabase
        .from("product_variants")
        .select("*")
        .in("product_id", productIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      const grouped: Record<string, ProductVariant[]> = {};
      const initialSelected: Record<string, string> = {};

      ((variantsData as ProductVariant[]) || []).forEach((variant) => {
        if (!grouped[variant.product_id]) {
          grouped[variant.product_id] = [];
        }
        grouped[variant.product_id].push(variant);
      });

      Object.entries(grouped).forEach(([productId, variants]) => {
        if (variants.length > 0) {
          initialSelected[productId] = variants[0].id;
        }
      });

      setVariantsMap(grouped);
      setSelectedVariants(initialSelected);
    } else {
      setVariantsMap({});
      setSelectedVariants({});
    }

    setLoading(false);
  };

  const categories = useMemo<CategoryItem[]>(() => {
    const counts = new Map<string, number>();

    products.forEach((product) => {
      const category = (product.category || "").trim();
      if (!category) return;
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    const ordered = Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));

    return [{ name: "Todas", count: products.length }, ...ordered];
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

  const getSelectedVariant = (productId: string) => {
    const variants = variantsMap[productId] || [];
    const selectedVariantId = selectedVariants[productId];
    return variants.find((variant) => variant.id === selectedVariantId) || null;
  };

  const getVisiblePrice = (product: Product) => {
    if (product.product_type === "variable") {
      const selectedVariant = getSelectedVariant(product.id);
      return Number(selectedVariant?.price ?? product.price);
    }
    return Number(product.price);
  };

  const getVisibleStock = (product: Product) => {
    if (product.product_type === "variable") {
      const selectedVariant = getSelectedVariant(product.id);
      return Number(selectedVariant?.stock ?? 0);
    }
    return Number(product.stock);
  };

  const handleVariantChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
    productId: string
  ) => {
    e.stopPropagation();

    setSelectedVariants((prev) => ({
      ...prev,
      [productId]: e.target.value,
    }));
  };

  const handleAddToCart = (
    e: React.MouseEvent<HTMLButtonElement>,
    product: Product
  ) => {
    e.stopPropagation();

    if (product.product_type === "variable") {
      const selectedVariant = getSelectedVariant(product.id);

      if (!selectedVariant || Number(selectedVariant.stock) <= 0) return;

      addToCart({
        id: product.id,
        name: `${product.name} - ${selectedVariant.name}`,
        price: Number(selectedVariant.price),
        image: product.image_url || "",
        description: selectedVariant.description || product.description || "",
        variantId: selectedVariant.id,
        variantName: selectedVariant.name,
      });

      return;
    }

    if (product.stock <= 0) return;

    addToCart({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || "",
      description: product.description || "",
      variantId: null,
      variantName: null,
    });
  };

  const handleOpenProduct = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  return (
    <main className="min-h-screen bg-transparent text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-transparent">
        <div className="hero-glow"></div>

        <div className="relative mx-auto flex min-h-[62vh] max-w-7xl flex-col items-center justify-center px-5 pb-14 pt-16 text-center sm:px-6 md:min-h-[70vh] md:pb-16 md:pt-20">
          <h1 className="text-4xl font-extrabold leading-none tracking-[0.01em] sm:text-5xl md:text-6xl lg:text-7xl">
            STREAMINGMAYOR
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-white/60 sm:text-lg md:mt-6 md:text-xl">
            Plataforma confiable para comprar servicios digitales,
            entretenimiento y productos online de forma segura y rápida.
          </p>

          <div className="mt-8 md:mt-10">
            <a
              href="#catalogo"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-7 text-sm font-bold text-black transition hover:bg-slate-100 md:h-14 md:px-8 md:text-base"
            >
              Explorar catálogo
            </a>
          </div>

          <div className="mt-12 grid w-full gap-5 md:mt-14 md:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.02] p-5 text-left backdrop-blur md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-white md:text-2xl">
                    ENTREGA INMEDIATA
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/55 md:text-base md:leading-7">
                    Recibe tus servicios digitales de forma rápida y sin
                    complicaciones.
                  </p>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 md:h-11 md:w-11">
                  ◧
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.02] p-5 text-left backdrop-blur md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-white md:text-2xl">
                    SOPORTE CONFIABLE
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/55 md:text-base md:leading-7">
                    Estamos disponibles para ayudarte en cada paso de tu compra.
                  </p>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 md:h-11 md:w-11">
                  ✦
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.02] p-5 text-left backdrop-blur md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-white md:text-2xl">
                    COMPRA SEGURA
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/55 md:text-base md:leading-7">
                    Compra con confianza en una plataforma rápida, moderna y confiable.
                  </p>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 md:h-11 md:w-11">
                  ○
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="catalogo" className="mx-auto max-w-7xl px-5 py-14 md:px-6 md:py-16">
        <div className="mb-10 max-w-2xl">
          <p className="text-2xl font-bold uppercase tracking-[0.16em] text-white md:text-3xl">
            CATÁLOGO
          </p>
          <p className="mt-4 text-base leading-7 text-white/62 md:text-lg">
            Gran variedad de servicios digitales en un solo lugar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[26px] border border-white/10 bg-white/[0.025] p-5 backdrop-blur-md md:p-6">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <svg
                  className="h-5 w-5 text-blue-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7"></circle>
                  <path d="m20 20-3.5-3.5"></path>
                </svg>

                <p className="text-lg font-black uppercase tracking-[0.08em] text-white md:text-xl">
                  BÚSQUEDA
                </p>
              </div>

              <div className="rounded-[18px] border border-blue-500 bg-white/[0.03] px-4 py-3 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Filtrar productos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35 md:text-base"
                  />

                  <svg
                    className="h-5 w-5 shrink-0 text-blue-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="7"></circle>
                    <path d="m20 20-3.5-3.5"></path>
                  </svg>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-4 flex items-center gap-3">
                <svg
                  className="h-5 w-5 text-blue-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                </svg>

                <p className="text-lg font-black uppercase tracking-[0.08em] text-white md:text-xl">
                  CATEGORÍAS
                </p>
              </div>

              <div className="space-y-2">
                {categories.map((category) => {
                  const active = selectedCategory === category.name;

                  return (
                    <button
                      key={category.name}
                      type="button"
                      onClick={() => setSelectedCategory(category.name)}
                      className={
                        active
                          ? "flex w-full items-center justify-between rounded-2xl bg-blue-950/80 px-4 py-3 text-left text-sm font-semibold text-blue-300 transition"
                          : "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                      }
                    >
                      <span className="truncate pr-3">{category.name}</span>

                      <span
                        className={
                          active
                            ? "flex h-7 min-w-7 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-bold text-white/80"
                            : "flex h-7 min-w-7 items-center justify-center rounded-full bg-white/[0.06] px-2 text-xs font-bold text-white/45"
                        }
                      >
                        {category.count}
                      </span>
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
                {filteredProducts.map((product) => {
                  const selectedVariant =
                    product.product_type === "variable"
                      ? getSelectedVariant(product.id)
                      : null;

                  const visiblePrice = getVisiblePrice(product);
                  const visibleStock = getVisibleStock(product);

                  return (
                    <article
                      key={product.id}
                      onClick={() => handleOpenProduct(product.id)}
                      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.035] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/20"
                    >
                      <div className="p-4 pb-0">
                        <div className="aspect-square w-full overflow-hidden rounded-[20px]">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white/[0.02]">
                              <div className="text-center">
                                <p className="text-lg font-bold text-white/80 md:text-xl">
                                  Producto digital
                                </p>
                                <p className="mt-1 text-sm text-white/35">
                                  Sin imagen
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex min-h-[64px] items-start justify-between gap-3">
                          <h3 className="max-w-[70%] text-[15px] font-extrabold uppercase leading-6 text-white md:text-[17px] md:leading-7">
                            {product.name}
                          </h3>

                          <span
                            className={
                              visibleStock > 0
                                ? "shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300"
                                : "shrink-0 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[11px] font-bold text-red-300"
                            }
                          >
                            {visibleStock > 0 ? "Disponible" : "Agotado"}
                          </span>
                        </div>

                        {product.product_type === "variable" && selectedVariant && (
                          <div
                            className="mt-3 flex items-center gap-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={selectedVariants[product.id] || ""}
                              onChange={(e) => handleVariantChange(e, product.id)}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-white outline-none"
                            >
                              {(variantsMap[product.id] || []).map((variant) => (
                                <option
                                  key={variant.id}
                                  value={variant.id}
                                  className="bg-[#0d0d0d] text-white"
                                >
                                  {variant.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="mt-auto border-t border-white/10 pt-5">
                          <div className="flex items-end justify-between gap-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.20em] text-white/30">
                                Precio
                              </p>
                              <p className="mt-1 text-xl font-black text-white md:text-2xl">
                                ${Number(visiblePrice).toLocaleString()}
                              </p>

                              {isAdmin && (
                                <p className="mt-2 text-xs font-semibold text-white/45">
                                  Stock: {visibleStock}
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleAddToCart(e, product)}
                              disabled={visibleStock <= 0}
                              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-bold text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 md:h-12 md:px-5"
                            >
                              Agregar al carrito
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}