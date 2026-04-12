"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  calculateTopupCustomerPaysFee,
  COLOMBIA_VAT_RATE,
  WOMPI_ADVANCED_FIXED_FEE,
} from "../../lib/wompiPricing";

type BannerState = {
  kind: "success" | "error" | "info";
  text: string;
} | null;

const PRESET_AMOUNTS = [10000, 20000, 30000, 40000, 50000];

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

export default function AutomaticTopupsPage() {
  const router = useRouter();

  const [amountInput, setAmountInput] = useState("10000");
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

  useEffect(() => {
    if (!banner) return;

    const timer = window.setTimeout(() => {
      setBanner(null);
    }, 7000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [banner]);

  const parsedAmount = useMemo(() => {
    return Math.max(0, Math.round(Number(amountInput || 0)));
  }, [amountInput]);

  const customerPaysSummary = useMemo(() => {
    return calculateTopupCustomerPaysFee(parsedAmount);
  }, [parsedAmount]);

  const handlePresetClick = (value: number) => {
    setAmountInput(String(value));
  };

  const handleStartTopup = async () => {
    if (parsedAmount < 1000) {
      setBanner({
        kind: "error",
        text: "El saldo mínimo recomendado para recargar es $ 1.000 COP.",
      });
      return;
    }

    if (!isLoggedIn) {
      setBanner({
        kind: "info",
        text: "Primero inicia sesión para poder completar la recarga.",
      });
      router.push("/");
      return;
    }

    try {
      setTopupLoading(true);
      setBanner(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/");
        return;
      }

      const response = await fetch("/api/wallet/topups/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: parsedAmount,
          pricingMode: "customer_pays_fee",
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "No se pudo iniciar la recarga.");
      }

      if (!result?.checkout_url) {
        throw new Error("No se recibió la URL del checkout.");
      }

      window.location.href = String(result.checkout_url);
    } catch (error) {
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error iniciando la recarga.",
      });
      setTopupLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-transparent px-4 py-8 text-white md:px-6 md:py-10">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                Recargas automáticas
              </p>
              <h1 className="mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">
                Recarga saldo a tu billetera de forma automática
              </h1>
              <p className="mt-4 text-base text-white/70 md:text-lg">
                Recarga tu saldo de forma segura a través de Wompi. Antes de
                pagar podrás ver el costo de procesamiento y el valor total de
                tu recarga.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/70">
                  Tarifa de procesamiento
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-300">
                  2,65%
                </p>
                <p className="mt-1 text-sm text-emerald-200/80">
                  + {formatMoney(WOMPI_ADVANCED_FIXED_FEE)} + IVA
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                  IVA aplicado
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {(COLOMBIA_VAT_RATE * 100).toFixed(0)}%
                </p>
                <p className="mt-1 text-sm text-white/60">
                  Aplicado sobre la comisión de procesamiento
                </p>
              </div>
            </div>
          </div>
        </div>

        {banner && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
              banner.kind === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                : banner.kind === "info"
                ? "border-blue-400/20 bg-blue-400/10 text-blue-300"
                : "border-red-400/20 bg-red-400/10 text-red-300"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
                  Simulador
                </p>
                <h2 className="mt-2 text-2xl font-extrabold md:text-3xl">
                  Simula tu recarga antes de pagar
                </h2>
                <p className="mt-3 text-white/65">
                  Ingresa el saldo que deseas recibir en tu billetera. El
                  simulador te mostrará el costo de procesamiento y el total
                  aproximado que deberás pagar.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-white/75">
                  Saldo que deseas recibir
                </label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  placeholder="10000"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-lg font-semibold text-white outline-none transition focus:border-blue-400/40 focus:bg-white/10"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => handlePresetClick(amount)}
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                      parsedAmount === amount
                        ? "border-blue-400/30 bg-blue-500/15 text-blue-300"
                        : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {formatMoney(amount)}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/70">
                    Resumen de tu recarga
                  </p>
                  <h3 className="mt-2 text-xl font-black text-emerald-300">
                    Total estimado de la operación
                  </h3>

                  <div className="mt-4 space-y-2 text-sm text-emerald-100/90">
                    <div className="flex items-center justify-between gap-4">
                      <span>Saldo a recibir</span>
                      <strong>
                        {formatMoney(customerPaysSummary.targetCreditAmount)}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span>Costo de procesamiento</span>
                      <strong>
                        {formatMoney(customerPaysSummary.processingFee)}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between gap-4 border-t border-emerald-300/15 pt-2 text-base font-bold text-white">
                      <span>Total a pagar</span>
                      <strong>
                        {formatMoney(customerPaysSummary.totalToPay)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                    ¿Cómo funciona esta recarga?
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white">
                    Información importante
                  </h3>

                  <div className="mt-4 space-y-3 text-sm text-white/75">
                    <p>
                      El saldo que eliges en el simulador es el saldo que
                      recibirás en tu billetera cuando el pago sea aprobado.
                    </p>
                    <p>
                      El costo de procesamiento se suma al valor final del pago y
                      se muestra antes de que continúes con la recarga.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100/90">
                <strong className="text-amber-200">Importante:</strong> la
                recarga automática tiene un costo adicional por procesamiento.
                Te recomendamos usar este método solo cuando realmente
                necesites recargar saldo de forma inmediata.
                <p className="mt-2 text-amber-100/85">
                  Antes de continuar, revisa el valor total a pagar mostrado por
                  el simulador.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleStartTopup}
                    disabled={checkingSession || topupLoading || parsedAmount < 1000}
                    className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_22px_rgba(14,165,233,0.2)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {checkingSession
                      ? "Validando sesión..."
                      : topupLoading
                      ? "Redirigiendo a Wompi..."
                      : isLoggedIn
                      ? "Continuar con el pago"
                      : "Inicia sesión para recargar"}
                  </button>

                  <Link
                    href={isLoggedIn ? "/account/wallet" : "/"}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    {isLoggedIn ? "Volver a mi billetera" : "Ir al inicio"}
                  </Link>
                </div>

                <p className="text-sm text-white/55">
                  Total estimado a pagar:{" "}
                  <span className="font-semibold text-white">
                    {formatMoney(customerPaysSummary.totalToPay)}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
                Instrucciones
              </p>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                    1. Ingresa el saldo que deseas recibir
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    Escribe el valor que quieres que se abone a tu billetera.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                    2. Revisa el total a pagar
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    El simulador calculará el costo de procesamiento y te
                    mostrará el valor final antes del pago.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                    3. Completa el pago
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    Podrás pagar con los medios habilitados en la plataforma,
                    como Nequi, Daviplata o PSE.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                    4. Recibe tu saldo automáticamente
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    Una vez el pago sea aprobado, el saldo se abonará
                    automáticamente a tu billetera.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
                Información de tarifas
              </p>

              <div className="mt-4 space-y-3 text-sm text-white/70">
                <p>
                  Esta recarga utiliza la tarifa pública vigente de Wompi para
                  calcular el costo de procesamiento.
                </p>

                <p>
                  <strong className="text-white">Porcentaje:</strong> 2,65% por
                  transacción exitosa.
                </p>

                <p>
                  <strong className="text-white">Cargo fijo:</strong> $700.
                </p>

                <p>
                  <strong className="text-white">IVA:</strong> 19% sobre la
                  comisión.
                </p>

                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                  Los valores mostrados en esta página son estimados con base en
                  la tarifa pública vigente de Wompi.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}