"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
};

type ProfileBalanceRow = {
  balance: number | null;
};

type FilterType = "all" | "credit" | "debit";

const PAGE_SIZE = 10;

function buildPagination(current: number, total: number): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, "...", total];
  }

  if (current >= total - 3) {
    return [1, "...", total - 3, total - 2, total - 1, total];
  }

  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function WalletPage() {
  const router = useRouter();
  const historySectionRef = useRef<HTMLDivElement | null>(null);

  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const loadWallet = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();

      const { data: txData } = await supabase
        .from("wallet_transactions")
        .select("id, type, amount, note, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (profileData) {
        const profile = profileData as ProfileBalanceRow;
        setBalance(Number(profile.balance || 0));
      }

      if (txData) {
        setTransactions(txData as WalletTransaction[]);
      }

      setLoading(false);
    };

    void loadWallet();
  }, [router]);

  const getTransactionKind = (tx: WalletTransaction): "credit" | "debit" => {
    const txType = (tx.type || "").toLowerCase().trim();

    if (
      txType === "debit" ||
      txType === "purchase" ||
      txType === "order" ||
      txType.includes("debito") ||
      txType.includes("débito") ||
      txType.includes("compra")
    ) {
      return "debit";
    }

    if (
      txType === "credit" ||
      txType === "deposit" ||
      txType.includes("credito") ||
      txType.includes("crédito") ||
      txType.includes("deposito") ||
      txType.includes("depósito") ||
      txType.includes("recarga")
    ) {
      return "credit";
    }

    return "debit";
  };

  const filteredTransactions = useMemo(() => {
    if (filter === "all") return transactions;

    return transactions.filter((tx) => {
      const kind = getTransactionKind(tx);
      return filter === kind;
    });
  }, [transactions, filter]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  }, [filteredTransactions.length]);

  const effectiveCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTransactions = useMemo(() => {
    const start = (effectiveCurrentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredTransactions.slice(start, end);
  }, [effectiveCurrentPage, filteredTransactions]);

  const paginationItems = useMemo(() => {
    return buildPagination(effectiveCurrentPage, totalPages);
  }, [effectiveCurrentPage, totalPages]);

  const pageStart =
    filteredTransactions.length === 0
      ? 0
      : (effectiveCurrentPage - 1) * PAGE_SIZE + 1;

  const pageEnd = Math.min(
    effectiveCurrentPage * PAGE_SIZE,
    filteredTransactions.length
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    historySectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const latestTransaction = transactions.length > 0 ? transactions[0] : null;

  const totalCredits = useMemo(() => {
    return transactions.reduce((sum, tx) => {
      return getTransactionKind(tx) === "credit"
        ? sum + Number(tx.amount || 0)
        : sum;
    }, 0);
  }, [transactions]);

  const formatMoney = (value: number) => {
    return Number(value || 0).toLocaleString("es-CO");
  };

  const formatSignedMoney = (tx: WalletTransaction) => {
    const amount = Number(tx.amount || 0);
    const kind = getTransactionKind(tx);

    return `${kind === "credit" ? "+" : "-"}$ ${formatMoney(amount)}`;
  };

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleString("es-CO", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Sin fecha";
    }
  };

  const getTransactionTitle = (tx: WalletTransaction) => {
    const txType = (tx.type || "").toLowerCase().trim();
    const txNote = (tx.note || "").toLowerCase().trim();

    if (
      txNote.includes("compra") ||
      txNote.includes("pedido") ||
      txType === "purchase" ||
      txType === "order"
    ) {
      return "Compra";
    }

    if (
      txType === "debit" ||
      txType.includes("debito") ||
      txType.includes("débito")
    ) {
      return "Débito";
    }

    return "Recarga";
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-white/70">Cargando wallet...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-white">
      <section className="max-w-7xl mx-auto px-6 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/45">
            Wallet
          </p>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">
            Mi billetera
          </h1>
          <p className="mt-3 text-white/65">
            Consulta tu saldo disponible y revisa el historial de tus transacciones.
          </p>
          <p className="mt-2 text-sm text-white/40">
            Mostrando {filteredTransactions.length} transacción(es)
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-[0_0_30px_rgba(14,165,233,0.25)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7h18" />
                  <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                  <path d="M16 13h.01" />
                </svg>
              </div>

              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                Disponible
              </div>
            </div>

            <div className="mt-6">
              <p className="text-4xl font-black text-white">
                $ {formatMoney(balance)}
              </p>
              <p className="mt-2 text-base text-white/60">Saldo actual</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
              Total acreditado
            </p>
            <p className="mt-4 text-4xl font-black text-emerald-300">
              $ {formatMoney(totalCredits)}
            </p>
            <p className="mt-3 text-sm text-white/60">
              Suma acumulada de todas tus recargas y abonos registrados en la billetera.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
              Último movimiento
            </p>
            {latestTransaction ? (
              <>
                <p className="mt-4 text-2xl font-black text-white">
                  {getTransactionTitle(latestTransaction)}
                </p>
                <p className="mt-2 text-lg font-bold text-sky-300">
                  {formatSignedMoney(latestTransaction)}
                </p>
                <p className="mt-3 text-sm text-white/60">
                  {latestTransaction.note || "Movimiento registrado"}
                </p>
                <p className="mt-2 text-sm text-white/40">
                  {formatDate(latestTransaction.created_at)}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-white/60">
                Aún no hay movimientos registrados.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-800/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
            Filtrar movimientos
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={
                filter === "all"
                  ? "rounded-2xl border border-blue-400/30 bg-blue-500/15 px-5 py-3 text-sm font-semibold text-blue-300 shadow-[0_0_14px_rgba(59,130,246,0.18)]"
                  : "rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              }
            >
              Todas
            </button>

            <button
              type="button"
              onClick={() => setFilter("credit")}
              className={
                filter === "credit"
                  ? "rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.18)]"
                  : "rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              }
            >
              Créditos
            </button>

            <button
              type="button"
              onClick={() => setFilter("debit")}
              className={
                filter === "debit"
                  ? "rounded-2xl border border-red-400/30 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.18)]"
                  : "rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              }
            >
              Débitos
            </button>
          </div>
        </div>

        <div
          ref={historySectionRef}
          className="mt-8 rounded-[28px] border border-white/10 bg-slate-800/80 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md"
        >
          <div className="border-b border-white/10 px-6 py-5">
            <h3 className="text-2xl font-extrabold">
              Historial de transacciones
            </h3>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="px-6 py-10 text-white/60">
              Aún no hay movimientos registrados para este filtro.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {paginatedTransactions.map((tx) => {
                const kind = getTransactionKind(tx);

                return (
                  <div
                    key={tx.id}
                    className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                          kind === "credit"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {kind === "credit" ? (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M7 17 17 7" />
                            <path d="M8 7h9v9" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M7 7 17 17" />
                            <path d="M17 8v9H8" />
                          </svg>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-lg font-bold text-white">
                            {getTransactionTitle(tx)}
                          </p>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              kind === "credit"
                                ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                                : "border border-red-400/20 bg-red-400/10 text-red-300"
                            }`}
                          >
                            {kind === "credit" ? "Crédito" : "Débito"}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-white/55">
                          {tx.note || "Registrado"}
                        </p>

                        <p className="mt-1 text-sm text-white/35">
                          {formatDate(tx.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="text-left md:text-right">
                      <p
                        className={`text-3xl font-black ${
                          kind === "credit"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {formatSignedMoney(tx)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {filteredTransactions.length > 0 && (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-white/60">
              Mostrando <span className="font-semibold text-white">{pageStart}</span>{" "}
              - <span className="font-semibold text-white">{pageEnd}</span> de{" "}
              <span className="font-semibold text-white">
                {filteredTransactions.length}
              </span>{" "}
              transacciones
            </p>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(Math.max(effectiveCurrentPage - 1, 1))
                  }
                  disabled={effectiveCurrentPage === 1}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ‹
                </button>

                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`wallet-ellipsis-${index}`}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-white/35"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handlePageChange(item)}
                      className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${
                        effectiveCurrentPage === item
                          ? "border-blue-400/40 bg-blue-500/15 text-blue-300"
                          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(
                      Math.min(effectiveCurrentPage + 1, totalPages)
                    )
                  }
                  disabled={effectiveCurrentPage === totalPages}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}