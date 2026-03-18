"use client";

import { useMemo, useRef, useState } from "react";
import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";

type ProductType = "simple" | "variable" | "composite";

type ProductRow = {
  id: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  product_type?: ProductType;
  avoid_repeat_license?: boolean;
  use_priority_licenses?: boolean;
  fallback_to_general_licenses?: boolean;
};

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
};

type ProfileRow = {
  id: string;
  balance: number;
};

type CreatedOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  item_type: string;
  product_name: string;
  variant_name: string | null;
};

type LicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  license_text: string;
  status: string;
  is_priority?: boolean;
};

type AssignedLicenseHistoryRow = {
  product_id: string;
  license_text: string;
};

const generateRandomOrderNumber = () => {
  return Math.floor(10000 + Math.random() * 90000);
};

const normalizeLicenseText = (value: string) => value.trim();

const buildItemKey = (productId: string, variantId?: string | null) =>
  `${productId}__${variantId ?? "base"}`;

async function getUniqueOrderNumber() {
  let attempts = 0;

  while (attempts < 25) {
    const candidate = generateRandomOrderNumber();

    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", candidate)
      .maybeSingle();

    if (error) {
      throw new Error("No se pudo validar el número de pedido.");
    }

    if (!data) {
      return candidate;
    }

    attempts += 1;
  }

  throw new Error("No se pudo generar un número de pedido único.");
}

async function fetchAvailableLicensePool({
  productId,
  variantId,
  isPriority,
}: {
  productId: string;
  variantId: string | null;
  isPriority: boolean;
}) {
  let query = supabase
    .from("product_licenses")
    .select("id, product_id, variant_id, license_text, status, is_priority")
    .eq("product_id", productId)
    .eq("status", "available")
    .eq("is_priority", isPriority)
    .order("created_at", { ascending: true });

  if (variantId) {
    query = query.eq("variant_id", variantId);
  } else {
    query = query.is("variant_id", null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data as LicenseRow[]) || [];
}

async function selectLicensesForItem({
  productId,
  variantId,
  quantity,
  avoidRepeatLicense,
  usePriorityLicenses,
  fallbackToGeneralLicenses,
  previouslyAssignedTexts,
  alreadySelectedTexts,
}: {
  productId: string;
  variantId: string | null;
  quantity: number;
  avoidRepeatLicense: boolean;
  usePriorityLicenses: boolean;
  fallbackToGeneralLicenses: boolean;
  previouslyAssignedTexts: Set<string>;
  alreadySelectedTexts: Set<string>;
}) {
  const pools: { variantId: string | null; isPriority: boolean }[] = [];

  if (variantId) {
    const priorityPool = { variantId, isPriority: true };
    const generalPool = { variantId: null, isPriority: false };

    if (usePriorityLicenses) {
      pools.push(priorityPool);

      if (fallbackToGeneralLicenses) {
        pools.push(generalPool);
      }
    } else {
      if (fallbackToGeneralLicenses) {
        pools.push(generalPool);
      }

      pools.push(priorityPool);
    }
  } else {
    pools.push({ variantId: null, isPriority: false });
  }

  const selected: LicenseRow[] = [];
  const selectedIds = new Set<string>();
  const selectedTexts = new Set<string>(alreadySelectedTexts);

  for (const pool of pools) {
    const poolLicenses = await fetchAvailableLicensePool({
      productId,
      variantId: pool.variantId,
      isPriority: pool.isPriority,
    });

    for (const license of poolLicenses) {
      if (selectedIds.has(license.id)) continue;

      const normalizedText = normalizeLicenseText(license.license_text);
      if (!normalizedText) continue;

      if (avoidRepeatLicense) {
        if (previouslyAssignedTexts.has(normalizedText)) continue;
        if (selectedTexts.has(normalizedText)) continue;
      }

      selected.push(license);
      selectedIds.add(license.id);

      if (avoidRepeatLicense) {
        selectedTexts.add(normalizedText);
      }

      if (selected.length >= quantity) {
        return selected;
      }
    }
  }

  return selected;
}

export default function CartDrawer() {
  const {
    cart,
    isCartOpen,
    closeCart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  const total = useMemo(
    () => cart.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [cart]
  );

  const totalItems = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLButtonElement | null>(null);
  const dragXRef = useRef(0);
  const pointerOffsetRef = useRef(0);
  const maxXRef = useRef(0);

  const [dragX, setDragX] = useState(0);

  const resetSlider = () => {
    dragXRef.current = 0;
    pointerOffsetRef.current = 0;
    setDragX(0);
  };

  const handleCheckout = async () => {
    if (processing || cart.length === 0) return;

    setProcessing(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("Debes iniciar sesión para completar la compra.");
        resetSlider();
        setProcessing(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, balance")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage("No se pudo cargar tu perfil.");
        resetSlider();
        setProcessing(false);
        return;
      }

      const profile = profileData as ProfileRow;

      const productIds = Array.from(new Set(cart.map((item) => item.id)));
      const variantIds = Array.from(
        new Set(cart.map((item) => item.variantId).filter(Boolean) as string[])
      );

      const [
        { data: productsData, error: productsError },
        { data: variantsData, error: variantsError },
      ] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, price, stock, is_active, product_type, avoid_repeat_license, use_priority_licenses, fallback_to_general_licenses"
          )
          .in("id", productIds),
        variantIds.length
          ? supabase
              .from("product_variants")
              .select("id, product_id, name, price, stock, is_active")
              .in("id", variantIds)
          : Promise.resolve({ data: [] as VariantRow[], error: null }),
      ]);

      if (productsError) {
        setMessage("No se pudieron validar los productos.");
        resetSlider();
        setProcessing(false);
        return;
      }

      if (variantsError) {
        setMessage("No se pudieron validar las variantes.");
        resetSlider();
        setProcessing(false);
        return;
      }

      const productsMap = Object.fromEntries(
        ((productsData as ProductRow[]) || []).map((p) => [p.id, p])
      );

      const variantsMap = Object.fromEntries(
        ((variantsData as VariantRow[]) || []).map((v) => [v.id, v])
      );

      let validatedTotal = 0;

      for (const item of cart) {
        const product = productsMap[item.id];

        if (!product || !product.is_active) {
          setMessage(`El producto "${item.name}" ya no está disponible.`);
          resetSlider();
          setProcessing(false);
          return;
        }

        if (item.variantId) {
          const variant = variantsMap[item.variantId];

          if (!variant || !variant.is_active) {
            setMessage(`La variante de "${item.name}" ya no está disponible.`);
            resetSlider();
            setProcessing(false);
            return;
          }

          const fallbackEnabled =
            product.fallback_to_general_licenses !== false;

          const effectiveStock =
            Number(variant.stock) +
            (fallbackEnabled ? Number(product.stock) : 0);

          if (effectiveStock < item.quantity) {
            setMessage(`No hay stock suficiente para "${item.name}".`);
            resetSlider();
            setProcessing(false);
            return;
          }

          validatedTotal += Number(variant.price) * item.quantity;
        } else {
          if (Number(product.stock) < item.quantity) {
            setMessage(`No hay stock suficiente para "${item.name}".`);
            resetSlider();
            setProcessing(false);
            return;
          }

          validatedTotal += Number(product.price) * item.quantity;
        }
      }

      if (Number(profile.balance) < validatedTotal) {
        setMessage(
          `Saldo insuficiente. Tu saldo actual es $${Number(
            profile.balance
          ).toLocaleString()} y el total es $${validatedTotal.toLocaleString()}.`
        );
        resetSlider();
        setProcessing(false);
        return;
      }

      const { data: assignedHistoryData, error: assignedHistoryError } =
        await supabase
          .from("product_licenses")
          .select("product_id, license_text")
          .eq("assigned_user_id", user.id)
          .eq("status", "assigned")
          .in("product_id", productIds);

      if (assignedHistoryError) {
        setMessage("No se pudo validar el historial de licencias del usuario.");
        resetSlider();
        setProcessing(false);
        return;
      }

      const assignedHistoryMap = new Map<string, Set<string>>();

      for (const row of ((assignedHistoryData ||
        []) as AssignedLicenseHistoryRow[])) {
        const normalizedText = normalizeLicenseText(row.license_text);
        if (!normalizedText) continue;

        if (!assignedHistoryMap.has(row.product_id)) {
          assignedHistoryMap.set(row.product_id, new Set<string>());
        }

        assignedHistoryMap.get(row.product_id)!.add(normalizedText);
      }

      const orderSelectedTextsByProduct = new Map<string, Set<string>>();
      const selectedLicensesByItemKey = new Map<string, LicenseRow[]>();

      const productStockDeltas = new Map<
        string,
        { original: number; decrement: number }
      >();

      const variantStockDeltas = new Map<
        string,
        { original: number; decrement: number }
      >();

      for (const item of cart) {
        const product = productsMap[item.id];
        const variant = item.variantId ? variantsMap[item.variantId] : null;
        const itemKey = buildItemKey(item.id, item.variantId || null);

        if (!product) {
          setMessage(`No se pudo preparar la compra de "${item.name}".`);
          resetSlider();
          setProcessing(false);
          return;
        }

        const avoidRepeat = Boolean(product.avoid_repeat_license);
        const usePriority = Boolean(product.use_priority_licenses);
        const fallbackToGeneral =
          product.fallback_to_general_licenses !== false;

        const previouslyAssignedTexts =
          assignedHistoryMap.get(item.id) || new Set<string>();

        const alreadySelectedTexts =
          orderSelectedTextsByProduct.get(item.id) || new Set<string>();

        const selectedLicenses = await selectLicensesForItem({
          productId: item.id,
          variantId: item.variantId || null,
          quantity: item.quantity,
          avoidRepeatLicense: avoidRepeat,
          usePriorityLicenses: usePriority,
          fallbackToGeneralLicenses: fallbackToGeneral,
          previouslyAssignedTexts,
          alreadySelectedTexts,
        });

        if (selectedLicenses.length < item.quantity) {
          setMessage(
            `No hay suficientes licencias disponibles para "${item.name}" con la configuración actual.`
          );
          resetSlider();
          setProcessing(false);
          return;
        }

        selectedLicensesByItemKey.set(itemKey, selectedLicenses);

        if (avoidRepeat) {
          const updatedSelectedTexts = new Set<string>(alreadySelectedTexts);

          for (const license of selectedLicenses) {
            updatedSelectedTexts.add(normalizeLicenseText(license.license_text));
          }

          orderSelectedTextsByProduct.set(item.id, updatedSelectedTexts);
        }

        if (item.variantId && variant) {
          const priorityCount = selectedLicenses.filter(
            (license) => license.variant_id === item.variantId
          ).length;

          const generalCount = selectedLicenses.filter(
            (license) => license.variant_id === null
          ).length;

          if (priorityCount > 0) {
            const currentVariantDelta = variantStockDeltas.get(variant.id);
            if (currentVariantDelta) {
              currentVariantDelta.decrement += priorityCount;
            } else {
              variantStockDeltas.set(variant.id, {
                original: Number(variant.stock),
                decrement: priorityCount,
              });
            }
          }

          if (generalCount > 0) {
            const currentProductDelta = productStockDeltas.get(product.id);
            if (currentProductDelta) {
              currentProductDelta.decrement += generalCount;
            } else {
              productStockDeltas.set(product.id, {
                original: Number(product.stock),
                decrement: generalCount,
              });
            }
          }
        } else {
          const currentProductDelta = productStockDeltas.get(product.id);

          if (currentProductDelta) {
            currentProductDelta.decrement += selectedLicenses.length;
          } else {
            productStockDeltas.set(product.id, {
              original: Number(product.stock),
              decrement: selectedLicenses.length,
            });
          }
        }
      }

      const orderNumber = await getUniqueOrderNumber();

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            total: validatedTotal,
            status: "paid",
            order_number: orderNumber,
          },
        ])
        .select()
        .single();

      if (orderError || !orderData) {
        setMessage(orderError?.message || "No se pudo crear el pedido.");
        resetSlider();
        setProcessing(false);
        return;
      }

      let createdOrderId: string | null = orderData.id;
      let balanceDiscounted = false;
      const assignedLicenseIds: string[] = [];
      const updatedVariantStockIds = new Set<string>();
      const updatedProductStockIds = new Set<string>();

      const rollbackPurchase = async () => {
        for (const variantId of Array.from(updatedVariantStockIds)) {
          const restore = variantStockDeltas.get(variantId);
          if (!restore) continue;

          await supabase
            .from("product_variants")
            .update({ stock: restore.original })
            .eq("id", variantId);
        }

        for (const productId of Array.from(updatedProductStockIds)) {
          const restore = productStockDeltas.get(productId);
          if (!restore) continue;

          await supabase
            .from("products")
            .update({ stock: restore.original })
            .eq("id", productId);
        }

        if (assignedLicenseIds.length > 0) {
          await supabase
            .from("product_licenses")
            .update({
              status: "available",
              assigned_order_id: null,
              assigned_order_item_id: null,
              assigned_user_id: null,
            })
            .in("id", assignedLicenseIds);
        }

        if (createdOrderId) {
          await supabase.from("orders").delete().eq("id", createdOrderId);
        }

        if (balanceDiscounted) {
          await supabase
            .from("profiles")
            .update({ balance: profile.balance })
            .eq("id", user.id);
        }
      };

      const newBalance = Number(profile.balance) - validatedTotal;

      const { error: balanceUpdateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user.id);

      if (balanceUpdateError) {
        await supabase.from("orders").delete().eq("id", orderData.id);
        setMessage("No se pudo descontar el saldo.");
        resetSlider();
        setProcessing(false);
        return;
      }

      balanceDiscounted = true;

      const createdOrderItems: CreatedOrderItemRow[] = [];
      const orderItemsByKey = new Map<string, CreatedOrderItemRow>();

      for (const item of cart) {
        const product = productsMap[item.id];
        const variant = item.variantId ? variantsMap[item.variantId] : null;
        const unitPrice = Number(variant?.price ?? product?.price ?? item.price);

        const { data: orderItemData, error: orderItemError } = await supabase
          .from("order_items")
          .insert([
            {
              order_id: orderData.id,
              product_id: item.id,
              variant_id: item.variantId || null,
              quantity: item.quantity,
              unit_price: unitPrice,
              item_type: item.variantId ? "variant" : "simple",
              product_name: product?.name || item.name,
              variant_name: item.variantName || null,
            },
          ])
          .select()
          .single();

        if (orderItemError || !orderItemData) {
          await rollbackPurchase();
          setMessage("No se pudo guardar el detalle del pedido.");
          resetSlider();
          setProcessing(false);
          return;
        }

        const createdItem = orderItemData as CreatedOrderItemRow;
        createdOrderItems.push(createdItem);
        orderItemsByKey.set(
          buildItemKey(item.id, item.variantId || null),
          createdItem
        );
      }

      for (const item of cart) {
        const itemKey = buildItemKey(item.id, item.variantId || null);
        const matchingOrderItem = orderItemsByKey.get(itemKey);
        const selectedLicenses = selectedLicensesByItemKey.get(itemKey) || [];

        if (!matchingOrderItem) {
          await rollbackPurchase();
          setMessage(`No se pudo completar la entrega de "${item.name}".`);
          resetSlider();
          setProcessing(false);
          return;
        }

        for (const license of selectedLicenses) {
          const { data: assignedRow, error: assignError } = await supabase
            .from("product_licenses")
            .update({
              status: "assigned",
              assigned_order_id: orderData.id,
              assigned_order_item_id: matchingOrderItem.id,
              assigned_user_id: user.id,
            })
            .eq("id", license.id)
            .eq("status", "available")
            .select("id")
            .maybeSingle();

          if (assignError || !assignedRow) {
            await rollbackPurchase();
            setMessage(`No se pudo completar la entrega de "${item.name}".`);
            resetSlider();
            setProcessing(false);
            return;
          }

          assignedLicenseIds.push(license.id);
        }
      }

      for (const [variantId, stockInfo] of variantStockDeltas.entries()) {
        const { error } = await supabase
          .from("product_variants")
          .update({ stock: stockInfo.original - stockInfo.decrement })
          .eq("id", variantId);

        if (error) {
          await rollbackPurchase();
          setMessage("No se pudo actualizar el stock de una variante.");
          resetSlider();
          setProcessing(false);
          return;
        }

        updatedVariantStockIds.add(variantId);
      }

      for (const [productId, stockInfo] of productStockDeltas.entries()) {
        const { error } = await supabase
          .from("products")
          .update({ stock: stockInfo.original - stockInfo.decrement })
          .eq("id", productId);

        if (error) {
          await rollbackPurchase();
          setMessage("No se pudo actualizar el stock de un producto.");
          resetSlider();
          setProcessing(false);
          return;
        }

        updatedProductStockIds.add(productId);
      }

      clearCart();
      closeCart();
      resetSlider();
      window.location.href = "/account/orders";
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado al procesar la compra."
      );
      resetSlider();
    } finally {
      setProcessing(false);
    }
  };

  const beginDrag = (clientX: number) => {
    if (processing || cart.length === 0 || !trackRef.current || !knobRef.current) {
      return;
    }

    setMessage("");
    setSuccessMessage("");

    const trackRect = trackRef.current.getBoundingClientRect();
    const knobWidth = knobRef.current.offsetWidth;
    const maxX = trackRef.current.offsetWidth - knobWidth - 4;
    maxXRef.current = maxX;

    pointerOffsetRef.current = clientX - trackRect.left - dragXRef.current;

    const updatePosition = (pointerX: number) => {
      const next = Math.min(
        Math.max(pointerX - trackRect.left - pointerOffsetRef.current, 0),
        maxXRef.current
      );

      dragXRef.current = next;
      setDragX(next);
    };

    const handleMouseMove = (e: MouseEvent) => updatePosition(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      updatePosition(e.touches[0].clientX);
    };

    const endDrag = async () => {
      const threshold = maxXRef.current * 0.78;
      const confirmed = dragXRef.current >= threshold;

      cleanup();

      if (confirmed) {
        dragXRef.current = maxXRef.current;
        setDragX(maxXRef.current);
        await handleCheckout();
      } else {
        resetSlider();
      }
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", endDrag);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", endDrag);
  };

  const sliderFill = dragX + 56;

  return (
    <>
      {isCartOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
          onClick={closeCart}
        />
      )}

      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full bg-[#041533] text-white shadow-2xl transition-transform duration-300 sm:w-[430px] ${
          isCartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <div>
            <h2 className="text-2xl font-extrabold">Mi carrito</h2>
            <p className="mt-1 text-sm text-white/45">
              {totalItems} producto(s)
            </p>
          </div>

          <button
            onClick={closeCart}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl leading-none transition hover:bg-white/20"
          >
            ×
          </button>
        </div>

        <div className="flex h-[calc(100%-92px)] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 text-center">
                <p className="text-base font-semibold text-white/85">
                  Tu carrito está vacío
                </p>
                <p className="mt-2 text-sm text-white/45">
                  Agrega productos para continuar.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={`${item.id}-${item.variantId || "base"}`}
                  className="rounded-[24px] border border-white/10 bg-white/[0.05] p-4"
                >
                  <div className="flex gap-3">
                    <img
                      src={item.image || "/placeholder.png"}
                      alt={item.name}
                      className="h-[74px] w-[74px] rounded-2xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-bold leading-5 text-white">
                        {item.name}
                      </h3>

                      {item.variantName && (
                        <p className="mt-1 text-xs font-medium text-blue-300">
                          {item.variantName}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-sm text-white/70">
                          ${Number(item.price).toLocaleString()}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(item.id, item.variantId || null)
                          }
                          className="text-xs font-medium text-red-400 transition hover:text-red-300"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              decreaseQuantity(item.id, item.variantId || null)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-lg transition hover:bg-white/20"
                          >
                            -
                          </button>

                          <span className="min-w-[22px] text-center text-sm font-semibold">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              increaseQuantity(item.id, item.variantId || null)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-lg transition hover:bg-white/20"
                          >
                            +
                          </button>
                        </div>

                        <p className="text-sm font-semibold text-blue-400">
                          ${Number(item.price * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4 border-t border-white/10 bg-[#02102b] p-4">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="text-blue-400">
                ${Number(total).toLocaleString()}
              </span>
            </div>

            {message && (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
                {message}
              </div>
            )}

            {successMessage && (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                {successMessage}
              </div>
            )}

            {cart.length > 0 && (
              <div className="space-y-3">
                <div
                  ref={trackRef}
                  className="relative h-[60px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]"
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-2xl bg-gradient-to-r from-blue-500/40 to-cyan-400/30 transition-[width] duration-75"
                    style={{ width: `${sliderFill}px` }}
                  />

                  <div className="absolute inset-0 flex items-center justify-center px-16 text-sm font-semibold text-white/80">
                    {processing ? "Procesando compra..." : "Desliza para pagar"}
                  </div>

                  <button
                    ref={knobRef}
                    type="button"
                    disabled={processing}
                    onMouseDown={(e) => beginDrag(e.clientX)}
                    onTouchStart={(e) => {
                      if (!e.touches[0]) return;
                      beginDrag(e.touches[0].clientX);
                    }}
                    className="absolute left-[2px] top-[2px] flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black shadow-lg transition-transform duration-75 disabled:opacity-70"
                    style={{ transform: `translateX(${dragX}px)` }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>

                <p className="text-center text-xs text-white/40">
                  Desliza para confirmar el pago
                </p>
              </div>
            )}

            <button
              onClick={clearCart}
              disabled={cart.length === 0 || processing}
              className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 font-semibold transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Vaciar carrito
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}