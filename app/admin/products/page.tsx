"use client";

import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

const CATALOG_BROADCAST_CHANNEL = "streamingmayor-catalog-invalidation";
const CATALOG_BROADCAST_EVENT = "catalog-updated";

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
  sort_order?: number | null;
  product_type?: "simple" | "variable" | "composite";
  combo_stock?: number | null;
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingProductId, setDraggingProductId] = useState<string | null>(null);
  const [dragOverProductId, setDragOverProductId] = useState<string | null>(null);
  const [positionInputs, setPositionInputs] = useState<Record<string, string>>({});

  const fetchProducts = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
      setMessage("");
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, name, description, price, stock, image_url, category, is_active, created_at, sort_order, product_type, combo_stock"
          )
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .abortSignal(AbortSignal.timeout(12_000));

        if (error) {
          throw error;
        }

        setProducts(
          ((data as Product[]) || []).map((product, index) => ({
            ...product,
            sort_order: product.sort_order ?? index,
          }))
        );

        if (showLoader) setPositionInputs({});
        if (showLoader) setLoading(false);
        return;
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          continue;
        }

        setMessage(
          "No se pudieron cargar los productos. Revisa la conexión con Supabase y pulsa Actualizar."
        );
        if (showLoader) {
          setProducts([]);
          setLoading(false);
        }
        console.error("[admin/products] Error cargando productos:", error);
      }
    }
  }, []);

  const saveProductsOrder = async (
    nextProducts: Product[],
    successMessage = "Orden actualizado. El catálogo mostrará los productos en este mismo orden."
  ) => {
    setSavingOrder(true);
    setMessage("");

    const updates = await Promise.all(
      nextProducts.map((product, index) =>
        supabase
          .from("products")
          .update({ sort_order: index })
          .eq("id", product.id)
      )
    );

    const failedUpdate = updates.find((result) => result.error);

    if (failedUpdate?.error) {
      setMessage("No se pudo guardar el nuevo orden: " + failedUpdate.error.message);
      void fetchProducts();
    } else {
      setMessage(successMessage);
    }

    setSavingOrder(false);
  };

  const getProductPosition = (productId: string) => {
    return products.findIndex((product) => product.id === productId) + 1;
  };

  const clearPositionInput = (productId: string) => {
    setPositionInputs((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handlePositionInputChange = (productId: string, value: string) => {
    const cleanValue = value.replace(/[^\d]/g, "");

    setPositionInputs((prev) => ({
      ...prev,
      [productId]: cleanValue,
    }));
  };

  const handleMoveProductToPosition = async (
    productId: string,
    rawPosition: string
  ) => {
    if (savingOrder || !canManuallyOrder) {
      clearPositionInput(productId);
      return;
    }

    const currentIndex = products.findIndex((product) => product.id === productId);

    if (currentIndex === -1) {
      clearPositionInput(productId);
      return;
    }

    if (!rawPosition.trim()) {
      clearPositionInput(productId);
      return;
    }

    const numericPosition = Number(rawPosition);

    if (Number.isNaN(numericPosition)) {
      clearPositionInput(productId);
      return;
    }

    const targetPosition = Math.min(
      Math.max(Math.trunc(numericPosition), 1),
      products.length
    );

    const targetIndex = targetPosition - 1;

    if (currentIndex === targetIndex) {
      clearPositionInput(productId);
      return;
    }

    const nextProducts = [...products];
    const [movedProduct] = nextProducts.splice(currentIndex, 1);

    nextProducts.splice(targetIndex, 0, movedProduct);

    const orderedProducts = nextProducts.map((product, index) => ({
      ...product,
      sort_order: index,
    }));

    setProducts(orderedProducts);
    clearPositionInput(productId);

    await saveProductsOrder(
      orderedProducts,
      `Producto movido al puesto ${targetPosition}. El catálogo mostrará este nuevo orden.`
    );
  };

  const handlePositionKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    productId: string
  ) => {
    if (savingOrder || !canManuallyOrder) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", productId);

    setDraggingProductId(productId);
  };

  const handleDragOver = (
    event: DragEvent<HTMLElement>,
    targetProductId: string
  ) => {
    if (!draggingProductId || draggingProductId === targetProductId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverProductId(targetProductId);
  };

  const handleDrop = async (
    event: DragEvent<HTMLElement>,
    targetProductId: string
  ) => {
    event.preventDefault();

    const draggedProductId =
      draggingProductId || event.dataTransfer.getData("text/plain");

    setDraggingProductId(null);
    setDragOverProductId(null);

    if (!draggedProductId || draggedProductId === targetProductId) return;

    const currentIndex = products.findIndex(
      (product) => product.id === draggedProductId
    );

    const targetIndex = products.findIndex(
      (product) => product.id === targetProductId
    );

    if (currentIndex === -1 || targetIndex === -1) return;

    const nextProducts = [...products];
    const [movedProduct] = nextProducts.splice(currentIndex, 1);

    nextProducts.splice(targetIndex, 0, movedProduct);

    const orderedProducts = nextProducts.map((product, index) => ({
      ...product,
      sort_order: index,
    }));

    setProducts(orderedProducts);
    await saveProductsOrder(orderedProducts);
  };

  const handleDragEnd = () => {
    setDraggingProductId(null);
    setDragOverProductId(null);
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

    const nextProducts = products.filter((item) => item.id !== id);
    const orderedProducts = nextProducts.map((product, index) => ({
      ...product,
      sort_order: index,
    }));

    setProducts(orderedProducts);
    clearPositionInput(id);

    await saveProductsOrder(
      orderedProducts,
      "Producto eliminado correctamente y orden ajustado."
    );
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProducts();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchProducts]);

  useEffect(() => {
    let refreshTimer: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void fetchProducts(false);
      }, 0);
    };

    const applyProductStock = (record: Record<string, unknown>) => {
      const productId = typeof record.id === "string" ? record.id : "";
      if (!productId) return false;

      setProducts((current) =>
        current.map((product) => {
          if (product.id !== productId) return product;

          return {
            ...product,
            ...(record as Partial<Product>),
            id: productId,
            stock:
              record.stock !== undefined
                ? Number(record.stock || 0)
                : product.stock,
            combo_stock:
              record.combo_stock === null ||
              typeof record.combo_stock === "number"
                ? (record.combo_stock as number | null)
                : product.combo_stock,
          };
        })
      );

      return true;
    };

    const realtimeChannel = supabase
      .channel("streamingmayor-admin-product-stock-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          if (
            payload.eventType === "UPDATE" &&
            applyProductStock(payload.new as Record<string, unknown>)
          ) {
            return;
          }

          scheduleRefresh();
        }
      )
      .subscribe();

    const broadcastChannel = supabase
      .channel(CATALOG_BROADCAST_CHANNEL)
      .on("broadcast", { event: CATALOG_BROADCAST_EVENT }, (message) => {
        const update = message?.payload as
          | {
              productId?: unknown;
              productStock?: unknown;
              comboStock?: unknown;
            }
          | undefined;

        if (
          typeof update?.productId === "string" &&
          typeof update.productStock === "number" &&
          applyProductStock({
            id: update.productId,
            stock: update.productStock,
            ...(update.comboStock === null ||
            typeof update.comboStock === "number"
              ? { combo_stock: update.comboStock }
              : {}),
          })
        ) {
          return;
        }

        scheduleRefresh();
      })
      .subscribe();

    const refreshOnFocus = () => scheduleRefresh();
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      void supabase.removeChannel(realtimeChannel);
      void supabase.removeChannel(broadcastChannel);
    };
  }, [fetchProducts]);

  const formatPrice = (value: number) => {
    return `$${Number(value || 0).toLocaleString("es-CO")}`;
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const canManuallyOrder = !normalizedSearch && !onlyOutOfStock;

  const isProductOutOfStock = (product: Product) => {
    if (product.product_type === "composite") {
      if (product.combo_stock === null || product.combo_stock === undefined) {
        return false;
      }

      return Number(product.combo_stock || 0) <= 0;
    }

    return Number(product.stock || 0) <= 0;
  };

  const getStockLabel = (product: Product) => {
    if (product.product_type !== "composite") {
      return String(product.stock ?? 0);
    }

    if (product.combo_stock === null || product.combo_stock === undefined) {
      return "Según componentes";
    }

    return `${Math.max(0, Number(product.combo_stock || 0))} disponibles`;
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      !normalizedSearch ||
      product.name.toLowerCase().includes(normalizedSearch) ||
      (product.description || "").toLowerCase().includes(normalizedSearch) ||
      (product.category || "").toLowerCase().includes(normalizedSearch);

    const matchesStock = !onlyOutOfStock || isProductOutOfStock(product);

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
            Gestiona todos los productos de tu tienda. El orden de esta lista es el mismo que verá el cliente en el catálogo.
          </p>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => void fetchProducts()}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:flex-none"
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>

        <Link
          href="/admin/products/new"
          className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Nuevo producto
        </Link>
        </div>
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
            {products.filter(isProductOutOfStock).length}
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
            <div className="grid gap-4 p-4 sm:p-5 md:hidden">
              {filteredProducts.map((product) => {
                const isDragging = draggingProductId === product.id;
                const isDragOver = dragOverProductId === product.id;
                const position = getProductPosition(product.id);

                return (
                  <div
                    key={product.id}
                    onDragOver={(event) => handleDragOver(event, product.id)}
                    onDrop={(event) => handleDrop(event, product.id)}
                    className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                      isDragging
                        ? "border-blue-300 opacity-50"
                        : isDragOver
                          ? "border-blue-400 ring-2 ring-blue-100"
                          : "border-slate-200"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span
                        draggable={canManuallyOrder && !savingOrder}
                        onDragStart={(event) =>
                          handleDragStart(event, product.id)
                        }
                        onDragEnd={handleDragEnd}
                        className={`inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 ${
                          canManuallyOrder
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-not-allowed opacity-50"
                        }`}
                      >
                        <span className="text-base leading-none">⋮⋮</span>
                        Arrastrar
                      </span>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">
                          Pos.
                        </span>

                        <input
                          type="number"
                          min={1}
                          max={products.length}
                          disabled={!canManuallyOrder || savingOrder}
                          value={positionInputs[product.id] ?? String(position)}
                          onChange={(event) =>
                            handlePositionInputChange(
                              product.id,
                              event.target.value
                            )
                          }
                          onBlur={(event) =>
                            handleMoveProductToPosition(
                              product.id,
                              event.target.value
                            )
                          }
                          onKeyDown={handlePositionKeyDown}
                          className="h-9 w-16 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60"
                        />
                      </div>
                    </div>

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
                          {getStockLabel(product)}
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

                    <div className="mt-4 grid grid-cols-2 gap-2">
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
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left text-sm text-slate-600">
                    <th className="px-5 py-4 font-semibold">Orden</th>
                    <th className="px-5 py-4 font-semibold">Producto</th>
                    <th className="px-5 py-4 font-semibold">Categoría</th>
                    <th className="px-5 py-4 font-semibold">Precio</th>
                    <th className="px-5 py-4 font-semibold">Stock</th>
                    <th className="px-5 py-4 font-semibold">Estado</th>
                    <th className="px-5 py-4 font-semibold">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((product) => {
                    const isDragging = draggingProductId === product.id;
                    const isDragOver = dragOverProductId === product.id;
                    const position = getProductPosition(product.id);

                    return (
                      <tr
                        key={product.id}
                        onDragOver={(event) =>
                          handleDragOver(event, product.id)
                        }
                        onDrop={(event) => handleDrop(event, product.id)}
                        className={`border-t text-sm text-slate-700 transition ${
                          isDragging
                            ? "border-blue-300 bg-blue-50 opacity-50"
                            : isDragOver
                              ? "border-blue-400 bg-blue-50"
                              : "border-slate-200"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span
                              draggable={canManuallyOrder && !savingOrder}
                              onDragStart={(event) =>
                                handleDragStart(event, product.id)
                              }
                              onDragEnd={handleDragEnd}
                              className={`inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 ${
                                canManuallyOrder
                                  ? "cursor-grab active:cursor-grabbing"
                                  : "cursor-not-allowed opacity-50"
                              }`}
                              title="Arrastrar producto"
                            >
                              ⋮⋮
                            </span>

                            <input
                              type="number"
                              min={1}
                              max={products.length}
                              disabled={!canManuallyOrder || savingOrder}
                              value={positionInputs[product.id] ?? String(position)}
                              onChange={(event) =>
                                handlePositionInputChange(
                                  product.id,
                                  event.target.value
                                )
                              }
                              onBlur={(event) =>
                                handleMoveProductToPosition(
                                  product.id,
                                  event.target.value
                                )
                              }
                              onKeyDown={handlePositionKeyDown}
                              className="h-10 w-16 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60"
                            />
                          </div>
                        </td>

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

                        <td className="px-5 py-4">
                          {getStockLabel(product)}
                        </td>

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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
