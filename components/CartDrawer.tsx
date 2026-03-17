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
  const dragValueRef = useRef(0);
  const startOffsetRef = useRef(0);

  const [dragX, setDragX] = useState(0);

  const resetSlider = () => {
    dragValueRef.current = 0;
    startOffsetRef.current = 0;
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
        setProcessing(false);
        resetSlider();
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, balance")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage("No se pudo cargar tu perfil.");
        setProcessing(false);
        resetSlider();
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
          .select("id, name, price, stock, is_active, product_type")
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
        setProcessing(false);
        resetSlider();
        return;
      }

      if (variantsError) {
        setMessage("No se pudieron validar las variantes.");
        setProcessing(false);
        resetSlider();
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
          setProcessing(false);
          resetSlider();
          return;
        }

        if (item.variantId) {
          const variant = variantsMap[item.variantId];

          if (!variant || !variant.is_active) {
            setMessage(`La variante de "${item.name}" ya no está disponible.`);
            setProcessing(false);
            resetSlider();
            return;
          }

          if (Number(variant.stock) < item.quantity) {
            setMessage(`No hay stock suficiente para "${item.name}".`);
            setProcessing(false);
            resetSlider();
            return;
          }

          validatedTotal += Number(variant.price) * item.quantity;
        } else {
          if (Number(product.stock) < item.quantity) {
            setMessage(`No hay stock suficiente para "${item.name}".`);
            setProcessing(false);
            resetSlider();
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
        setProcessing(false);
        resetSlider();
        return;
      }

      const newBalance = Number(profile.balance) - validatedTotal;

      const { error: balanceUpdateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user.id);

      if (balanceUpdateError) {
        setMessage("No se pudo descontar el saldo.");
        setProcessing(false);
        resetSlider();
        return;
      }

      for (const item of cart) {
        if (item.variantId) {
          const variant = variantsMap[item.variantId];
          const newStock = Number(variant.stock) - item.quantity;

          const { error } = await supabase
            .from("product_variants")
            .update({ stock: newStock })
            .eq("id", variant.id);

          if (error) {
            await supabase
              .from("profiles")
              .update({ balance: profile.balance })
              .eq("id", user.id);

            setMessage(`No se pudo actualizar el stock de "${item.name}".`);
            setProcessing(false);
            resetSlider();
            return;
          }
        } else {
          const product = productsMap[item.id];
          const newStock = Number(product.stock) - item.quantity;

          const { error } = await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", product.id);

          if (error) {
            await supabase
              .from("profiles")
              .update({ balance: profile.balance })
              .eq("id", user.id);

            setMessage(`No se pudo actualizar el stock de "${item.name}".`);
            setProcessing(false);
            resetSlider();
            return;
          }
        }
      }

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            total: validatedTotal,
            status: "paid",
          },
        ])
        .select()
        .single();

      if (orderError || !orderData) {
        await supabase
          .from("profiles")
          .update({ balance: profile.balance })
          .eq("id", user.id);

        setMessage("No se pudo crear el pedido.");
        setProcessing(false);
        resetSlider();
        return;
      }

      const orderItemsPayload = cart.map((item) => {
        const freshVariant = item.variantId ? variantsMap[item.variantId] : null;
        const freshProduct = productsMap[item.id];

        return {
          order_id: orderData.id,
          product_id: item.id,
          variant_id: item.variantId || null,
          quantity: item.quantity,
          unit_price: Number(freshVariant?.price ?? freshProduct?.price ?? item.price),
          item_type: item.variantId ? "variant" : "simple",
          product_name: freshProduct?.name || item.name,
          variant_name: item.variantName || null,
        };
      });

      const { error: orderItemsError } = await supabase
        .from("order_items")
        .insert(orderItemsPayload);

      if (orderItemsError) {
        await supabase.from("orders").delete().eq("id", orderData.id);
        await supabase
          .from("profiles")
          .update({ balance: profile.balance })
          .eq("id", user.id);

        setMessage("No se pudo guardar el detalle del pedido.");
        setProcessing(false);
        resetSlider();
        return;
      }

      clearCart();
      setSuccessMessage(
        `Compra realizada con éxito. Total pagado: $${validatedTotal.toLocaleString()}.`
      );
      resetSlider();
    } catch {
      setMessage("Ocurrió un error inesperado al procesar la compra.");
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
    startOffsetRef.current = clientX - trackRect.left - dragValueRef.current;

    const onMove = (moveX: number) => {
      if (!trackRef.current || !knobRef.current) return;

      const trackWidth = trackRef.current.offsetWidth;
      const knobWidth = knobRef.current.offsetWidth;
      const maxX = trackWidth - knobWidth - 4;

      const next = Math.min(
        Math.max(moveX - trackRect.left - startOffsetRef.current, 0),
        maxX
      );

      dragValueRef.current = next;
      setDragX(next);
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      onMove(e.touches[0].clientX);
    };

    const endDrag = async () => {
      if (!trackRef.current || !knobRef.current) {
        cleanup();
        resetSlider();
        return;
      }

      const trackWidth = trackRef.current.offsetWidth;
      const knobWidth = knobRef.current.offsetWidth;
      const maxX = trackWidth - knobWidth - 4;
      const threshold = maxX * 0.8;

      const confirmed = dragValueRef.current >= threshold;

      cleanup();

      if (confirmed) {
        dragValueRef.current = maxX;
        setDragX(maxX);
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
                    className="absolute inset-y-0 left-0 rounded-2xl bg-gradient-to-r from-blue-500/40 to-cyan-400/30 transition-[width] duration-150"
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
                    className="absolute left-[2px] top-[2px] flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black shadow-lg transition disabled:opacity-70"
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