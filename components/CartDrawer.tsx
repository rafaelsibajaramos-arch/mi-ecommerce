"use client";

import { useMemo, useRef, useState } from "react";
import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";

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
    () => cart.reduce((acc, item) => acc + Number(item.price) * item.quantity, 0),
    [cart]
  );

  const totalItems = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  const [message, setMessage] = useState("");
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

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let accessToken = session?.access_token || null;

      if (!accessToken) {
        const { data: refreshed, error: refreshError } =
          await supabase.auth.refreshSession();

        if (refreshError || !refreshed.session?.access_token) {
          setMessage("Debes iniciar sesión para completar la compra.");
          resetSlider();
          return;
        }

        accessToken = refreshed.session.access_token;
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          cart: cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: Number(item.quantity),
            variantId: item.variantId || null,
            variantName: item.variantName || null,
          })),
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(result?.error || "No se pudo completar la compra.");
        resetSlider();
        return;
      }

      clearCart();
      closeCart();
      resetSlider();
      window.location.href = result?.redirectTo || "/account/orders";
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

  if (!isCartOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={closeCart}
      />

      <aside className="fixed top-0 right-0 z-50 h-full w-full bg-[#041533] text-white shadow-2xl sm:w-[430px]">
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