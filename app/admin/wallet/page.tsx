"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "../../../lib/supabase";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  balance: number | null;
};

type TransactionRow = {
  id: string;
  user_id: string | null;
  type: string | null;
  amount: number | null;
  created_at: string | null;
  note?: string | null;
  description?: string | null;
};

type FormattedTransaction = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  type: string;
  amount: number;
  created_at: string;
  note?: string | null;
  description?: string | null;
};

type BannerState = {
  kind: "success" | "error";
  text: string;
} | null;

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

function formatMoney(value: number) {
  return `$ ${Number(Math.abs(value || 0)).toLocaleString("es-CO")}`;
}

function formatSignedMoney(type: string, value: number) {
  const normalized = normalizeType(type);
  const prefix = normalized === "credit" ? "+" : "-";
  return `${prefix}${formatMoney(value)}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Sin fecha";
  }
}

function normalizeType(type: string | null) {
  const normalized = (type || "").toLowerCase().trim();

  if (
    normalized === "credit" ||
    normalized === "deposit" ||
    normalized.includes("credito") ||
    normalized.includes("crédito") ||
    normalized.includes("recarga")
  ) {
    return "credit";
  }

  if (
    normalized === "debit" ||
    normalized === "purchase" ||
    normalized === "order" ||
    normalized.includes("debito") ||
    normalized.includes("débito") ||
    normalized.includes("compra")
  ) {
    return "debit";
  }

  return normalized || "movement";
}

function isRechargeType(type: string | null) {
  return normalizeType(type) === "credit";
}

function getTransactionLabel(type: string) {
  const normalized = normalizeType(type);

  if (normalized === "credit") return "Crédito";
  if (normalized === "debit") return "Débito";

  return "Movimiento";
}

function getTransactionClasses(type: string) {
  const normalized = normalizeType(type);

  if (normalized === "credit") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized === "debit") {
    return "border border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700";
}

export default function AdminWalletPage() {
  const rechargeSectionRef = useRef<HTMLDivElement | null>(null);
  const transactionSectionRef = useRef<HTMLDivElement | null>(null);

  const [movementType, setMovementType] = useState<"credit" | "debit">(
    "credit"
  );
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [banner, setBanner] = useState<BannerState>(null);

  const [allTransactions, setAllTransactions] = useState<
    FormattedTransaction[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const [searchEmail, setSearchEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [transactionSearchEmail, setTransactionSearchEmail] = useState("");
  const [transactionStartDate, setTransactionStartDate] = useState("");
  const [transactionEndDate, setTransactionEndDate] = useState("");

  const [rechargePage, setRechargePage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    if (!banner) return;

    const timer = setTimeout(() => {
      setBanner(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    setRechargePage(1);
  }, [searchEmail, startDate, endDate]);

  useEffect(() => {
    setTransactionPage(1);
  }, [transactionSearchEmail, transactionStartDate, transactionEndDate]);

  function handleRechargePageChange(page: number) {
    setRechargePage(page);
    rechargeSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleTransactionPageChange(page: number) {
    setTransactionPage(page);
    transactionSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function loadTransactions() {
    setLoadingHistory(true);

    const { data: transactionsData, error: transactionsError } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, type, amount, created_at, note, description")
      .order("created_at", { ascending: false });

    if (transactionsError) {
      setAllTransactions([]);
      setLoadingHistory(false);
      return;
    }

    const rawTransactions = (transactionsData as TransactionRow[]) || [];

    const userIds = Array.from(
      new Set(rawTransactions.map((item) => item.user_id).filter(Boolean))
    ) as string[];

    let profilesData: ProfileRow[] = [];
    if (userIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, balance")
        .in("id", userIds);

      profilesData = (data as ProfileRow[]) || [];
    }

    const profileMap = new Map<string, ProfileRow>();
    profilesData.forEach((profile) => {
      profileMap.set(profile.id, profile);
    });

    const formatted = rawTransactions.map((transaction) => {
      const profile = transaction.user_id
        ? profileMap.get(transaction.user_id)
        : null;

      return {
        id: transaction.id,
        user_id: transaction.user_id,
        email: profile?.email || "Sin correo",
        full_name: profile?.full_name || null,
        type: transaction.type || "movement",
        amount: Number(transaction.amount || 0),
        created_at: transaction.created_at || "",
        note: transaction.note || null,
        description: transaction.description || null,
      };
    });

    setAllTransactions(formatted);
    setRechargePage(1);
    setTransactionPage(1);
    setLoadingHistory(false);
  }

  const rechargeTransactions = useMemo(() => {
    return allTransactions.filter((tx) => isRechargeType(tx.type));
  }, [allTransactions]);

  const filteredRechargeTransactions = useMemo(() => {
    return rechargeTransactions.filter((transaction) => {
      const txDate = transaction.created_at
        ? transaction.created_at.slice(0, 10)
        : "";

      const emailMatch =
        !searchEmail.trim() ||
        transaction.email
          .toLowerCase()
          .includes(searchEmail.trim().toLowerCase());

      const startMatch = !startDate || (txDate && txDate >= startDate);
      const endMatch = !endDate || (txDate && txDate <= endDate);

      return emailMatch && startMatch && endMatch;
    });
  }, [rechargeTransactions, searchEmail, startDate, endDate]);

  const hasTransactionSearch = transactionSearchEmail.trim().length > 0;

  const filteredClientTransactions = useMemo(() => {
    if (!hasTransactionSearch) return [];

    return allTransactions.filter((transaction) => {
      const txDate = transaction.created_at
        ? transaction.created_at.slice(0, 10)
        : "";
      const normalizedType = normalizeType(transaction.type);

      const emailMatch = transaction.email
        .toLowerCase()
        .includes(transactionSearchEmail.trim().toLowerCase());

      const startMatch =
        !transactionStartDate || (txDate && txDate >= transactionStartDate);

      const endMatch =
        !transactionEndDate || (txDate && txDate <= transactionEndDate);

      const validType =
        normalizedType === "credit" || normalizedType === "debit";

      return validType && emailMatch && startMatch && endMatch;
    });
  }, [
    allTransactions,
    hasTransactionSearch,
    transactionSearchEmail,
    transactionStartDate,
    transactionEndDate,
  ]);

  const rechargeTotalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(filteredRechargeTransactions.length / PAGE_SIZE)
    );
  }, [filteredRechargeTransactions.length]);

  const transactionTotalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(filteredClientTransactions.length / PAGE_SIZE)
    );
  }, [filteredClientTransactions.length]);

  useEffect(() => {
    if (rechargePage > rechargeTotalPages) {
      setRechargePage(rechargeTotalPages);
    }
  }, [rechargePage, rechargeTotalPages]);

  useEffect(() => {
    if (transactionPage > transactionTotalPages) {
      setTransactionPage(transactionTotalPages);
    }
  }, [transactionPage, transactionTotalPages]);

  const paginatedRechargeTransactions = useMemo(() => {
    const start = (rechargePage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredRechargeTransactions.slice(start, end);
  }, [filteredRechargeTransactions, rechargePage]);

  const paginatedClientTransactions = useMemo(() => {
    const start = (transactionPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredClientTransactions.slice(start, end);
  }, [filteredClientTransactions, transactionPage]);

  const rechargePaginationItems = useMemo(() => {
    return buildPagination(rechargePage, rechargeTotalPages);
  }, [rechargePage, rechargeTotalPages]);

  const transactionPaginationItems = useMemo(() => {
    return buildPagination(transactionPage, transactionTotalPages);
  }, [transactionPage, transactionTotalPages]);

  const rechargePageStart =
    filteredRechargeTransactions.length === 0
      ? 0
      : (rechargePage - 1) * PAGE_SIZE + 1;

  const rechargePageEnd = Math.min(
    rechargePage * PAGE_SIZE,
    filteredRechargeTransactions.length
  );

  const transactionPageStart =
    filteredClientTransactions.length === 0
      ? 0
      : (transactionPage - 1) * PAGE_SIZE + 1;

  const transactionPageEnd = Math.min(
    transactionPage * PAGE_SIZE,
    filteredClientTransactions.length
  );

  async function handleMovement(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);

    const cleanEmail = email.trim().toLowerCase();
    const numericAmount = Number(amount);

    if (!cleanEmail || !numericAmount || numericAmount <= 0) {
      setBanner({
        kind: "error",
        text: "Completa un correo válido y un monto mayor a cero.",
      });
      setSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, balance")
      .ilike("email", cleanEmail)
      .single();

    if (profileError || !profile) {
      setBanner({
        kind: "error",
        text: "Usuario no encontrado.",
      });
      setSubmitting(false);
      return;
    }

    const currentBalance = Number(profile.balance || 0);

    if (movementType === "debit" && currentBalance < numericAmount) {
      setBanner({
        kind: "error",
        text: `No se puede debitar ${formatMoney(
          numericAmount
        )} porque el cliente solo tiene ${formatMoney(currentBalance)}.`,
      });
      setSubmitting(false);
      return;
    }

    const newBalance =
      movementType === "credit"
        ? currentBalance + numericAmount
        : currentBalance - numericAmount;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ balance: newBalance })
      .eq("id", profile.id);

    if (updateError) {
      setBanner({
        kind: "error",
        text: "No se pudo actualizar el saldo.",
      });
      setSubmitting(false);
      return;
    }

    const movementLabel =
      movementType === "credit"
        ? "Recarga manual desde admin"
        : "Débito manual desde admin";

    const { error: txError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: profile.id,
        type: movementType,
        amount: numericAmount,
        note: movementLabel,
        description: movementLabel,
      });

    if (txError) {
      await supabase
        .from("profiles")
        .update({ balance: currentBalance })
        .eq("id", profile.id);

      setBanner({
        kind: "error",
        text: "No se pudo registrar el movimiento. Se restauró el saldo anterior.",
      });
      setSubmitting(false);
      return;
    }

    setBanner({
      kind: "success",
      text:
        movementType === "credit"
          ? `Se acreditó ${formatMoney(numericAmount)} al correo ${profile.email}.`
          : `Se descontó ${formatMoney(numericAmount)} al correo ${profile.email}.`,
    });

    setEmail("");
    setAmount("");

    await loadTransactions();
    setSubmitting(false);
  }

  async function handleReverseRecharge(transaction: FormattedTransaction) {
    if (!transaction.user_id) {
      setBanner({
        kind: "error",
        text: "No se pudo identificar el usuario de esta recarga.",
      });
      return;
    }

    setRevertingId(transaction.id);
    setBanner(null);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, balance")
      .eq("id", transaction.user_id)
      .single();

    if (profileError || !profile) {
      setBanner({
        kind: "error",
        text: "No se encontró el perfil del cliente.",
      });
      setRevertingId(null);
      return;
    }

    const currentBalance = Number(profile.balance || 0);
    const rechargeAmount = Math.abs(Number(transaction.amount || 0));

    if (currentBalance < rechargeAmount) {
      setBanner({
        kind: "error",
        text: `No se puede revertir esta recarga porque el cliente solo tiene ${formatMoney(
          currentBalance
        )}.`,
      });
      setRevertingId(null);
      return;
    }

    const newBalance = currentBalance - rechargeAmount;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ balance: newBalance })
      .eq("id", transaction.user_id);

    if (updateError) {
      setBanner({
        kind: "error",
        text: "No se pudo descontar el saldo del cliente.",
      });
      setRevertingId(null);
      return;
    }

    const reverseLabel = "Reversa manual de recarga";

    const { data: debitInserted, error: insertDebitError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: transaction.user_id,
        type: "debit",
        amount: rechargeAmount,
        note: reverseLabel,
        description: `${reverseLabel} (${transaction.id})`,
      })
      .select("id")
      .single();

    if (insertDebitError) {
      await supabase
        .from("profiles")
        .update({ balance: currentBalance })
        .eq("id", transaction.user_id);

      setBanner({
        kind: "error",
        text: "No se pudo registrar el débito de reversa. Se restauró el saldo anterior.",
      });
      setRevertingId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("wallet_transactions")
      .delete()
      .eq("id", transaction.id);

    if (deleteError) {
      await supabase
        .from("profiles")
        .update({ balance: currentBalance })
        .eq("id", transaction.user_id);

      if (debitInserted?.id) {
        await supabase
          .from("wallet_transactions")
          .delete()
          .eq("id", debitInserted.id);
      }

      setBanner({
        kind: "error",
        text: "No se pudo eliminar la recarga del historial. Se restauró el saldo anterior.",
      });
      setRevertingId(null);
      return;
    }

    setBanner({
      kind: "success",
      text: `Se descontó ${formatMoney(rechargeAmount)} al correo ${transaction.email}.`,
    });

    await loadTransactions();
    setRevertingId(null);
  }

  return (
    <section className="space-y-6 pb-6 text-slate-900">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Admin Wallet
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Gestión manual de saldo
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Acredita o descuenta saldo, revisa recargas y consulta transacciones
          por correo.
        </p>
      </div>

      {banner && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-2xl font-extrabold text-slate-900">
          Movimiento manual
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Selecciona si vas a hacer un crédito o un débito al monedero del
          cliente.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleMovement}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Tipo de movimiento
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMovementType("credit")}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  movementType === "credit"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                }`}
              >
                Crédito
              </button>

              <button
                type="button"
                onClick={() => setMovementType("debit")}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  movementType === "debit"
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                }`}
              >
                Débito
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Correo del cliente
              </label>
              <input
                type="email"
                placeholder="cliente@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Monto
              </label>
              <input
                type="number"
                placeholder="50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[#050816] px-5 py-3.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60 sm:w-auto"
            >
              {submitting
                ? "Procesando..."
                : movementType === "credit"
                ? "Cargar saldo"
                : "Debitar saldo"}
            </button>
          </div>
        </form>
      </div>

      <div
        ref={rechargeSectionRef}
        className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-2xl font-extrabold text-slate-900">
              Historial de recargas
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Aquí solo se muestran recargas registradas manualmente.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTransactions}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Recargar historial
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Buscar por correo
            </label>
            <input
              type="text"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Hasta
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          {loadingHistory ? (
            <div className="px-5 py-8 text-sm text-slate-500">
              Cargando recargas...
            </div>
          ) : filteredRechargeTransactions.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">
              No se encontraron recargas con ese filtro.
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[1.2fr_0.8fr_1fr_0.9fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-500 lg:grid">
                <span>Usuario</span>
                <span>Monto</span>
                <span>Fecha</span>
                <span className="text-right">Acción</span>
              </div>

              <div className="divide-y divide-slate-200">
                {paginatedRechargeTransactions.map((transaction) => (
                  <div key={transaction.id} className="px-5 py-5 md:px-6">
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_1fr_0.9fr] lg:items-center">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Usuario
                        </p>
                        <p className="break-all text-sm font-semibold text-slate-900">
                          {transaction.email}
                        </p>
                        {transaction.full_name && (
                          <p className="mt-1 text-xs text-slate-500">
                            {transaction.full_name}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Monto
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                          {formatMoney(transaction.amount)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Fecha
                        </p>
                        <p className="text-sm text-slate-700">
                          {formatDate(transaction.created_at)}
                        </p>
                      </div>

                      <div className="flex justify-start lg:justify-end">
                        <button
                          type="button"
                          onClick={() => handleReverseRecharge(transaction)}
                          disabled={revertingId === transaction.id}
                          className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          {revertingId === transaction.id
                            ? "Debitando..."
                            : "Debitar"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!loadingHistory && filteredRechargeTransactions.length > 0 && (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{rechargePageStart}</span>{" "}
              - <span className="font-semibold">{rechargePageEnd}</span> de{" "}
              <span className="font-semibold">
                {filteredRechargeTransactions.length}
              </span>{" "}
              recargas
            </p>

            {rechargeTotalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleRechargePageChange(Math.max(rechargePage - 1, 1))
                  }
                  disabled={rechargePage === 1}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ‹
                </button>

                {rechargePaginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`recharge-ellipsis-${index}`}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleRechargePageChange(item)}
                      className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${
                        rechargePage === item
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    handleRechargePageChange(
                      Math.min(rechargePage + 1, rechargeTotalPages)
                    )
                  }
                  disabled={rechargePage === rechargeTotalPages}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={transactionSectionRef}
        className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-2xl font-extrabold text-slate-900">
              Historial de transacciones
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Aquí verás créditos y débitos en orden. Solo se muestra cuando
              buscas por correo.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTransactions}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Actualizar transacciones
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Buscar por correo
            </label>
            <input
              type="text"
              value={transactionSearchEmail}
              onChange={(e) => setTransactionSearchEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Desde
            </label>
            <input
              type="date"
              value={transactionStartDate}
              onChange={(e) => setTransactionStartDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Hasta
            </label>
            <input
              type="date"
              value={transactionEndDate}
              onChange={(e) => setTransactionEndDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          {loadingHistory ? (
            <div className="px-5 py-8 text-sm text-slate-500">
              Cargando transacciones...
            </div>
          ) : !hasTransactionSearch ? (
            <div className="px-5 py-8 text-sm text-slate-500">
              Escribe el correo del cliente para ver su historial de
              transacciones.
            </div>
          ) : filteredClientTransactions.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">
              No se encontraron transacciones para ese correo con ese rango de
              fechas.
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[1.2fr_0.8fr_0.8fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-500 lg:grid">
                <span>Usuario</span>
                <span>Tipo</span>
                <span>Monto</span>
                <span>Fecha</span>
              </div>

              <div className="divide-y divide-slate-200">
                {paginatedClientTransactions.map((transaction) => (
                  <div key={transaction.id} className="px-5 py-5 md:px-6">
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr] lg:items-center">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Usuario
                        </p>
                        <p className="break-all text-sm font-semibold text-slate-900">
                          {transaction.email}
                        </p>
                        {transaction.full_name && (
                          <p className="mt-1 text-xs text-slate-500">
                            {transaction.full_name}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Tipo
                        </p>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTransactionClasses(
                            transaction.type
                          )}`}
                        >
                          {getTransactionLabel(transaction.type)}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Monto
                        </p>
                        <p
                          className={`text-sm font-bold ${
                            normalizeType(transaction.type) === "credit"
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {formatSignedMoney(transaction.type, transaction.amount)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Fecha
                        </p>
                        <p className="text-sm text-slate-700">
                          {formatDate(transaction.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!loadingHistory && hasTransactionSearch && filteredClientTransactions.length > 0 && (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-slate-600">
              Mostrando{" "}
              <span className="font-semibold">{transactionPageStart}</span> -{" "}
              <span className="font-semibold">{transactionPageEnd}</span> de{" "}
              <span className="font-semibold">
                {filteredClientTransactions.length}
              </span>{" "}
              transacciones
            </p>

            {transactionTotalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleTransactionPageChange(Math.max(transactionPage - 1, 1))
                  }
                  disabled={transactionPage === 1}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ‹
                </button>

                {transactionPaginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`transaction-ellipsis-${index}`}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleTransactionPageChange(item)}
                      className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${
                        transactionPage === item
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    handleTransactionPageChange(
                      Math.min(transactionPage + 1, transactionTotalPages)
                    )
                  }
                  disabled={transactionPage === transactionTotalPages}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}