"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

type TopupRow = {
  id: string;
  reference: string;
  amount: number;
  amount_in_cents: number;
  status: string | null;
  provider: string | null;
  payer_origin?: string | null;
  destination_account?: string | null;
  receipt_url?: string | null;
  matched_bank_reference?: string | null;
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

  const [loading, setLoading] = useState(Boolean(reference));
  const [message, setMessage] = useState(
    reference ? "Validando recarga..." : "No encontramos la referencia de la recarga."
  );
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
          router.push("/");
          return;
        }

        const response = await fetch("/api/wallet/topups/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reference }),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "No se pudo validar la recarga.");
        if (cancelled) return;

        const currentTopup = (result?.topup as TopupRow | null) || null;
        setTopup(currentTopup);

        const normalizedStatus = normalizeStatus(currentTopup?.status);

        if (normalizedStatus === "APPROVED") {
          setMessage("Saldo acreditado correctamente.");
          setLoading(false);
          if (intervalId) window.clearInterval(intervalId);
          return;
        }

        if (
          normalizedStatus === "REJECTED" ||
          normalizedStatus === "DECLINED" ||
          normalizedStatus === "ERROR"
        ) {
          setMessage(currentTopup?.error_message || "La recarga no fue aprobada.");
          setLoading(false);
          if (intervalId) window.clearInterval(intervalId);
          return;
        }

        setMessage("Pendiente de validación.");
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "No se pudo validar la recarga.");
        setLoading(false);
      }
    };

    if (!reference) return;

    void syncStatus();
    intervalId = window.setInterval(() => void syncStatus(), 5000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [reference, router]);

  const status = useMemo(() => normalizeStatus(topup?.status), [topup?.status]);
  const isApproved = status === "APPROVED";
  const isRejected = status === "REJECTED" || status === "DECLINED" || status === "ERROR";

  const statusLabel = isApproved ? "Aprobada" : isRejected ? "No aprobada" : "Pendiente";
  const title = isApproved ? "Recarga aprobada" : isRejected ? "Recarga no aprobada" : "Recarga pendiente";

  const badgeClass = isApproved
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
    : isRejected
    ? "border-red-400/20 bg-red-400/10 text-red-300"
    : "border-amber-400/20 bg-amber-400/10 text-amber-300";

  return (
    <main className="bg-transparent px-4 py-4 text-white sm:px-6 sm:py-7">
      <section className="mx-auto max-w-xl">
        <div className="rounded-[24px] border border-white/10 bg-slate-800/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.32)] backdrop-blur-md sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h1>
              {(loading || isRejected || !topup) && (
                <p className={`mt-1.5 text-sm ${isRejected ? "text-red-300" : "text-white/55"}`}>
                  {loading ? "Consultando estado..." : message}
                </p>
              )}
            </div>

            <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${badgeClass}`}>
              {statusLabel}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/70">
              Saldo a acreditar
            </p>
            <p className="mt-1 text-3xl font-black leading-none text-emerald-300">
              {formatMoney(topup?.amount)}
            </p>
          </div>

          <div className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Origen</p>
              <p className="mt-1 truncate text-base font-bold text-white">{topup?.payer_origin || "-"}</p>
            </div>

            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Referencia</p>
              <p className="mt-1 break-all text-xs font-semibold leading-5 text-white/85">
                {reference || "Sin referencia"}
              </p>
            </div>

            {topup?.matched_bank_reference && (
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/60">
                  Referencia bancaria
                </p>
                <p className="mt-1 break-all text-xs font-semibold leading-5 text-emerald-100">
                  {topup.matched_bank_reference}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Link
              href="/account/wallet"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#050816] px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-95"
            >
              Mi billetera
            </Link>
            <Link
              href="/recargas-automaticas"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm font-semibold text-white/85 transition hover:bg-white/10"
            >
              Nueva recarga
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function WalletTopupResultFallback() {
  return (
    <main className="bg-transparent px-4 py-4 text-white sm:px-6 sm:py-7">
      <section className="mx-auto max-w-xl">
        <div className="rounded-[24px] border border-white/10 bg-slate-800/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.32)] backdrop-blur-md sm:p-6">
          <h1 className="text-2xl font-extrabold">Estado de tu recarga</h1>
          <p className="mt-2 text-sm text-white/55">Consultando estado...</p>
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
