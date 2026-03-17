"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchRole();
  }, []);

  useEffect(() => {
    if (!quickViewProduct) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickViewProduct(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [quickViewProduct]);

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

  const handleOpenQuickView = (product: Product) => {
    setQuickViewProduct(product);
  };

  const handleCloseQuickView = () => {
    setQuickViewProduct(null);
  };

  const quickViewSelectedVariant =
    quickViewProduct?.product_type === "variable"
      ? getSelectedVariant(quickViewProduct.id)
      : null;

  const quickViewPrice = quickViewProduct
    ? getVisiblePrice(quickViewProduct)
    : 0;

  const quickViewStock = quickViewProduct
    ? getVisibleStock(quickViewProduct)
    : 0;

  return (
    <>
      <main className="min-h-screen bg-transparent text-white">
        <section className="relative overflow-hidden border-b border-white/10 bg-transparent">
          <div className="hero-glow" />

          <div className="relative mx-auto flex min-h-[52vh] max-w-7xl flex-col items-center justify-center px-5 pb-10 pt-12 text-center sm:px-6 md:min-h-[58vh] md:pb-12 md:pt-16">
            <h1 className="text-[2.2rem] font-black leading-none tracking-[-0.03em] text-white sm:text-5xl md:text-6xl lg:text-[4.25rem]">
              STREAMINGMAYOR
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/50 sm:text-base md:mt-5 md:text-lg md:leading-7">
              Plataforma confiable para comprar servicios digitales y entretenimiento de forma segura y rápida.
            </p>

            <div className="mt-7 md:mt-8">
              <a
                href="#catalogo"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-6 text-sm font-bold text-black transition hover:bg-slate-100 md:h-12 md:px-7"
              >
                Explorar catálogo
              </a>
            </div>

            <div className="mt-10 grid w-full gap-4 md:mt-12 md:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4 text-left backdrop-blur md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white md:text-xl">
                      ENTREGA INMEDIATA
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      Recibe tus servicios digitales de forma rápida y sin complicaciones.
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
                    ◧
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4 text-left backdrop-blur md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white md:text-xl">
                      SOPORTE CONFIABLE
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      Estamos disponibles para ayudarte en cada paso de tu compra.
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
                    ✦
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4 text-left backdrop-blur md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white md:text-xl">
                      COMPRA SEGURA
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      Compra con confianza en una plataforma moderna, rápida y confiable.
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
                    ○
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="catalogo" className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14">
          <div className="mb-8 flex flex-col gap-3 md:mb-10">
            <p className="text-2xl font-bold uppercase tracking-[0.14em] text-white md:text-3xl">
              CATÁLOGO
            </p>
            <p className="text-sm leading-6 text-white/62 md:text-base">
              Gran variedad de servicios digitales en un solo lugar.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 md:mb-8 md:grid-cols-[minmax(0,1.2fr)_220px] lg:grid-cols-[minmax(0,1.4fr)_240px]">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4 backdrop-blur-md">
              <div className="mb-3 flex items-center gap-3">
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

                <p className="text-base font-black uppercase tracking-[0.08em] text-white md:text-lg">
                  Búsqueda
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

            <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4 backdrop-blur-md">
              <div className="mb-3 flex items-center gap-3">
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

                <p className="text-base font-black uppercase tracking-[0.08em] text-white md:text-lg">
                  Categoría
                </p>
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white outline-none md:text-base"
              >
                {categories.map((category) => (
                  <option
                    key={category.name}
                    value={category.name}
                    className="bg-[#0d0d0d] text-white"
                  >
                    {category.name} ({category.count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-white/45">
              {loading
                ? "Cargando productos..."
                : `${filteredProducts.length} producto(s) disponibles`}
            </p>
          </div>

          {message && (
            <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
              {message}
            </div>
          )}

          {!loading && filteredProducts.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-md">
              <p className="text-lg font-semibold text-white">
                No encontramos productos con ese filtro
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
                    onClick={() => handleOpenQuickView(product)}
                    className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.035] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/20"
                  >
                    <div className="p-3 pb-0">
                      <div className="aspect-[1/1] w-full overflow-hidden rounded-[18px] bg-white/[0.02]">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white/[0.02]">
                            <div className="text-center">
                              <p className="text-sm font-bold text-white/80 md:text-base">
                                Producto digital
                              </p>
                              <p className="mt-1 text-xs text-white/35">
                                Sin imagen
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-3.5 md:p-4">
                      <div className="flex min-h-[58px] items-start justify-between gap-2">
                        <h3 className="max-w-[72%] text-[12px] font-extrabold uppercase leading-5 text-white sm:text-[13px] md:text-[15px] md:leading-6">
                          {product.name}
                        </h3>

                        <span
                          className={
                            visibleStock > 0
                              ? "shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300"
                              : "shrink-0 rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[10px] font-bold text-red-300"
                          }
                        >
                          {visibleStock > 0 ? "Disp." : "Agotado"}
                        </span>
                      </div>

                      {product.product_type === "variable" && selectedVariant && (
                        <div
                          className="mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={selectedVariants[product.id] || ""}
                            onChange={(e) => handleVariantChange(e, product.id)}
                            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white outline-none md:text-sm"
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

                      <div className="mt-auto border-t border-white/10 pt-3">
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                              Precio
                            </p>
                            <p className="mt-1 text-xl font-black text-white md:text-2xl">
                              ${Number(visiblePrice).toLocaleString()}
                            </p>

                            {isAdmin && (
                              <p className="mt-1 text-xs font-semibold text-white/45">
                                Stock: {visibleStock}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleAddToCart(e, product)}
                            disabled={visibleStock <= 0}
                            className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-white px-3 text-sm font-bold text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {quickViewProduct && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm"
          onClick={handleCloseQuickView}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#0f1115] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseQuickView}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Cerrar vista rápida"
            >
              ×
            </button>

            <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
              <div className="p-4 md:p-6">
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03]">
                  {quickViewProduct.image_url ? (
                    <img
                      src={quickViewProduct.image_url}
                      alt={quickViewProduct.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex min-h-[320px] items-center justify-center bg-white/[0.02] md:min-h-[520px]">
                      <div className="text-center">
                        <p className="text-lg font-bold text-white/80">
                          Producto digital
                        </p>
                        <p className="mt-2 text-sm text-white/35">
                          Sin imagen disponible
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col p-5 md:p-8">
                <div className="border-b border-white/10 pb-5">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-400">
                    Quick View
                  </p>

                  <h2 className="mt-3 text-2xl font-black uppercase leading-tight text-white md:text-4xl">
                    {quickViewProduct.name}
                  </h2>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span
                      className={
                        quickViewStock > 0
                          ? "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300"
                          : "rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs font-bold text-red-300"
                      }
                    >
                      {quickViewStock > 0 ? "Disponible" : "Agotado"}
                    </span>

                    {quickViewProduct.category && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                        {quickViewProduct.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-5 py-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                      Precio
                    </p>
                    <p className="mt-2 text-3xl font-black text-white md:text-4xl">
                      ${Number(quickViewPrice).toLocaleString()}
                    </p>
                  </div>

                  {quickViewProduct.product_type === "variable" && quickViewSelectedVariant && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                        Variante seleccionada
                      </p>
                      <p className="mt-2 text-base font-bold text-white">
                        {quickViewSelectedVariant.name}
                      </p>

                      {quickViewSelectedVariant.description && (
                        <p className="mt-2 text-sm leading-6 text-white/60">
                          {quickViewSelectedVariant.description}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                        Tipo de producto
                      </p>
                      <p className="mt-2 text-sm font-semibold uppercase text-white">
                        {quickViewProduct.product_type || "simple"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                        Disponibilidad
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {quickViewStock > 0
                          ? `${quickViewStock} disponible(s)`
                          : "Sin stock"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                      Descripción
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/65 md:text-[15px]">
                      {quickViewProduct.description?.trim()
                        ? quickViewProduct.description
                        : "Este producto no tiene descripción disponible por el momento."}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-blue-200/70">
                        Información interna
                      </p>
                      <p className="mt-2 text-sm font-semibold text-blue-100">
                        Stock actual: {quickViewStock}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-auto border-t border-white/10 pt-5">
                  <button
                    type="button"
                    onClick={handleCloseQuickView}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-6 text-sm font-bold text-white transition hover:bg-white/[0.09]"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}