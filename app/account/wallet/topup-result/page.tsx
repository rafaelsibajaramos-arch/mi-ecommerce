"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

type TopupRow = {
  id: string;
  reference: string;
  amount: number;
  status: string | null;
  wompi_transaction_id: string | null;
  wompi_status: string | null;
  wompi_payment_method_type: string | null;
  error_message: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  credited_at: string | null;
};

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "PENDING").trim().toUpperCase();
}

function WalletTopupResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reference = searchParams.get("reference") || "";
  const transactionId = searchParams.get("id") || "";

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Validando tu recarga...");
  const [topup, setTopup] = useState<TopupRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const syncStatus = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.push("/login");
          return;
        }

        const response = await fetch("/api/wallet/topups/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reference,
            transactionId,
          }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || "No se pudo validar la recarga.");
        }

        if (cancelled) return;

        const currentTopup = (result?.topup as TopupRow | null) || null;
        setTopup(currentTopup);

        const normalizedStatus = normalizeStatus(
          currentTopup?.wompi_status || currentTopup?.status
        );

        if (normalizedStatus === "APPROVED") {
          setMessage("Tu recarga fue aprobada y ya quedó abonada en tu billetera.");
          setLoading(false);

          if (intervalId) {
            window.clearInterval(intervalId);
          }

          return;
        }

        if (
          normalizedStatus === "DECLINED" ||
          normalizedStatus === "VOIDED" ||
          normalizedStatus === "ERROR"
        ) {
          setMessage(
            currentTopup?.error_message ||
              "La recarga no se pudo completar. Intenta de nuevo."
          );
          setLoading(false);

          if (intervalId) {
            window.clearInterval(intervalId);
          }

          return;
        }

        setMessage(
          "Tu pago sigue en proceso. En unos segundos actualizamos el estado automáticamente."
        );
        setLoading(false);
      } catch (error) {
        if (cancelled) return;

        setMessage(
          error instanceof Error
            ? error.message
            : "Ocurrió un error validando la recarga."
        );
        setLoading(false);
      }
    };

    if (!reference) {
      setMessage("No encontramos la referencia de la recarga.");
      setLoading(false);
      return;
    }

    void syncStatus();

    intervalId = window.setInterval(() => {
      void syncStatus();
    }, 5000);

    return () => {
      cancelled = true;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [reference, router, transactionId]);

  const status = useMemo(() => {
    return normalizeStatus(topup?.wompi_status || topup?.status);
  }, [topup?.status, topup?.wompi_status]);

  const badgeClass =
    status === "APPROVED"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : status === "DECLINED" || status === "VOIDED" || status === "ERROR"
      ? "border-red-400/20 bg-red-400/10 text-red-300"
      : "border-amber-400/20 bg-amber-400/10 text-amber-300";

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-white">
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/45">
            Wallet
          </p>

          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">
            Estado de tu recarga
          </h1>

          <p className="mt-3 text-white/65">{message}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-4 py-2 text-sm font-semibold ${badgeClass}`}
            >
              {status === "APPROVED"
                ? "Aprobada"
                : status === "DECLINED"
                ? "Declinada"
                : status === "VOIDED"
                ? "Anulada"
                : status === "ERROR"
                ? "Error"
                : "Pendiente"}
            </span>

            {topup?.wompi_payment_method_type && (
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/75">
                {topup.wompi_payment_method_type}
              </span>
            )}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                Referencia
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-white/90">
                {reference || "Sin referencia"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                Monto
              </p>
              <p className="mt-2 text-xl font-black text-white">
                {formatMoney(topup?.amount)}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/account/wallet"
              className="inline-flex items-center justify-center rounded-2xl bg-[#050816] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              Volver a mi billetera
            </Link>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              Actualizar estado
            </button>
          </div>

          {loading && (
            <p className="mt-4 text-sm text-white/45">
              Estamos consultando el estado más reciente...
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function WalletTopupResultFallback() {
  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-white">
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/45">
            Wallet
          </p>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">
            Estado de tu recarga
          </h1>
          <p className="mt-3 text-white/65">Cargando información de la recarga...</p>
        </div>
      </section>
    </main>
  );
}

export default function WalletTopupResultPage() {
  return (
    <Suspense fallback={<WalletTopupResultFallback />}>
      <WalletTopupResultContent />
    </Suspense>
  );
}