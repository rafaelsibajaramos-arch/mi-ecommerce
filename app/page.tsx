"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const PRODUCTS_PER_PAGE = 12;
const SEARCH_DEBOUNCE_MS = 350;

export default function HomePage() {
  const { addToCart } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [variantsMap, setVariantsMap] = useState<
    Record<string, ProductVariant[]>
  >({});
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [categories, setCategories] = useState<CategoryItem[]>([
    { name: "Todas", count: 0 },
  ]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrder | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const catalogRequestIdRef = useRef(0);
  const categoryRequestIdRef = useRef(0);

  const isAbortLikeError = (error: unknown) => {
    if (!error) return false;

    if (error instanceof DOMException && error.name === "AbortError") {
      return true;
    }

    if (error instanceof Error) {
      const text = `${error.name} ${error.message}`.toLowerCase();
      return (
        text.includes("aborterror") ||
        text.includes("aborted") ||
        text.includes("lock request is aborted")
      );
    }

    if (typeof error === "object" && error !== null) {
      const message =
        "message" in error && typeof error.message === "string"
          ? error.message.toLowerCase()
          : "";

      return (
        message.includes("aborterror") ||
        message.includes("aborted") ||
        message.includes("lock request is aborted")
      );
    }

    return false;
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [search]);


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
    const handleReceiptReady = (event: Event) => {
      const customEvent = event as CustomEvent<ReceiptOrder>;

      if (!customEvent.detail) return;

      setReceiptMessage("");
      setQuickViewProduct(null);
      setReceiptOrder(customEvent.detail);
    };

    window.addEventListener("checkout:receipt-ready", handleReceiptReady);

    return () => {
      window.removeEventListener("checkout:receipt-ready", handleReceiptReady);
    };
  }, []);

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

        const productsMap = new Map<string, ReceiptProductRow>();

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

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, debouncedSearch]);

  const fetchRole = useCallback(async () => {
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
  }, []);

  const fetchCategories = useCallback(async () => {
    const requestId = ++categoryRequestIdRef.current;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("category")
          .eq("is_active", true);

        if (requestId !== categoryRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        const counts = new Map<string, number>();

        ((data as { category: string | null }[]) || []).forEach((item) => {
          const category = (item.category || "").trim();
          if (!category) return;
          counts.set(category, (counts.get(category) || 0) + 1);
        });

        const ordered = Array.from(counts.entries())
          .sort((a, b) =>
            a[0].localeCompare(b[0], "es", { sensitivity: "base" })
          )
          .map(([name, count]) => ({ name, count }));

        setCategories([
          {
            name: "Todas",
            count: ((data as { category: string | null }[]) || []).length,
          },
          ...ordered,
        ]);

        return;
      } catch (error) {
        if (requestId !== categoryRequestIdRef.current) {
          return;
        }

        if (isAbortLikeError(error) && attempt === 0) {
          await sleep(350);
          continue;
        }

        return;
      }
    }
  }, []);

  const fetchProductsPage = useCallback(async () => {
    const requestId = ++catalogRequestIdRef.current;

    setLoading(true);
    setMessage("");

    const from = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const to = from + PRODUCTS_PER_PAGE - 1;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let query = supabase
          .from("products")
          .select("*", { count: "exact" })
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (selectedCategory !== "Todas") {
          query = query.eq("category", selectedCategory);
        }

        if (debouncedSearch) {
          const term = debouncedSearch.replace(/[%]/g, "").trim();
          query = query.or(
            `name.ilike.%${term}%,category.ilike.%${term}%,description.ilike.%${term}%`
          );
        }

        const { data, error, count } = await query.range(from, to);

        if (requestId !== catalogRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        const safeProducts = (data as Product[]) || [];
        setProducts(safeProducts);
        setTotalProducts(count || 0);

        const variableProducts = safeProducts.filter(
          (product) => product.product_type === "variable"
        );

        if (variableProducts.length > 0) {
          const productIds = variableProducts.map((product) => product.id);

          const { data: variantsData, error: variantsError } = await supabase
            .from("product_variants")
            .select("*")
            .in("product_id", productIds)
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });

          if (requestId !== catalogRequestIdRef.current) {
            return;
          }

          if (variantsError) {
            throw variantsError;
          }

          const grouped: Record<string, ProductVariant[]> = {};
          const nextSelected: Record<string, string> = {};

          ((variantsData as ProductVariant[]) || []).forEach((variant) => {
            if (!grouped[variant.product_id]) {
              grouped[variant.product_id] = [];
            }
            grouped[variant.product_id].push(variant);
          });

          setSelectedVariants((prev) => {
            Object.entries(grouped).forEach(([productId, variants]) => {
              const previousSelection = prev[productId];
              const stillExists = variants.some(
                (variant) => variant.id === previousSelection
              );

              if (stillExists && previousSelection) {
                nextSelected[productId] = previousSelection;
              } else if (variants.length > 0) {
                nextSelected[productId] = variants[0].id;
              }
            });

            return nextSelected;
          });

          setVariantsMap(grouped);
        } else {
          setVariantsMap({});
          setSelectedVariants({});
        }

        setLoading(false);
        return;
      } catch (error) {
        if (requestId !== catalogRequestIdRef.current) {
          return;
        }

        if (isAbortLikeError(error) && attempt === 0) {
          await sleep(400);
          continue;
        }

        setMessage(
          `Error cargando productos: ${
            error instanceof Error ? error.message : "Error desconocido"
          }`
        );
        setProducts([]);
        setVariantsMap({});
        setSelectedVariants({});
        setTotalProducts(0);
        setLoading(false);
        return;
      }
    }
  }, [currentPage, debouncedSearch, selectedCategory]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      await fetchRole();
      if (!mounted) return;
      await fetchCategories();
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [fetchCategories, fetchRole]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      await fetchProductsPage();
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [fetchProductsPage]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
  }, [totalProducts]);

  const visibleRange = useMemo(() => {
    if (totalProducts === 0) {
      return { start: 0, end: 0 };
    }

    const start = (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
    const end = Math.min(currentPage * PRODUCTS_PER_PAGE, totalProducts);

    return { start, end };
  }, [totalProducts, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  const renderProductCard = (product: Product) => {
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
        className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-blue-400/30 hover:shadow-[0_20px_80px_rgba(59,130,246,0.12)] sm:rounded-[22px]"
      >
        <div className="p-2 pb-0 sm:p-3 sm:pb-0">
          <div className="relative aspect-square w-full overflow-hidden rounded-[14px] bg-gradient-to-b from-white/[0.05] to-white/[0.02] sm:rounded-[18px]">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(max-width: 639px) 50vw, (max-width: 1279px) 33vw, 25vw"
                className="object-contain p-2 transition duration-500 group-hover:scale-[1.04] sm:p-3"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/[0.02]">
                <div className="text-center">
                  <p className="text-xs font-bold text-white/80 sm:text-sm">
                    Producto digital
                  </p>
                  <p className="mt-1 text-[10px] text-white/35 sm:text-xs">
                    Sin imagen
                  </p>
                </div>
              </div>
            )}

            <div className="absolute left-2 top-2 z-10 sm:left-3 sm:top-3">
              <span
                className={
                  visibleStock > 0
                    ? "inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 sm:px-2.5 sm:py-1 sm:text-[10px]"
                    : "inline-flex rounded-full border border-red-400/20 bg-red-400/10 px-2 py-0.5 text-[9px] font-bold text-red-300 sm:px-2.5 sm:py-1 sm:text-[10px]"
                }
              >
                {visibleStock > 0 ? "Disponible" : "Agotado"}
              </span>
            </div>

            {isAdmin && (
              <Link
                href={`/admin/products/${product.id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Editar ${product.name}`}
                className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:scale-105 hover:bg-white hover:text-black sm:right-3 sm:top-3 sm:h-10 sm:w-10"
                title="Editar producto"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-2.5 sm:p-4">
          <div className="min-h-[48px] sm:min-h-[58px]">
            <p className="text-[8px] uppercase tracking-[0.12em] text-blue-400/80 sm:text-[10px] sm:tracking-[0.18em]">
              {(product.category || "Producto digital").toUpperCase()}
            </p>

            <h3 className="mt-1 h-[34px] overflow-hidden text-[11px] font-extrabold uppercase leading-4 text-white sm:mt-2 sm:h-auto sm:text-[13px] sm:leading-5 md:text-[15px] md:leading-6">
              {product.name}
            </h3>
          </div>

          {product.product_type === "variable" && selectedVariant && (
            <div className="mt-2 sm:mt-3" onClick={(e) => e.stopPropagation()}>
              <select
                value={selectedVariants[product.id] || ""}
                onChange={(e) => handleVariantChange(e, product.id)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-white outline-none sm:px-3 sm:text-sm"
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

          <div className="mt-auto border-t border-white/10 pt-2.5 sm:pt-4">
            <p className="text-[8px] uppercase tracking-[0.12em] text-white/30 sm:text-[10px] sm:tracking-[0.18em]">
              Precio
            </p>

            <p className="mt-1 text-lg font-black text-white sm:text-xl md:text-2xl">
              ${formatPrice(visiblePrice)}
            </p>

            {isAdmin && (
              <p className="mt-1 text-[10px] font-semibold text-white/45 sm:text-xs">
                Stock: {visibleStock}
              </p>
            )}

            <button
              type="button"
              onClick={(e) => handleAddToCart(e, product)}
              disabled={visibleStock <= 0}
              className="mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-2xl bg-white px-2 text-[11px] font-bold text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-4 sm:h-11 sm:px-3 sm:text-sm"
            >
              Añadir al carrito
            </button>
          </div>
        </div>
      </article>
    );
  };

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
                Ver catálogo
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
          <div className="mb-8 flex flex-col gap-3 md:mb-10 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-black uppercase tracking-[0.14em] text-white md:text-3xl">
              CATÁLOGO
            </h2>

            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70">
              {loading ? "Cargando..." : `${totalProducts} producto(s)`}
            </div>
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

          <div className="grid gap-6 md:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="md:sticky md:top-24 md:self-start">
              <div className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.035] backdrop-blur-md">
                <div className="border-b border-white/10 p-5">
                  <h3 className="text-xl font-black uppercase text-white">
                    Categorías
                  </h3>
                </div>

                <div className="max-h-[520px] overflow-y-auto p-3">
                  <div className="space-y-2">
                    {categories.map((category) => {
                      const isActive = selectedCategory === category.name;

                      return (
                        <button
                          key={category.name}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(category.name);
                            setCurrentPage(1);
                          }}
                          className={
                            isActive
                              ? "flex w-full items-center justify-between rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-3 text-left text-sm font-bold text-white transition"
                              : "flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                          }
                        >
                          <span className="truncate pr-3">{category.name}</span>
                          <span
                            className={
                              isActive
                                ? "rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-blue-200"
                                : "rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/55"
                            }
                          >
                            {category.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="mb-6 rounded-[26px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-md md:p-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-blue-400">
                      Búsqueda
                    </p>

                    <div className="rounded-[18px] border border-blue-500/40 bg-white/[0.03] px-4 py-3 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]">
                      <div className="flex items-center gap-3">
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

                        <input
                          type="text"
                          placeholder="Buscar productos..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35 md:text-base"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
                    Mostrando{" "}
                    <span className="font-bold text-white">
                      {visibleRange.start}
                    </span>
                    -
                    <span className="font-bold text-white">
                      {visibleRange.end}
                    </span>{" "}
                    de{" "}
                    <span className="font-bold text-white">
                      {totalProducts}
                    </span>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                  <p className="text-lg font-semibold text-white">
                    Cargando productos...
                  </p>
                </div>
              ) : products.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                  <p className="text-lg font-semibold text-white">
                    No encontramos productos con ese filtro
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4 xl:gap-4">
                    {products.map((product) => renderProductCard(product))}
                  </div>

                  {totalProducts > PRODUCTS_PER_PAGE && (
                    <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md sm:flex-row">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentPage((prev) => Math.max(prev - 1, 1))
                        }
                        disabled={currentPage === 1}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Anterior
                      </button>

                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {Array.from(
                          { length: totalPages },
                          (_, index) => index + 1
                        ).map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={
                              currentPage === page
                                ? "flex h-11 min-w-[44px] items-center justify-center rounded-2xl bg-white px-4 text-sm font-black text-black"
                                : "flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                            }
                          >
                            {page}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setCurrentPage((prev) =>
                            Math.min(prev + 1, totalPages)
                          )
                        }
                        disabled={currentPage === totalPages}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
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
                        <div className="relative h-[176px] w-full sm:h-[224px] md:h-[365px]">
                          <Image
                            src={quickViewProduct.image_url}
                            alt={quickViewProduct.name}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-contain"
                            priority
                          />
                        </div>
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
                      <h2 className="text-[2rem] font-black uppercase leading-tight text-white sm:text-[2.4rem] md:text-[3.1rem]">
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
                              Variante
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