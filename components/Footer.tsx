export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-black/55 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm text-white/70 md:flex-row md:px-6">
        <p className="text-center md:text-left">
          © 2026 StreamingMayor. Todos los derechos reservados.
        </p>

        <p className="text-center md:text-right">
          Desarrollado por <span className="font-extrabold text-white">StreamingMayor</span>
        </p>
      </div>
    </footer>
  );
}