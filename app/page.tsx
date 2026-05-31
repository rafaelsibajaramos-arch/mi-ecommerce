"use client";

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

type ProductImageProps = {
  src: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
};

function ProductImage({
  src,
  alt,
  className = "h-full w-full object-contain",
  fallbackClassName = "flex h-full w-full items-center justify-center bg-white/[0.02]",
  fallbackTitle = "Producto digital",
  fallbackSubtitle = "Sin imagen disponible",
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src?.trim();

  if (!imageSrc || failed) {
    return (
      <div className={fallbackClassName}>
        <div className="text-center">
          <p className="text-xs font-bold text-white/80 sm:text-sm">
            {fallbackTitle}
          </p>
          <p className="mt-1 text-[10px] text-white/35 sm:text-xs">
            {fallbackSubtitle}
          </p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

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
  image_url?: string | null;
  is_active: boolean;
  sort_order: number;
};

type CatalogItem = {
  product: Product;
  variant: ProductVariant | null;
  catalogId: string;
  displayName: string;
  displayDescription: string | null;
  displayPrice: number;
  displayStock: number;
  displayImageUrl: string | null;
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
const ADMIN_CACHE_KEY = "streamingmayor_is_admin";

export default function HomePage() {
  const { addToCart } = useCart();

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
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
  const [quickViewItem, setQuickViewItem] = useState<CatalogItem | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrder | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const catalogRequestIdRef = useRef(0);
  const categoryRequestIdRef = useRef(0);
  const roleRequestIdRef = useRef(0);

  useEffect(() => {
    try {
      const cachedAdmin = window.localStorage.getItem(ADMIN_CACHE_KEY);

      if (cachedAdmin === "true") {
        setIsAdmin(true);
      }
    } catch {
      // Ignora errores de localStorage.
    }
  }, []);

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
    if (!quickViewItem) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickViewItem(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [quickViewItem]);

  useEffect(() => {
    const handleReceiptReady = (event: Event) => {
      const customEvent = event as CustomEvent<ReceiptOrder>;

      if (!customEvent.detail) return;

      setReceiptMessage("");
      setQuickViewItem(null);
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
          setQuickViewItem(null);
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
    const requestId = ++roleRequestIdRef.current;

    try {
      let currentUser = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        currentUser = session?.user || null;

        if (!currentUser) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          currentUser = user || null;
        }

        if (currentUser) {
          break;
        }

        await sleep(250);
      }

      if (requestId !== roleRequestIdRef.current) {
        return;
      }

      if (!currentUser) {
        setIsAdmin(false);

        try {
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
        } catch {
          // Ignora errores de localStorage.
        }

        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (requestId !== roleRequestIdRef.current) {
        return;
      }

      if (error) {
        return;
      }

      const nextIsAdmin = data?.role === "admin";

      setIsAdmin(nextIsAdmin);

      try {
        window.localStorage.setItem(
          ADMIN_CACHE_KEY,
          nextIsAdmin ? "true" : "false"
        );
      } catch {
        // Ignora errores de localStorage.
      }
    } catch {
      // Si hay error temporal de red/Supabase, conserva el estado cacheado.
    }
  }, []);

  const getVariantDisplayStock = (
    product: Product,
    variant: ProductVariant | null
  ) => {
    if (!variant) return Number(product.stock || 0);

    const variantStock = Number(variant.stock || 0);
    const generalStock =
      product.fallback_to_general_licenses === false
        ? 0
        : Number(product.stock || 0);

    return variantStock + generalStock;
  };

  const buildCatalogItems = useCallback(
    (
      productRows: Product[],
      groupedVariants: Record<string, ProductVariant[]>
    ): CatalogItem[] => {
      return productRows.flatMap<CatalogItem>((product): CatalogItem[] => {
        if (product.product_type !== "variable") {
          return [
            {
              product,
              variant: null,
              catalogId: product.id,
              displayName: product.name,
              displayDescription: product.description,
              displayPrice: Number(product.price || 0),
              displayStock: Number(product.stock || 0),
              displayImageUrl: product.image_url,
            },
          ];
        }

        const productVariants = groupedVariants[product.id] || [];

        if (productVariants.length === 0) {
          return [
            {
              product,
              variant: null,
              catalogId: product.id,
              displayName: product.name,
              displayDescription: product.description,
              displayPrice: Number(product.price || 0),
              displayStock: Number(product.stock || 0),
              displayImageUrl: product.image_url,
            },
          ];
        }

        return productVariants.map((variant) => ({
          product,
          variant,
          catalogId: `${product.id}-${variant.id}`,
          displayName: `${product.name} - ${variant.name}`,
          displayDescription: variant.description || product.description,
          displayPrice: Number(variant.price || 0),
          displayStock: getVariantDisplayStock(product, variant),
          displayImageUrl: variant.image_url || product.image_url,
        }));
      });
    },
    []
  );

  const fetchCategories = useCallback(async () => {
    const requestId = ++categoryRequestIdRef.current;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, category, product_type")
          .eq("is_active", true);

        if (requestId !== categoryRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        const productRows =
          ((data as {
            id: string;
            category: string | null;
            product_type?: ProductType;
          }[]) || []);

        const variableProductIds = productRows
          .filter((product) => product.product_type === "variable")
          .map((product) => product.id);

        const variantCounts = new Map<string, number>();

        if (variableProductIds.length > 0) {
          const { data: variantsData, error: variantsError } = await supabase
            .from("product_variants")
            .select("id, product_id")
            .in("product_id", variableProductIds)
            .eq("is_active", true);

          if (requestId !== categoryRequestIdRef.current) {
            return;
          }

          if (variantsError) {
            throw variantsError;
          }

          ((variantsData as { product_id: string }[]) || []).forEach(
            (variant) => {
              variantCounts.set(
                variant.product_id,
                (variantCounts.get(variant.product_id) || 0) + 1
              );
            }
          );
        }

        const counts = new Map<string, number>();
        let totalVisibleItems = 0;

        productRows.forEach((item) => {
          const visibleCount =
            item.product_type === "variable"
              ? Math.max(variantCounts.get(item.id) || 0, 1)
              : 1;

          totalVisibleItems += visibleCount;

          const category = (item.category || "").trim();
          if (!category) return;

          counts.set(category, (counts.get(category) || 0) + visibleCount);
        });

        const ordered = Array.from(counts.entries())
          .sort((a, b) =>
            a[0].localeCompare(b[0], "es", { sensitivity: "base" })
          )
          .map(([name, count]) => ({ name, count }));

        setCategories([
          {
            name: "Todas",
            count: totalVisibleItems,
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

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let query = supabase
          .from("products")
          .select("*")
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

        const { data, error } = await query;

        if (requestId !== catalogRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        const safeProducts = (data as Product[]) || [];
        const variableProducts = safeProducts.filter(
          (product) => product.product_type === "variable"
        );

        const groupedVariants: Record<string, ProductVariant[]> = {};

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

          ((variantsData as ProductVariant[]) || []).forEach((variant) => {
            if (!groupedVariants[variant.product_id]) {
              groupedVariants[variant.product_id] = [];
            }
            groupedVariants[variant.product_id].push(variant);
          });
        }

        const expandedItems = buildCatalogItems(safeProducts, groupedVariants);
        const from = (currentPage - 1) * PRODUCTS_PER_PAGE;
        const to = from + PRODUCTS_PER_PAGE;

        setCatalogItems(expandedItems.slice(from, to));
        setTotalProducts(expandedItems.length);
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
        setCatalogItems([]);
        setTotalProducts(0);
        setLoading(false);
        return;
      }
    }
  }, [buildCatalogItems, currentPage, debouncedSearch, selectedCategory]);

  useEffect(() => {
    let mounted = true;
    let retryTimeout: number | null = null;

    const run = async () => {
      if (!mounted) return;

      await fetchRole();

      if (!mounted) return;

      await fetchCategories();

      retryTimeout = window.setTimeout(() => {
        if (mounted) {
          void fetchRole();
        }
      }, 1200);
    };

    void run();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      if (!session?.user) {
        setIsAdmin(false);

        try {
          window.localStorage.removeItem(ADMIN_CACHE_KEY);
        } catch {
          // Ignora errores de localStorage.
        }

        return;
      }

      window.setTimeout(() => {
        if (mounted) {
          void fetchRole();
        }
      }, 0);

      window.setTimeout(() => {
        if (mounted) {
          void fetchRole();
        }
      }, 900);
    });

    return () => {
      mounted = false;

      if (retryTimeout) {
        window.clearTimeout(retryTimeout);
      }

      subscription.unsubscribe();
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

  const handleAddToCart = (
    e: React.MouseEvent<HTMLButtonElement>,
    item: CatalogItem
  ) => {
    e.stopPropagation();

    if (item.displayStock <= 0) return;

    addToCart({
      id: item.product.id,
      name: item.product.name,
      price: item.displayPrice,
      image: item.displayImageUrl || "",
      description: item.displayDescription || "",
      variantId: item.variant?.id || null,
      variantName: item.variant?.name || null,
    });
  };

  const handleOpenQuickView = (item: CatalogItem) => {
    setQuickViewItem(item);
  };

  const handleCloseQuickView = () => {
    setQuickViewItem(null);
  };

  const quickViewPrice = quickViewItem?.displayPrice || 0;
  const quickViewStock = quickViewItem?.displayStock || 0;

const renderProductCard = (item: CatalogItem) => {
  return (
    <article
      key={item.catalogId}
      onClick={() => handleOpenQuickView(item)}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-blue-400/30 hover:shadow-[0_20px_80px_rgba(59,130,246,0.12)] sm:rounded-[22px]"
    >
      <div className="p-2 pb-0 sm:p-3 sm:pb-0">
        <div className="relative aspect-square w-full overflow-hidden rounded-[14px] bg-gradient-to-b from-white/[0.05] to-white/[0.02] sm:rounded-[18px]">
          <ProductImage
            src={item.displayImageUrl}
            alt={item.displayName}
            className="h-full w-full object-contain p-2 transition duration-500 group-hover:scale-[1.04] sm:p-3"
            fallbackSubtitle="Sin imagen"
          />

          <div className="absolute left-2 top-2 z-10 sm:left-3 sm:top-3">
            <span className={
              item.displayStock > 0
                ? "inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 sm:px-2.5 sm:py-1 sm:text-[10px]"
                : "inline-flex rounded-full border border-red-400/20 bg-red-400/10 px-2 py-0.5 text-[9px] font-bold text-red-300 sm:px-2.5 sm:py-1 sm:text-[10px]"
            }>
              {item.displayStock > 0 ? "Disponible" : "Agotado"}
            </span>
          </div>

          {isAdmin && (
            <Link
              href={`/admin/products/${item.product.id}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Editar ${item.product.name}`}
              className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:scale-105 hover:bg-white hover:text-black sm:right-3 sm:top-3 sm:h-10 sm:w-10"
              title="Editar producto"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-2 sm:p-3">
        <div className="min-h-[38px] sm:min-h-[46px]">
          <h3 className="h-[34px] overflow-hidden text-[11px] font-extrabold uppercase leading-4 text-white sm:h-[40px] sm:text-[13px] sm:leading-[20px] md:h-[44px] md:text-[14px] md:leading-[22px]">
            {item.displayName}
          </h3>
        </div>

        <div className="mt-auto border-t border-white/10 pt-2 sm:pt-3">
          <p className="text-lg font-black text-white sm:text-xl md:text-[22px]">
            ${formatPrice(item.displayPrice)}
          </p>

          {isAdmin && (
            <p className="mt-1 text-[10px] font-semibold text-white/45 sm:text-xs">
              Stock: {item.displayStock}
            </p>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
            {/* Ver detalles */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleOpenQuickView(item); }}
              className="group/btn relative inline-flex h-[34px] items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] px-2 text-[10px] font-bold text-white/80 transition-all duration-200 hover:border-white/25 hover:bg-white/[0.12] hover:text-white sm:h-10 sm:text-xs"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Detalles</span>
            </button>

            {/* Añadir al carrito */}
            <button
              type="button"
              onClick={(e) => handleAddToCart(e, item)}
              disabled={item.displayStock <= 0}
              aria-label="Añadir al carrito"
              className="relative inline-flex h-[34px] items-center justify-center overflow-hidden rounded-2xl bg-white px-2 transition-all duration-200 hover:bg-slate-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </button>
          </div>
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
              ) : catalogItems.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                  <p className="text-lg font-semibold text-white">
                    No encontramos productos con ese filtro
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4 xl:gap-4">
                    {catalogItems.map((item) => renderProductCard(item))}
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

      {quickViewItem && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 p-3 backdrop-blur-sm sm:p-4 md:p-5"
          onClick={handleCloseQuickView}
        >
          <div className="flex h-full items-center justify-center">
            <div
              className="relative w-full max-w-[24rem] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0f1a] shadow-2xl sm:max-w-[28rem] md:max-w-[50rem] lg:max-w-[56rem]"
              style={{ maxHeight: "calc(100dvh - 24px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {isAdmin && (
                <Link
                  href={`/admin/products/${quickViewItem.product.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-14 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 transition hover:bg-white hover:text-black sm:h-10 sm:w-10"
                  aria-label={`Editar ${quickViewItem.product.name}`}
                  title="Editar producto"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 sm:h-5 sm:w-5"
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

              <button
                type="button"
                onClick={handleCloseQuickView}
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-lg text-white/80 transition hover:bg-white/10 hover:text-white sm:h-10 sm:w-10"
                aria-label="Cerrar vista rápida"
              >
                ×
              </button>

              <div
                className="overflow-y-auto"
                style={{ maxHeight: "calc(100dvh - 24px)" }}
              >
                <div className="grid gap-0 md:grid-cols-[0.9fr_1.02fr]">
                  <div className="p-3 pb-2 sm:p-4 sm:pb-3 md:p-4">
                    <div className="rounded-[18px] border border-white/10 bg-white/[0.03]">
                      <div className="flex h-[170px] w-full items-center justify-center overflow-hidden sm:h-[210px] md:h-[255px] lg:h-[280px]">
                        <ProductImage
                          src={quickViewItem.displayImageUrl}
                          alt={quickViewItem.displayName}
                          className="block max-h-[86%] max-w-[86%] object-contain"
                          fallbackClassName="flex h-full w-full items-center justify-center bg-white/[0.02]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col p-3 pt-0 sm:p-4 sm:pt-0 md:p-4">
                    <div className="border-b border-white/10 pb-3 pr-20">
                      <h2 className="text-[1.05rem] font-black uppercase leading-[1.2] text-white sm:text-[1.35rem] md:text-[1.6rem] lg:text-[1.8rem]">
                        {quickViewItem.displayName}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={
                            quickViewStock > 0
                              ? "inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300"
                              : "inline-flex rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[11px] font-bold text-red-300"
                          }
                        >
                          {quickViewStock > 0 ? "Disponible" : "Agotado"}
                        </span>

                        {isAdmin && (
                          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-white/50">
                            Stock: {quickViewStock}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 py-3">
                      <p className="text-[2.1rem] font-black leading-none text-white sm:text-[2.5rem] md:text-[2.6rem] lg:text-[2.8rem]">
                        ${formatPrice(quickViewPrice)}
                      </p>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 md:p-3 lg:p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                          Descripción
                        </p>

                        <p className="mt-2 text-[0.96rem] leading-7 text-white/65 sm:text-[1rem] md:text-sm md:leading-6">
                          {quickViewItem.displayDescription?.trim()
                            ? quickViewItem.displayDescription
                            : "Este producto no tiene descripción disponible por el momento."}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-3">
                      <button
                        type="button"
                        onClick={handleCloseQuickView}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm font-bold text-white transition hover:bg-white/[0.09]"
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