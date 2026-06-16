"use client";

import { useEffect, useState } from "react";

export type ReceiptOrder = {
  id: string;
  order_number: number | null;
  total: number;
  status: string;
  created_at: string;
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    product_id: string;
    product_name: string;
    variant_name: string | null;
    product_description: string | null;
    product_category: string | null;
    licenses: Array<{
      id: string;
      license_text: string;
    }>;
  }>;
  customer_email?: string;
  customer_full_name?: string;
};

export default function OrderReceiptModal({
  order,
  onClose,
}: {
  order: ReceiptOrder | null;
  onClose: () => void;
}) {
  if (!order) return null;

  return (
    <OrderReceiptModalContent key={order.id} order={order} onClose={onClose} />
  );
}

function OrderReceiptModalContent({
  order,
  onClose,
}: {
  order: ReceiptOrder;
  onClose: () => void;
}) {
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);
  const [copiedAllLicenses, setCopiedAllLicenses] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow || "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const formatMoney = (value: number) => {
    return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
  };

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleDateString("es-CO", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Sin fecha";
    }
  };

  const formatOrderNumber = (value: number | null) => {
    if (!value) return "-----";
    return String(value).padStart(5, "0");
  };

  const getStatusLabel = (status: string) => {
    const normalized = (status || "").toLowerCase();

    if (normalized === "completed") return "Entregado";
    if (normalized === "paid") return "Pagado";
    if (normalized === "pending") return "Pendiente";
    if (normalized === "processing") return "Procesando";
    if (normalized === "cancelled") return "Cancelado";

    return status || "Completado";
  };

  const getStatusClasses = (status: string) => {
    const normalized = (status || "").toLowerCase();

    if (normalized === "completed" || normalized === "paid") {
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    }

    if (normalized === "pending") {
      return "border border-amber-400/20 bg-amber-400/10 text-amber-300";
    }

    if (normalized === "processing") {
      return "border border-blue-400/20 bg-blue-400/10 text-blue-300";
    }

    if (normalized === "cancelled") {
      return "border border-red-400/20 bg-red-400/10 text-red-300";
    }

    return "border border-white/10 bg-white/5 text-white/80";
  };

  const buildLicenseCopyText = (
    productName: string,
    variantName: string | null,
    licenseText: string
  ) => {
    const title = variantName
      ? `${productName} - ${variantName}`
      : productName;

    return `${title}\n\n${licenseText}`;
  };

  const copyLicense = async (
    productName: string,
    variantName: string | null,
    licenseText: string,
    licenseId: string
  ) => {
    try {
      const textToCopy = buildLicenseCopyText(
        productName,
        variantName,
        licenseText
      );

      await navigator.clipboard.writeText(textToCopy);
      setCopiedLicenseId(licenseId);
      setCopiedAllLicenses(false);

      setTimeout(() => setCopiedLicenseId(null), 1800);
    } catch {
      setCopiedLicenseId(null);
    }
  };

  const copyAllLicenses = async () => {
    try {
      const blocks = order.items.flatMap((item) =>
        item.licenses.map((license) =>
          buildLicenseCopyText(
            item.product_name,
            item.variant_name,
            license.license_text
          )
        )
      );

      if (blocks.length === 0) return;

      await navigator.clipboard.writeText(blocks.join("\n\n\n"));
      setCopiedAllLicenses(true);
      setCopiedLicenseId(null);

      setTimeout(() => setCopiedAllLicenses(false), 1800);
    } catch {
      setCopiedAllLicenses(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[75vh] w-full max-w-4xl overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1220]/95 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-5">
          <div>
            <h3 className="text-xl font-bold text-white md:text-2xl">
              Pedido recibido
            </h3>
            <p className="mt-1 text-xs text-white/45 md:text-sm">
              Comprobante #{formatOrderNumber(order.order_number)}
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4 text-white md:p-5">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] text-white/40">Pedido</p>
              <p className="mt-2 text-sm font-bold text-white">
                {formatOrderNumber(order.order_number)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] text-white/40">Estado</p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-1 text-xs ${getStatusClasses(
                  order.status
                )}`}
              >
                {getStatusLabel(order.status)}
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] text-white/40">Fecha</p>
              <p className="mt-2 text-xs text-white/85">
                {formatDate(order.created_at)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] text-white/40">Total</p>
              <p className="mt-2 text-sm font-bold text-emerald-300">
                {formatMoney(order.total)}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h4 className="text-base font-bold text-white">Servicios</h4>

            <div className="mt-3 space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">
                        {item.product_name}
                        {item.variant_name ? ` - ${item.variant_name}` : ""}
                      </p>
                      <p className="text-xs text-white/50">
                        {item.product_category || "Servicio digital"}
                      </p>
                    </div>

                    <div className="text-xs text-white/75 sm:text-right">
                      <p>Cant: {item.quantity}</p>
                      <p className="font-bold text-emerald-300">
                        {formatMoney(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-base font-bold text-white">Licencias</h4>

              {order.items.some((item) => item.licenses.length > 0) && (
                <button
                  type="button"
                  onClick={copyAllLicenses}
                  className="rounded bg-emerald-600 px-3 py-2 text-xs text-black hover:bg-emerald-500"
                >
                  {copiedAllLicenses ? "Copiado todo" : "Copiar todo"}
                </button>
              )}
            </div>

            {order.items.every((item) => item.licenses.length === 0) ? (
              <p className="mt-3 text-xs text-white/50">Sin licencias aún.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {order.items.map((item) =>
                  item.licenses.map((license) => (
                    <div
                      key={license.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <p className="mb-2 text-xs font-bold text-white">
                        {item.product_name}
                        {item.variant_name ? ` - ${item.variant_name}` : ""}
                      </p>

                      <div className="break-all rounded bg-black/60 p-2 text-xs text-white">
                        {license.license_text}
                      </div>

                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() =>
                            copyLicense(
                              item.product_name,
                              item.variant_name,
                              license.license_text,
                              license.id
                            )
                          }
                          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                        >
                          {copiedLicenseId === license.id ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {(order.customer_email || order.customer_full_name) && (
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h4 className="text-base font-bold text-white">Cliente</h4>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Correo
                  </p>
                  <p className="mt-2 break-all text-sm font-bold text-white">
                    {order.customer_email || "Sin correo"}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/45">
                    Nombre
                  </p>
                  <p className="mt-2 text-sm font-bold text-white">
                    {order.customer_full_name || "Sin nombre"}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}