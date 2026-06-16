"use client";

type LicenseItem = {
  id: string;
  product_name: string | null;
  delivered_email: string | null;
  delivered_username: string | null;
  delivered_password: string | null;
  delivered_access_url: string | null;
  delivered_note: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  licenses: LicenseItem[];
};

export default function OrderDetailsModal({
  open,
  onClose,
  orderId,
  licenses,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#111111] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/50">
              Pedido
            </p>
            <h2 className="mt-1 text-2xl font-bold">Detalles de entrega</h2>
            <p className="mt-1 text-sm text-white/60">{orderId}</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6">
          {licenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/70">
              Este pedido todavía no tiene licencias registradas.
            </div>
          ) : (
            <div className="space-y-4">
              {licenses.map((license) => (
                <div
                  key={license.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {license.product_name || "Producto sin nombre"}
                      </h3>
                      <p className="mt-1 text-xs text-white/50">
                        Entregado:{" "}
                        {new Date(license.created_at).toLocaleString("es-CO")}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Correo entregado
                      </p>
                      <p className="mt-2 break-all text-sm text-white">
                        {license.delivered_email || "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Usuario
                      </p>
                      <p className="mt-2 break-all text-sm text-white">
                        {license.delivered_username || "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Clave
                      </p>
                      <p className="mt-2 break-all text-sm text-white">
                        {license.delivered_password || "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                        Acceso / enlace
                      </p>
                      {license.delivered_access_url ? (
                        <a
                          href={license.delivered_access_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block break-all text-sm text-cyan-400 hover:text-cyan-300"
                        >
                          {license.delivered_access_url}
                        </a>
                      ) : (
                        <p className="mt-2 text-sm text-white">—</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Nota
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-white">
                      {license.delivered_note || "Sin nota adicional."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}