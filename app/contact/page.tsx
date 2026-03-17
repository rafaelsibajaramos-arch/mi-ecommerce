import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <Navbar />

      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Contacto
          </p>
          <h1 className="text-4xl font-extrabold mt-2">
            Hablemos de tu pedido
          </h1>
          <p className="text-gray-600 mt-3 max-w-2xl">
            En StreamingMayor estamos listos para ayudarte con soporte,
            compras, consultas y atención personalizada.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-8">
            <h2 className="text-2xl font-extrabold mb-6">
              Información de contacto
            </h2>

            <div className="space-y-5 text-gray-700">
              <div>
                <p className="text-sm text-gray-500">WhatsApp</p>
                <p className="text-lg font-semibold">+57 300 000 0000</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Correo</p>
                <p className="text-lg font-semibold">
                  contacto@streamingmayor.com
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Instagram</p>
                <p className="text-lg font-semibold">@streamingmayor</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Horario</p>
                <p className="text-lg font-semibold">
                  Lunes a Sábado · 8:00 AM a 8:00 PM
                </p>
              </div>
            </div>

            <div className="mt-8 bg-[#050816] text-white rounded-2xl p-6">
              <p className="text-sm uppercase tracking-[0.2em] text-white/60 mb-2">
                Soporte rápido
              </p>
              <h3 className="text-2xl font-extrabold">
                Atención clara y directa
              </h3>
              <p className="text-white/70 mt-3">
                Resolvemos dudas sobre productos, pagos, accesos y seguimiento
                de pedidos.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-8">
            <h2 className="text-2xl font-extrabold mb-6">
              Envíanos un mensaje
            </h2>

            <form className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  placeholder="Tu nombre"
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correo
                </label>
                <input
                  type="email"
                  placeholder="tucorreo@email.com"
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mensaje
                </label>
                <textarea
                  placeholder="Escribe tu mensaje..."
                  rows={6}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#050816] text-white py-3 rounded-2xl font-semibold hover:opacity-90 transition"
              >
                Enviar mensaje
              </button>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}