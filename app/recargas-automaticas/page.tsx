"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  IMAGE_INPUT_ACCEPT,
  convertImageFileToWebp,
  createImageStoragePath,
  getImageUploadErrorMessage,
} from "../../lib/imageUpload";

const PRESET_AMOUNTS = [100, 1000, 5000, 10000, 20000, 50000];
const BREB_DESTINATION = "Bre-B / Llaves - 3117664491";

type BannerState = { kind: "success" | "error" | "info"; text: string } | null;

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

export default function AutomaticTopupsPage() {
  const router = useRouter();
  const [amountInput, setAmountInput] = useState("10000");
  const [payerOrigin, setPayerOrigin] = useState("");
  const destinationAccount = BREB_DESTINATION;
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;
      setIsLoggedIn(Boolean(user));
      setCheckingSession(false);
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncSession();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const parsedAmount = useMemo(() => Math.max(0, Math.round(Number(amountInput || 0))), [amountInput]);

  async function uploadReceipt(userId: string) {
    if (!receiptFile) throw new Error("Selecciona la foto del comprobante.");

    const webpFile = await convertImageFileToWebp(receiptFile, { quality: 0.82 });
    const path = createImageStoragePath("receipts").replace("receipts/", `receipts/${userId}/`);

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, webpFile, { contentType: "image/webp", upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from("receipts").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (parsedAmount < 100) {
      setBanner({ kind: "error", text: "El monto mínimo de recarga es $ 100 COP." });
      return;
    }

    if (!payerOrigin.trim()) {
      setBanner({ kind: "error", text: "Ingresa el nombre exacto de quien envió el pago, tal como aparece en el correo Bre-B." });
      return;
    }

    if (!receiptFile) {
      setBanner({ kind: "error", text: "Sube el comprobante como respaldo." });
      return;
    }

    try {
      setTopupLoading(true);
      setBanner(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || !session.user?.id) {
        setBanner({ kind: "info", text: "Primero inicia sesión para reportar tu recarga." });
        router.push("/");
        return;
      }

      const receiptUrl = await uploadReceipt(session.user.id);

      const response = await fetch("/api/wallet/topups/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: parsedAmount,
          payerOrigin,
          destinationAccount,
          receiptUrl,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "No se pudo reportar la recarga.");

      router.push(`/account/wallet/topup-result?reference=${encodeURIComponent(result.reference)}`);
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : getImageUploadErrorMessage(error),
      });
      setTopupLoading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setReceiptFile(event.target.files?.[0] || null);
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-8 text-white md:px-6 md:py-10">
      <section className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/45">Recargas automáticas</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">
            Recarga automática por Bre-B / Llaves
          </h1>
          <p className="mt-4 text-base text-white/70 md:text-lg">
            Paga por Bre-B / Llaves a la llave 3117664491 y reporta el monto exacto junto con el nombre de quien envió el pago. El correo oficial de Nequi/Bre-B no trae celular origen; trae el nombre del remitente. Si el monto y el nombre coinciden, el sistema acredita el saldo al instante. Si el correo se demora, queda pendiente para revisión manual con tu comprobante.
          </p>
        </div>

        {banner && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${banner.kind === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                : banner.kind === "info"
                  ? "border-blue-400/20 bg-blue-400/10 text-blue-300"
                  : "border-red-400/20 bg-red-400/10 text-red-300"
              }`}
          >
            {banner.text}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white/75">Monto exacto que transferiste</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-lg font-semibold text-white outline-none transition focus:border-blue-400/40 focus:bg-white/10"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setAmountInput(String(amount))}
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${parsedAmount === amount
                        ? "border-blue-400/30 bg-blue-500/15 text-blue-300"
                        : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                      }`}
                  >
                    {formatMoney(amount)}
                  </button>
                ))}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white/75">Llave Bre-B destino</label>
                <div className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3.5 text-white">
                  {BREB_DESTINATION}
                </div>
                <p className="mt-2 text-xs text-white/45">Paga exactamente a esta llave y conserva el comprobante.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white/75">Nombre de quien envió el pago</label>
                <input
                  value={payerOrigin}
                  onChange={(event) => setPayerOrigin(event.target.value)}
                  placeholder="Ej: DANNA GABRIELA NAVARRO"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-white outline-none transition focus:border-blue-400/40 focus:bg-white/10"
                />
                <p className="mt-2 text-xs text-white/45">Debe coincidir con el nombre que aparece en el correo: “Recibiste $X de NOMBRE...”.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white/75">Foto del comprobante</label>
                <input
                  type="file"
                  accept={IMAGE_INPUT_ACCEPT}
                  onChange={handleFileChange}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-500/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-200"
                />
              </div>

              <button
                type="submit"
                disabled={checkingSession || topupLoading || parsedAmount < 100}
                className="w-full rounded-2xl bg-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checkingSession ? "Validando sesión..." : topupLoading ? "Validando recarga..." : isLoggedIn ? "Reportar y validar recarga" : "Inicia sesión para recargar"}
              </button>
            </div>
          </form>

          <aside className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <h2 className="text-xl font-extrabold">Cómo queda automático</h2>
            <div className="mt-4 space-y-4 text-sm text-white/65">
              <p><strong className="text-white">1.</strong> Bre-B / Llaves manda el correo oficial cuando entra el pago.</p>
              <p><strong className="text-white">2.</strong> El parser guarda monto, nombre del remitente, referencia y fecha del correo oficial.</p>
              <p><strong className="text-white">3.</strong> Tu reporte se cruza por monto exacto + nombre del remitente.</p>
              <p><strong className="text-white">4.</strong> Si coincide, se acredita. Si no, queda pendiente con tu comprobante.</p>
            </div>
            <Link href="/account/wallet" className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10">
              Ver mi billetera
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
