import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function OrderSuccessPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <Navbar />

      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-10 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-4xl mx-auto mb-6">
            ✓
          </div>

          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-2">
            Pedido confirmado
          </p>

          <h1 className="text-4xl font-extrabold mb-4">
            Gracias por tu compra
          </h1>

          <p className="text-gray-600 text-lg max-w-xl mx-auto">
            Hemos recibido tu solicitud. Puedes continuar el proceso de atención
            y confirmación por WhatsApp.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="bg-[#050816] text-white px-6 py-3 rounded-2xl font-semibold hover:opacity-90 transition"
            >
              Volver al inicio
            </Link>

            <Link
              href="/shop"
              className="border border-gray-300 px-6 py-3 rounded-2xl font-semibold hover:bg-gray-100 transition"
            >
              Seguir comprando
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}