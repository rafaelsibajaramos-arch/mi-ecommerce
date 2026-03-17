"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { useCart } from "../../context/CartContext";

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart } = useCart();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Transferencia");

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const orderSummary = cart
      .map(
        (item) =>
          `- ${item.name} x${item.quantity} = $${item.price * item.quantity}`
      )
      .join("%0A");

    const message =
      `Hola, quiero confirmar mi pedido en StreamingMayor:%0A%0A` +
      `Nombre: ${name}%0A` +
      `Correo: ${email}%0A` +
      `Teléfono: ${phone}%0A` +
      `Método de pago: ${paymentMethod}%0A%0A` +
      `Pedido:%0A${orderSummary}%0A%0A` +
      `Total: $${total}`;

    clearCart();

    window.open(`https://wa.me/573117664491?text=${message}`, "_blank");
    router.push("/order-success");
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <Navbar />

      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Checkout
          </p>
          <h1 className="text-4xl font-extrabold mt-2">Finalizar compra</h1>
          <p className="text-gray-600 mt-3">
            Completa tus datos para procesar tu pedido.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-8">
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-8">
            <h2 className="text-2xl font-extrabold mb-6">Datos del cliente</h2>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre completo
                </label>
                <input
                  type="text"
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  placeholder="correo@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="text"
                  placeholder="+57 300 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>Transferencia</option>
                  <option>Nequi</option>
                  <option>Daviplata</option>
                  <option>Tarjeta</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={cart.length === 0}
                className="w-full bg-[#050816] text-white py-3 rounded-2xl font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                Confirmar pedido por WhatsApp
              </button>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-8 h-fit">
            <h2 className="text-2xl font-extrabold mb-6">Resumen del pedido</h2>

            {cart.length === 0 ? (
              <p className="text-gray-600">No hay productos en el carrito.</p>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-start border-b border-gray-100 pb-4"
                  >
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        Cantidad: {item.quantity}
                      </p>
                    </div>

                    <p className="font-bold">${item.price * item.quantity}</p>
                  </div>
                ))}

                <div className="pt-4 space-y-3">
                  <div className="flex justify-between text-gray-600">
                    <span>Productos</span>
                    <span>{totalItems}</span>
                  </div>

                  <div className="flex justify-between text-xl font-extrabold">
                    <span>Total</span>
                    <span>${total}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}