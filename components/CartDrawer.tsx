"use client";

import Link from "next/link";
import { useCart } from "../context/CartContext";

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

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <>
      {isCartOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={closeCart}
        />
      )}

      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full bg-[#07142f] text-white shadow-2xl transition-transform duration-300 sm:w-[430px] ${
          isCartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <h2 className="text-2xl font-extrabold">Mi Carrito</h2>

          <button
            onClick={closeCart}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none hover:bg-white/20"
          >
            ×
          </button>
        </div>

        <div className="flex h-[calc(100%-80px)] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {cart.length === 0 ? (
              <p className="text-white/70">Tu carrito está vacío.</p>
            ) : (
              cart.map((item) => (
                <div
                  key={`${item.id}-${item.variantId || "base"}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex gap-4">
                    <img
                      src={item.image || "/placeholder.png"}
                      alt={item.name}
                      className="h-20 w-20 rounded-xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-bold leading-5 text-white">
                        {item.name}
                      </h3>

                      {item.variantName && (
                        <p className="mt-1 text-xs font-medium text-blue-300">
                          Variación: {item.variantName}
                        </p>
                      )}

                      <p className="mt-2 text-white/70">
                        ${Number(item.price).toLocaleString()} c/u
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              decreaseQuantity(item.id, item.variantId || null)
                            }
                            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20"
                          >
                            -
                          </button>

                          <span className="min-w-[24px] text-center font-semibold">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              increaseQuantity(item.id, item.variantId || null)
                            }
                            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(item.id, item.variantId || null)
                          }
                          className="text-sm text-red-400 hover:underline"
                        >
                          Quitar
                        </button>
                      </div>

                      <p className="mt-4 font-semibold text-blue-400">
                        Subtotal: $
                        {Number(item.price * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4 border-t border-white/10 p-5">
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="text-blue-400">
                ${Number(total).toLocaleString()}
              </span>
            </div>

            <Link
              href="/cart"
              onClick={closeCart}
              className="block w-full rounded-xl bg-black py-3 text-center font-semibold text-white transition hover:opacity-90"
            >
              Ver carrito
            </Link>

            <button
              onClick={clearCart}
              className="w-full rounded-xl border border-white/10 bg-white/10 py-3 font-semibold transition hover:bg-white/15"
            >
              Vaciar carrito
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}