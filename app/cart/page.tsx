"use client";

import Navbar from "../../components/Navbar";
import { useCart } from "../../context/CartContext";
import Link from "next/link";

export default function CartPage() {
  const {
    cart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <Navbar />

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Carrito
          </p>
          <h1 className="text-4xl font-extrabold mt-2">Tus productos</h1>
        </div>

        {cart.length === 0 ? (
          <div className="bg-white rounded-3xl border p-10">
            <p className="text-lg text-gray-600">Tu carrito está vacío.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[2fr_1fr] gap-8">
            <div className="space-y-4">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border p-4 flex gap-4 items-center"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-24 h-24 object-cover rounded-xl"
                  />

                  <div className="flex-1">
                    <h3 className="text-lg font-bold">{item.name}</h3>
                    <p className="text-gray-600 mt-1">${item.price} c/u</p>

                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={() => decreaseQuantity(item.id)}
                        className="w-9 h-9 rounded-lg border hover:bg-gray-100"
                      >
                        -
                      </button>

                      <span className="font-semibold min-w-[24px] text-center">
                        {item.quantity}
                      </span>

                      <button
                        onClick={() => increaseQuantity(item.id)}
                        className="w-9 h-9 rounded-lg border hover:bg-gray-100"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold mb-3">
                      ${item.price * item.quantity}
                    </p>

                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="bg-red-500 text-white px-4 py-2 rounded-xl hover:opacity-90 transition"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border p-6 h-fit">
              <h2 className="text-2xl font-extrabold mb-4">Resumen</h2>

              <div className="flex justify-between text-lg mb-3">
                <span>Productos</span>
                <span>
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              </div>

              <div className="flex justify-between text-lg mb-6">
                <span>Total</span>
                <span className="font-bold">${total}</span>
              </div>

              <Link
             href="/checkout"
             className="block w-full text-center bg-black text-white py-3 rounded-xl font-semibold hover:opacity-90 transition"
             >
              Proceder al pago
              </Link>

              <button
                onClick={clearCart}
                className="w-full mt-3 border border-gray-300 py-3 rounded-xl font-semibold hover:bg-gray-100 transition"
              >
                Vaciar carrito
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
