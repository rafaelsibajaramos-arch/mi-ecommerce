"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const PRESET_AMOUNTS = [1000, 5000, 10000, 20000, 50000];
const BREB_KEY = "3117664491";
const BREB_DESTINATION = `Bre-B / Llaves - ${BREB_KEY}`;

type BannerState = { kind: "success" | "error" | "info"; text: string } | null;

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
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

  const parsedAmount = useMemo(
    () => Math.max(0, Math.round(Number(amountInput || 0))),
    [amountInput]
  );

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
        <header className="rounded-2xl border border-white/10 bg-slate-800/80 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
                Recarga por Bre-B / Llaves
              </h1>
              <p className="mt-1 text-sm text-white/60">
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
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-blue-300/70">
                1. Transfiere a esta llave
              </p>
              <p className="text-lg font-bold text-blue-200">{BREB_KEY}</p>
            </div>
            <button
              type="button"
              onClick={copyKey}
              className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/30"
            >
              {copied ? "✓ Copiada" : "Copiar"}
            </button>
          </div>
        </header>

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
          className="space-y-5 rounded-2xl border border-white/10 bg-slate-800/80 p-5 shadow-lg backdrop-blur-md"
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
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-lg font-semibold text-white outline-none transition focus:border-blue-400/40 focus:bg-white/10"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountInput(String(amount))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${parsedAmount === amount
                    ? "border-blue-400/30 bg-blue-500/15 text-blue-300"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                >
                  {formatMoney(amount)}
                </button>
              ))}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white/75">
              ¿A nombre de quién está registrada la cuenta que transfirió?
            </label>
            <input
              value={payerOrigin}
              onChange={(event) => setPayerOrigin(event.target.value)}
              placeholder="Ej: Rafael Sibaja"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-blue-400/40 focus:bg-white/10"
            />
            <p className="mt-1 text-xs text-white/50">
              No necesitas escribir el nombre completo, basta con un nombre y un apellido.
            </p>
          </div>

          <button
            type="submit"
            disabled={checkingSession || topupLoading || parsedAmount < 100}
            className="w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkingSession
              ? "Validando sesión..."
              : topupLoading
                ? "Verificando transferencia..."
                : isLoggedIn
                  ? `Acreditar ${formatMoney(parsedAmount)} a mi billetera`
                  : "Inicia sesión para recargar"}
          </button>
        </form>
      </section>
    </main>
  );
}