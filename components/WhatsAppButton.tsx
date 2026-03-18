export default function WhatsAppButton() {
  const phone = "573117664491";
  const message = encodeURIComponent(
    "Hola, vengo desde StreamingMayor y quiero información."
  );

  return (
    <a
      href={`https://wa.me/${phone}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="group fixed bottom-5 right-5 z-[120] flex items-center gap-3 rounded-full border border-white/10 bg-black/65 px-3 py-3 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:bg-black/80"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] shadow-[0_6px_18px_rgba(37,211,102,0.35)]">
        <svg
          viewBox="0 0 32 32"
          className="h-5 w-5 fill-current text-white"
          aria-hidden="true"
        >
          <path d="M19.11 17.23c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.31.2-.58.07-.27-.14-1.12-.41-2.14-1.31-.79-.71-1.32-1.58-1.48-1.85-.16-.27-.02-.41.12-.55.12-.12.27-.31.41-.47.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.47-.07-.14-.61-1.47-.84-2.02-.22-.53-.44-.45-.61-.46h-.52c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.27 0 1.34.97 2.64 1.11 2.82.14.18 1.91 2.92 4.63 4.09.65.28 1.16.45 1.56.57.66.21 1.27.18 1.75.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.06-.11-.24-.18-.51-.32Z" />
          <path d="M16.01 3.2c-7.07 0-12.81 5.73-12.81 12.79 0 2.26.59 4.46 1.71 6.4L3.1 28.8l6.57-1.72a12.8 12.8 0 0 0 6.34 1.62h.01c7.06 0 12.8-5.73 12.8-12.79 0-3.42-1.33-6.64-3.75-9.06A12.72 12.72 0 0 0 16.01 3.2Zm0 23.35h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-3.9 1.02 1.04-3.8-.25-.39a10.58 10.58 0 0 1-1.63-5.67c0-5.86 4.78-10.63 10.66-10.63 2.84 0 5.51 1.1 7.52 3.11a10.53 10.53 0 0 1 3.12 7.51c0 5.86-4.79 10.63-10.66 10.63Z" />
        </svg>
      </span>

      <div className="hidden sm:block leading-tight">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
          Contacto
        </p>
        <p className="text-sm font-semibold text-white">WhatsApp</p>
      </div>
    </a>
  );
}