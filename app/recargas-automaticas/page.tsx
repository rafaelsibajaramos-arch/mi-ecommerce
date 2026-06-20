"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const PRESET_AMOUNTS = [1000, 5000, 10000, 20000, 30000, 50000, 100000];
const BREB_KEY = "3117664491";
const BREB_DESTINATION = `Bre-B / Llaves - ${BREB_KEY}`;

type BannerState = { kind: "success" | "error" | "info"; text: string } | null;
type PromotionBonusType = "PERCENTAGE" | "FIXED";

type PublicTopupPromotion = {
  id: string;
  name: string;
  minAmount: number;
  bonusType: PromotionBonusType;
  bonusValue: number;
  startsAt: string | null;
  endsAt: string | null;
};

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function normalizeNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getPromotionBonus(promotion: PublicTopupPromotion | null, amount: number) {
  if (!promotion || amount < promotion.minAmount) return 0;

  const bonusValue = Math.max(0, normalizeNumber(promotion.bonusValue));
  if (bonusValue <= 0) return 0;

  if (promotion.bonusType === "FIXED") return Math.round(bonusValue);
  return Math.round((amount * bonusValue) / 100);
}

function getPromotionText(promotion: PublicTopupPromotion | null) {
  if (!promotion) return "";

  if (promotion.bonusType === "FIXED") {
    return `${formatMoney(promotion.bonusValue)} de aumento`;
  }

  return `${Number(promotion.bonusValue).toLocaleString("es-CO")}% de aumento`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function AutomaticTopupsPage() {
  const router = useRouter();
  const [amountInput, setAmountInput] = useState("10000");
  const [payerOrigin, setPayerOrigin] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [copied, setCopied] = useState(false);
  const [promoLoading, setPromoLoading] = useState(true);
  const [activePromotions, setActivePromotions] = useState<PublicTopupPromotion[]>([]);

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
    let mounted = true;

    const loadActivePromotion = async () => {
      try {
        setPromoLoading(true);
        const response = await fetch("/api/wallet/topups/active-promotion", {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || "No se pudo consultar la promoción activa.");
        }

        if (!mounted) return;
        setActivePromotions(Array.isArray(result.promotions) ? result.promotions : []);
      } catch {
        if (!mounted) return;
        setActivePromotions([]);
      } finally {
        if (mounted) setPromoLoading(false);
      }
    };

    void loadActivePromotion();
    const interval = window.setInterval(loadActivePromotion, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const parsedAmount = useMemo(
    () => Math.max(0, Math.round(Number(amountInput || 0))),
    [amountInput]
  );

  const featuredPromotion = useMemo(() => {
    return (
      activePromotions
        .slice()
        .sort((a, b) => a.minAmount - b.minAmount || b.bonusValue - a.bonusValue)[0] || null
    );
  }, [activePromotions]);

  const eligiblePromotion = useMemo(() => {
    return (
      activePromotions
        .filter((promotion) => parsedAmount >= promotion.minAmount)
        .sort((a, b) => b.minAmount - a.minAmount || b.bonusValue - a.bonusValue)[0] || null
    );
  }, [activePromotions, parsedAmount]);

  const promotionBonus = useMemo(
    () => getPromotionBonus(eligiblePromotion, parsedAmount),
    [eligiblePromotion, parsedAmount]
  );

  const minPromotionBonus = useMemo(
    () => getPromotionBonus(featuredPromotion, featuredPromotion?.minAmount || 0),
    [featuredPromotion]
  );

  const promotedTotal = parsedAmount + promotionBonus;
  const missingForPromotion = featuredPromotion ? Math.max(0, featuredPromotion.minAmount - parsedAmount) : 0;
  const hasPromotion = Boolean(featuredPromotion);
  const promotionText = getPromotionText(featuredPromotion);
  const promotionEndsAt = formatDateTime(featuredPromotion?.endsAt);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(BREB_KEY);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (parsedAmount < 100) {
      setBanner({ kind: "error", text: "El monto mínimo es $ 100 COP." });
      return;
    }

    if (!payerOrigin.trim()) {
      setBanner({ kind: "error", text: "Ingresa el nombre de quien realizó la transferencia." });
      return;
    }

    try {
      setTopupLoading(true);
      setBanner(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || !session.user?.id) {
        setBanner({ kind: "info", text: "Inicia sesión para reportar tu recarga." });
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
          payerOrigin: payerOrigin.trim(),
          destinationAccount: BREB_DESTINATION,
          receiptUrl: "",
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "No se pudo reportar la recarga.");

      router.push(`/account/wallet/topup-result?reference=${encodeURIComponent(result.reference)}`);
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "Error al procesar la recarga.",
      });
      setTopupLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-6 text-white md:px-6">
      <section className="mx-auto max-w-3xl space-y-4">
        {/* Header */}
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="relative p-5 md:p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

            <div className="relative flex items-center justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-blue-200">
                  Recarga automática
                </div>
                <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
                  Recarga por Bre-B / Llaves
                </h1>
                <p className="mt-1 text-sm leading-6 text-white/60">
                  Transfiere a la llave, luego indica el monto y tu nombre. El saldo se acredita automáticamente.
                </p>
              </div>
              <Link
                href="/account/wallet"
                className="hidden shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 sm:inline-flex"
              >
                Mi billetera
              </Link>
            </div>

            {/* Llave destacada con copiar */}
            <div className="relative mt-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-blue-300/70">
                  1. Transfiere a esta llave
                </p>
                <p className="text-lg font-bold text-blue-200">{BREB_KEY}</p>
              </div>
              <button
                type="button"
                onClick={copyKey}
                className="rounded-xl bg-blue-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-blue-500/20 transition hover:bg-blue-300"
              >
                {copied ? "✓ Copiada" : "Copiar"}
              </button>
            </div>
          </div>
        </header>

        {/* Sección de promociones */}
        <section
          className={`overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl ${hasPromotion
            ? "border-emerald-300/30 bg-slate-950/85 shadow-emerald-950/10"
            : "border-white/10 bg-slate-950/80 shadow-black/20"
            }`}
        >
          <div className="relative p-4 md:p-4">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-blue-400/10 blur-3xl" />

            {promoLoading ? (
              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200/80">
                  Sección de promociones
                </p>
                <p className="mt-2 text-xs font-semibold text-white/55">
                  Consultando promociones activas...
                </p>
              </div>
            ) : hasPromotion ? (
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200/80">
                    Sección de promociones
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-lg shadow-emerald-300/40" />
                    Promo activa
                  </div>
                  <h2 className="mt-2 text-xl font-black leading-tight tracking-tight text-white md:text-2xl">
                    {promotionText} por recargas desde {formatMoney(featuredPromotion?.minAmount)}
                  </h2>
                  <p className="mt-2 text-xs font-semibold text-white/60">
                    El aumento se aplica automáticamente al aprobar tu recarga.
                  </p>

                  {promotionEndsAt && (
  <p className="mt-2 text-[14.3px] font-bold text-emerald-200">
    Disponible hasta: {promotionEndsAt}
  </p>
)}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 md:min-w-48">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                    Ejemplo
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-4 text-white/65">
                      <span>Recargas</span>
                      <span className="font-black text-white">{formatMoney(featuredPromotion?.minAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-white/65">
                      <span>Aumento</span>
                      <span className="font-black text-emerald-300">+{formatMoney(minPromotionBonus)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white/70">Recibes</span>
                        <span className="text-base font-black text-white">
                          {formatMoney((featuredPromotion?.minAmount || 0) + minPromotionBonus)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAmountInput(String(featuredPromotion?.minAmount || 30000))}
                    className="mt-3 w-full rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300"
                  >
                    Aprovechar
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">
                  Sección de promociones
                </p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
                  Sin promoción activa
                </div>
                <h2 className="mt-2 text-lg font-black leading-tight tracking-tight text-white md:text-xl">
                  En este momento no hay promociones disponibles.
                </h2>
                <p className="mt-1.5 text-xs leading-5 text-white/55">
                  Cuando actives una promoción, aparecerá aquí automáticamente.
                </p>
              </div>
            )}
          </div>
        </section>

        {banner && (
          <div
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${banner.kind === "success"
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : banner.kind === "info"
                ? "border-blue-400/20 bg-blue-400/10 text-blue-300"
                : "border-red-400/20 bg-red-400/10 text-red-300"
              }`}
          >
            {banner.text}
          </div>
        )}

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-white/100">
            2. Confirma los datos de tu transferencia
          </p>

          {/* Monto */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white/75">
              ¿Cuánto transferiste?
            </label>
            <input
              type="number"
              min="100"
              step="100"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-lg font-black text-white outline-none transition focus:border-blue-400/40 focus:bg-white/10"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_AMOUNTS.map((amount) => {
                const presetPromotion =
                  activePromotions
                    .filter((promotion) => amount >= promotion.minAmount)
                    .sort((a, b) => b.minAmount - a.minAmount || b.bonusValue - a.bonusValue)[0] || null;
                const presetBonus = getPromotionBonus(presetPromotion, amount);

                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setAmountInput(String(amount))}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${parsedAmount === amount
                      ? "border-blue-400/30 bg-blue-500/15 text-blue-300"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                  >
                    {formatMoney(amount)}
                    {presetBonus > 0 && (
                      <span className="ml-1 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-200">
                        +{formatMoney(presetBonus)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {hasPromotion && (
              <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm">
                {promotionBonus > 0 ? (
                  <p className="font-semibold text-emerald-200">
                    Tu recarga aplica para la promoción: recibirías {formatMoney(parsedAmount)} + {formatMoney(promotionBonus)} de aumento = {formatMoney(promotedTotal)}.
                  </p>
                ) : (
                  <p className="font-semibold text-white/65">
                    Te faltan {formatMoney(missingForPromotion)} para aprovechar la promo activa.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white/75">
              ¿A nombre de quién está registrada la cuenta que transfirió?
            </label>
            <input
              value={payerOrigin}
              onChange={(event) => setPayerOrigin(event.target.value)}
              placeholder="Aquí va el nombre de quien hizo la transferencia"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-blue-400/40 focus:bg-white/10"
            />
            <p className="mt-1 text-xs text-white/50">
              No necesitas escribir el nombre completo, basta con un nombre y un apellido.
            </p>
          </div>

          <button
            type="submit"
            disabled={checkingSession || topupLoading || parsedAmount < 100}
            className="w-full rounded-2xl bg-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkingSession
              ? "Validando sesión..."
              : topupLoading
                ? "Verificando transferencia..."
                : isLoggedIn
                  ? promotionBonus > 0
                    ? `Acreditar ${formatMoney(parsedAmount)} y recibir hasta ${formatMoney(promotedTotal)}`
                    : `Acreditar ${formatMoney(parsedAmount)} a mi billetera`
                  : "Inicia sesión para recargar"}
          </button>
        </form>
      </section>
    </main>
  );
}
