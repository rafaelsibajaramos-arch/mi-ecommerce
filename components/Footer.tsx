import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#050816] text-white mt-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <h3 className="text-2xl font-extrabold">StreamingMayor</h3>
          <p className="text-white/70 mt-3 text-sm leading-6">
            Soluciones y servicios digitales con una experiencia moderna,
            rápida y confiable.
          </p>
        </div>

        <div>
          <h4 className="font-bold mb-4">Navegación</h4>
          <ul className="space-y-2 text-white/70 text-sm">
            <li>
              <Link href="/">Inicio</Link>
            </li>
            <li>
              <Link href="/shop">Tienda</Link>
            </li>
            <li>
              <Link href="/contact">Contacto</Link>
            </li>
            <li>
              <Link href="/cart">Carrito</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-4">Servicios</h4>
          <ul className="space-y-2 text-white/70 text-sm">
            <li>Streaming</li>
            <li>Entretenimiento</li>
            <li>Accesos digitales</li>
            <li>Soporte</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-4">Contacto</h4>
          <ul className="space-y-2 text-white/70 text-sm">
            <li>WhatsApp</li>
            <li>Instagram</li>
            <li>Correo</li>
            <li>Atención al cliente</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 text-sm text-white/50">
          © 2026 StreamingMayor. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}