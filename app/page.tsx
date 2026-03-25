"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import Footer from "../components/Footer";
import WhatsAppButton from "../components/WhatsAppButton";
import OrderReceiptModal, {
  type ReceiptOrder,
} from "../components/OrderReceiptModal";

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
  fallback_to_general_licenses?: boolean;
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

type ReceiptOrderRow = {
  id: string;
  order_number: number | null;
  user_id: string;
  total: number;
  status: string | null;
  created_at: string;
};

type ReceiptOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | null;
  product_name: string | null;
  variant_name: string | null;
};

type ReceiptProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
};

type ReceiptLicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  license_text: string;
  status: string;
  assigned_order_id: string | null;
  assigned_order_item_id: string | null;
  assigned_user_id: string | null;
};

export default function HomePage() {
  const { addToCart } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [variantsMap, setVariantsMap] = useState<
    Record<string, ProductVariant[]>
  >({});
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrder | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchRole();
  }, []);

  const formatPrice = (value: number | string | null | undefined) => {
    const numericValue = Math.round(Number(value || 0));
    return numericValue.toLocaleString("es-CO");
  };

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

  useEffect(() => {
    const pendingOrderId = sessionStorage.getItem("recentOrderReceiptId");
    if (!pendingOrderId) return;

    sessionStorage.removeItem("recentOrderReceiptId");

    let cancelled = false;

    const loadRecentOrderReceipt = async () => {
      try {
        setReceiptMessage("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          return;
        }

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("id, order_number, user_id, total, status, created_at")
          .eq("id", pendingOrderId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (orderError || !orderData) {
          if (!cancelled) {
            setReceiptMessage(
              "La compra fue exitosa, pero no se pudo abrir automáticamente el comprobante."
            );
          }
          return;
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from("order_items")
          .select(
            "id, order_id, product_id, quantity, unit_price, product_name, variant_name"
          )
          .eq("order_id", orderData.id);

        if (itemsError) {
          if (!cancelled) {
            setReceiptMessage(
              "La compra fue exitosa, pero no se pudo cargar el detalle del comprobante."
            );
          }
          return;
        }

        const rawItems = (itemsData as ReceiptOrderItemRow[]) || [];
        const productIds = Array.from(
          new Set(rawItems.map((item) => item.product_id).filter(Boolean))
        );

        let productsMap = new Map<string, ReceiptProductRow>();

        if (productIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from("products")
            .select("id, name, description, category")
            .in("id", productIds);

          if (productsError) {
            if (!cancelled) {
              setReceiptMessage(
                "La compra fue exitosa, pero no se pudo cargar la información de los productos del comprobante."
              );
            }
            return;
          }

          ((productsData as ReceiptProductRow[]) || []).forEach((product) => {
            productsMap.set(product.id, product);
          });
        }

        const { data: licensesData, error: licensesError } = await supabase
          .from("product_licenses")
          .select(
            "id, product_id, variant_id, license_text, status, assigned_order_id, assigned_order_item_id, assigned_user_id"
          )
          .eq("assigned_order_id", orderData.id)
          .eq("assigned_user_id", user.id)
          .eq("status", "assigned");

        if (licensesError) {
          if (!cancelled) {
            setReceiptMessage(
              "La compra fue exitosa, pero no se pudieron cargar las licencias del comprobante."
            );
          }
          return;
        }

        const rawLicenses = (licensesData as ReceiptLicenseRow[]) || [];

        const builtOrder: ReceiptOrder = {
          id: orderData.id,
          order_number: orderData.order_number,
          total: Number(orderData.total || 0),
          status: orderData.status || "completed",
          created_at: orderData.created_at,
          items: rawItems.map((item) => {
            const product = productsMap.get(item.product_id);

            const itemLicenses = rawLicenses.filter((license) => {
              if (license.assigned_order_item_id) {
                return license.assigned_order_item_id === item.id;
              }

              return (
                license.assigned_order_id === orderData.id &&
                license.product_id === item.product_id
              );
            });

            return {
              id: item.id,
              quantity: Number(item.quantity || 0),
              price: Number(item.unit_price || 0),
              product_id: item.product_id,
              product_name: item.product_name || product?.name || "Producto",
              variant_name: item.variant_name || null,
              product_description: product?.description || null,
              product_category: product?.category || null,
              licenses: itemLicenses.map((license) => ({
                id: license.id,
                license_text: license.license_text,
              })),
            };
          }),
        };

        if (!cancelled) {
          setQuickViewProduct(null);
          setReceiptOrder(builtOrder);
        }
      } catch {
        if (!cancelled) {
          setReceiptMessage(
            "La compra fue exitosa, pero ocurrió un error abriendo el comprobante."
          );
        }
      }
    };

    loadRecentOrderReceipt();

    return () => {
      cancelled = true;
    };
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
    return (
      variants.find((variant) => variant.id === selectedVariantId) || null
    );
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
      const variantStock = Number(selectedVariant?.stock ?? 0);
      const generalStock =
        product.fallback_to_general_licenses === false
          ? 0
          : Number(product.stock ?? 0);

      return variantStock + generalStock;
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

      const variantStock = Number(selectedVariant?.stock ?? 0);
      const generalStock =
        product.fallback_to_general_licenses === false
          ? 0
          : Number(product.stock ?? 0);

      const availableStock = variantStock + generalStock;

      if (!selectedVariant || availableStock <= 0) return;

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

    if (Number(product.stock) <= 0) return;

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
              Plataforma confiable para comprar servicios digitales y
              entretenimiento de forma segura y rápida.
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
                      Recibe tus servicios digitales de forma rápida y sin
                      complicaciones.
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
                      Estamos disponibles para ayudarte en cada paso de tu
                      compra.
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
                      Compra con confianza en una plataforma moderna, rápida y
                      confiable.
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

        <section
          id="catalogo"
          className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-14"
        >
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

          {receiptMessage && (
            <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
              {receiptMessage}
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
                              ${formatPrice(visiblePrice)}
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

      <Footer />
      <WhatsAppButton />

      {quickViewProduct && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
          onClick={handleCloseQuickView}
        >
          <div className="flex min-h-full items-start justify-center px-3 pb-3 pt-24 sm:px-4 sm:pt-28 md:items-center md:py-6">
            <div
              className="relative w-full max-w-[57.6rem] overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0f1a] shadow-2xl md:max-h-[75vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleCloseQuickView}
                className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 text-xl text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label="Cerrar vista rápida"
              >
                ×
              </button>

              <div className="max-h-[calc(100vh-10rem)] overflow-y-auto md:max-h-[75vh]">
                <div className="grid md:grid-cols-2">
                  <div className="p-3 sm:p-4 md:p-5">
                    <div className="overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03]">
                      {quickViewProduct.image_url ? (
                        <img
                          src={quickViewProduct.image_url}
                          alt={quickViewProduct.name}
                          className="h-[176px] w-full object-contain sm:h-[224px] md:h-[365px]"
                        />
                      ) : (
                        <div className="flex h-[176px] items-center justify-center bg-white/[0.02] sm:h-[224px] md:h-[365px]">
                          <div className="text-center">
                            <p className="text-base font-bold text-white/80">
                              Producto digital
                            </p>
                            <p className="mt-1 text-sm text-white/35">
                              Sin imagen disponible
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col p-4 sm:p-5 md:p-6">
                    <div className="border-b border-white/10 pb-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-400">
                        Quick View
                      </p>

                      <h2 className="mt-3 text-[2rem] font-black uppercase leading-tight text-white sm:text-[2.4rem] md:text-[3.1rem]">
                        {quickViewProduct.name}
                      </h2>

                      <div className="mt-4">
                        <span
                          className={
                            quickViewStock > 0
                              ? "inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300"
                              : "inline-flex rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs font-bold text-red-300"
                          }
                        >
                          {quickViewStock > 0 ? "Disponible" : "Agotado"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 py-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                          Precio
                        </p>
                        <p className="mt-2 text-4xl font-black text-white sm:text-5xl md:text-6xl">
                          ${formatPrice(quickViewPrice)}
                        </p>
                      </div>

                      {quickViewProduct.product_type === "variable" &&
                        quickViewSelectedVariant && (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                              Variante seleccionada
                            </p>
                            <p className="mt-2 text-lg font-bold text-white">
                              {quickViewSelectedVariant.name}
                            </p>
                          </div>
                        )}

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                          Descripción
                        </p>
                        <p className="mt-3 text-sm leading-6 text-white/65 md:text-[15px]">
                          {quickViewProduct.description?.trim()
                            ? quickViewProduct.description
                            : "Este producto no tiene descripción disponible por el momento."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto border-t border-white/10 pt-4">
                      <button
                        type="button"
                        onClick={handleCloseQuickView}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-6 text-sm font-bold text-white transition hover:bg-white/[0.09] sm:w-auto"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <OrderReceiptModal
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
      />
    </>
  );
}