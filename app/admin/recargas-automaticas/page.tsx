"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type TopupRow = {
  id: string;
  user_id: string | null;
  reference: string | null;
  amount: number | null;
  provider: string | null;
  status: string | null;
  payer_origin: string | null;
  destination_account: string | null;
  receipt_url: string | null;
  matched_bank_payment_id: string | null;
  matched_bank_reference: string | null;
  admin_note: string | null;
  error_message: string | null;
  created_at: string | null;
  approved_at: string | null;
  credited_at: string | null;
  executed_at: string | null;
  delay_seconds: number | null;
  rejected_at: string | null;
  expired_at: string | null;
  expiration_reason: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

type FormattedTopup = TopupRow & {
  email: string;
  full_name: string | null;
};

type AlertRow = {
  id: string;
  topup_id: string;
  reference: string | null;
  amount: number | null;
  provider: string | null;
  requested_at: string | null;
  executed_at: string | null;
  delay_seconds: number | null;
  customer_name: string | null;
  customer_email: string | null;
  executed_by: string | null;
  reason: string | null;
  message: string | null;
  status: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

type BankPaymentRow = {
  id: string;
  provider: string | null;
  sender_email: string | null;
  subject: string | null;
  transaction_reference: string | null;
  amount: number | null;
  currency: string | null;
  payer_origin: string | null;
  normalized_payer_origin: string | null;
  paid_at: string | null;
  raw_body: string | null;
  is_used: boolean | null;
  matched_topup_id: string | null;
  used_at: string | null;
  created_at: string | null;
};

type BannerState = { kind: "success" | "error"; text: string } | null;
type MainTab = "HISTORIAL" | "ALERTAS" | "BANCO";

type RecargasDataResponse = {
  ok?: boolean;
  topups?: FormattedTopup[];
  alerts?: AlertRow[];
  bankPayments?: BankPaymentRow[];
  partialErrors?: string[];
  error?: string;
};

const PAGE_SIZE = 10;
const REFRESH_MS = 15000;

function buildPagination(current: number, total: number): Array<number | "..."> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, "...", total];
  if (current >= total - 3) return [1, "...", total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(Math.abs(Number(value || 0))).toLocaleString("es-CO")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";

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

function formatDelay(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (total === 0) return "—";

  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) return `${hrs}h ${mins}min`;
  if (mins > 0) return `${mins} min ${secs}s`;
  return `${secs}s`;
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "PENDING").trim().toUpperCase();
}

function computeDelaySeconds(topup: FormattedTopup) {
  if (typeof topup.delay_seconds === "number") return topup.delay_seconds;

  const end = topup.executed_at || topup.credited_at || topup.approved_at;
  if (!topup.created_at || !end) return null;

  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(topup.created_at).getTime()) / 1000)
  );
}

function isVisibleTopup(topup: FormattedTopup) {
  return normalizeStatus(topup.status) !== "VOIDED" && !topup.voided_at;
}

function statusBadge(status: string | null | undefined) {
  const s = normalizeStatus(status);

  if (s === "APPROVED") {
    return {
      label: "🟢 Aprobada",
      cls: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (s === "PENDING") {
    return {
      label: "🟡 En proceso",
      cls: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (s === "REJECTED") {
    return {
      label: "🔴 Declinada",
      cls: "border border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (s === "EXPIRED") {
    return {
      label: "⚪ Expirada",
      cls: "border border-slate-300 bg-slate-100 text-slate-600",
    };
  }

  if (s === "VOIDED") {
    return {
      label: "⚫ Anulada",
      cls: "border border-zinc-300 bg-zinc-100 text-zinc-700",
    };
  }

  return {
    label: s,
    cls: "border border-slate-200 bg-slate-50 text-slate-700",
  };
}

function bankPaymentStatus(payment: BankPaymentRow) {
  if (payment.is_used && payment.matched_topup_id) {
    return {
      label: "Usado",
      cls: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (payment.is_used && !payment.matched_topup_id) {
    return {
      label: "Invalidado",
      cls: "border border-zinc-300 bg-zinc-100 text-zinc-700",
    };
  }

  return {
    label: "Disponible",
    cls: "border border-amber-200 bg-amber-50 text-amber-700",
  };
}

export default function RecargasAutomaticasPage() {
  const topRef = useRef<HTMLDivElement | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("HISTORIAL");
  const [banner, setBanner] = useState<BannerState>(null);

  const [topups, setTopups] = useState<FormattedTopup[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [bankPayments, setBankPayments] = useState<BankPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/recargas-automaticas/data", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type") || "";
      const result = contentType.includes("application/json")
        ? ((await response.json().catch(() => null)) as RecargasDataResponse | null)
        : null;

      if (!response.ok) {
        const rawText = result ? "" : await response.text().catch(() => "");
        const detail = result?.error || rawText.slice(0, 220).trim();
        throw new Error(
          detail
            ? `No se pudo cargar la API de recargas automáticas (HTTP ${response.status}): ${detail}`
            : `No se pudo cargar la API de recargas automáticas (HTTP ${response.status}).`
        );
      }

      setTopups((result?.topups || []).filter(isVisibleTopup));
      setAlerts(result?.alerts || []);
      setBankPayments((result?.bankPayments || []).filter((payment) => !payment.is_used && !payment.matched_topup_id));
      setLoading(false);

      if (result?.partialErrors?.length) {
        console.warn("Recargas automáticas: carga parcial", result.partialErrors);
      }

      setBanner((current) => (current?.kind === "error" ? null : current));
    } catch (error) {
      setTopups([]);
      setAlerts([]);
      setBankPayments([]);
      setLoading(false);
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las recargas automáticas. Revisa que el SQL de soporte esté aplicado.",
      });
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadData(true);
    }, 0);

    const interval = window.setInterval(() => {
      void loadData(false);
    }, REFRESH_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [loadData]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5500);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const openAlertsCount = useMemo(
    () => alerts.filter((alert) => normalizeStatus(alert.status) === "OPEN").length,
    [alerts]
  );

  const pendingCount = useMemo(
    () => topups.filter((topup) => normalizeStatus(topup.status) === "PENDING").length,
    [topups]
  );

  const approvedCount = useMemo(
    () => topups.filter((topup) => normalizeStatus(topup.status) === "APPROVED").length,
    [topups]
  );

  const availableBankPayments = useMemo(
    () => bankPayments.filter((payment) => !payment.is_used),
    [bankPayments]
  );

  const availableBankPaymentsCount = availableBankPayments.length;

  const filteredTopups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return topups.filter((topup) => {
      const status = normalizeStatus(topup.status);
      const statusMatch = statusFilter === "ALL" || status === statusFilter;
      const termMatch =
        !term ||
        topup.email.toLowerCase().includes(term) ||
        (topup.full_name || "").toLowerCase().includes(term) ||
        (topup.reference || "").toLowerCase().includes(term) ||
        (topup.payer_origin || "").toLowerCase().includes(term) ||
        (topup.matched_bank_reference || "").toLowerCase().includes(term);

      return statusMatch && termMatch;
    });
  }, [topups, searchTerm, statusFilter]);

  const filteredAlerts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return alerts.filter((alert) => {
      return (
        !term ||
        (alert.customer_email || "").toLowerCase().includes(term) ||
        (alert.customer_name || "").toLowerCase().includes(term) ||
        (alert.reference || "").toLowerCase().includes(term) ||
        (alert.reason || "").toLowerCase().includes(term)
      );
    });
  }, [alerts, searchTerm]);

  const filteredBankPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return availableBankPayments.filter((payment) => {
      return (
        !term ||
        (payment.payer_origin || "").toLowerCase().includes(term) ||
        (payment.transaction_reference || "").toLowerCase().includes(term) ||
        (payment.sender_email || "").toLowerCase().includes(term) ||
        (payment.subject || "").toLowerCase().includes(term)
      );
    });
  }, [availableBankPayments, searchTerm]);

  const activeLength =
    mainTab === "HISTORIAL"
      ? filteredTopups.length
      : mainTab === "ALERTAS"
      ? filteredAlerts.length
      : filteredBankPayments.length;

  const totalPages = Math.max(1, Math.ceil(activeLength / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const pageStart = activeLength === 0 ? 0 : (effectivePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(effectivePage * PAGE_SIZE, activeLength);

  const paginatedTopups = useMemo(
    () => filteredTopups.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredTopups, effectivePage]
  );

  const paginatedAlerts = useMemo(
    () => filteredAlerts.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredAlerts, effectivePage]
  );

  const paginatedBankPayments = useMemo(
    () => filteredBankPayments.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredBankPayments, effectivePage]
  );

  const paginationItems = useMemo(
    () => buildPagination(effectivePage, totalPages),
    [effectivePage, totalPages]
  );

  function switchTab(tab: MainTab) {
    setMainTab(tab);
    setPage(1);
    setExpandedId(null);
  }

  function handlePageChange(next: number) {
    setPage(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) throw new Error("No tienes una sesión activa de administrador.");
    return session.access_token;
  }

  async function postAdminAction(url: string, body: Record<string, unknown>) {
    const token = await getAccessToken();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.error || "No se pudo completar la acción.");
    }

    return result;
  }

  async function approveTopup(topup: FormattedTopup) {
    if (!window.confirm(`¿Aprobar manualmente la recarga ${topup.reference || topup.id}?`)) return;

    setUpdatingId(topup.id);
    setBanner(null);

    try {
      await postAdminAction("/api/admin/wallet/topups/approve", {
        topupId: topup.id,
        note: "Aprobación forzada desde panel de recargas automáticas",
      });
      setBanner({ kind: "success", text: "Recarga aprobada y saldo acreditado." });
      await loadData(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "Error al aprobar." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function rejectTopup(topup: FormattedTopup) {
    if (!window.confirm(`¿Declinar la recarga ${topup.reference || topup.id}?`)) return;

    setUpdatingId(topup.id);
    setBanner(null);

    try {
      await postAdminAction("/api/admin/wallet/topups/reject", {
        topupId: topup.id,
        reason: "Recarga declinada desde panel de recargas automáticas",
      });
      setBanner({ kind: "success", text: "Recarga declinada." });
      await loadData(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "Error al declinar." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function voidTopup(topup: FormattedTopup) {
    setUpdatingId(topup.id);
    setBanner(null);

    try {
      const result = await postAdminAction("/api/admin/wallet/topups/void", {
        topupId: topup.id,
      });

      setTopups((current) => current.filter((item) => item.id !== topup.id));
      if (topup.matched_bank_payment_id) {
        setBankPayments((current) =>
          current.filter((payment) => payment.id !== topup.matched_bank_payment_id)
        );
      }

      setBanner({
        kind: "success",
        text: result?.reversed
          ? "Recarga anulada y saldo automático descontado."
          : "Recarga anulada sin tocar saldo.",
      });
      await loadData(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "Error al anular." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function voidBankPayment(payment: BankPaymentRow) {
    setUpdatingId(payment.id);
    setBanner(null);

    try {
      await postAdminAction("/api/admin/bank-payments/void", {
        paymentId: payment.id,
      });

      setBankPayments((current) => current.filter((item) => item.id !== payment.id));
      setBanner({ kind: "success", text: "Pago del banco invalidado. Ya no hará match automático." });
      await loadData(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "Error al invalidar pago." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateAlertStatus(alert: AlertRow, newStatus: "REVIEWED" | "DISMISSED" | "OPEN") {
    setUpdatingId(alert.id);
    setBanner(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("wallet_topup_alerts")
      .update({
        status: newStatus,
        reviewed_by: newStatus === "OPEN" ? null : user?.id || null,
        reviewed_at: newStatus === "OPEN" ? null : new Date().toISOString(),
      })
      .eq("id", alert.id);

    if (error) {
      setBanner({ kind: "error", text: "No se pudo actualizar la alerta." });
      setUpdatingId(null);
      return;
    }

    setBanner({
      kind: "success",
      text:
        newStatus === "REVIEWED"
          ? "Alerta marcada como revisada."
          : newStatus === "DISMISSED"
          ? "Alerta descartada."
          : "Alerta reabierta.",
    });

    await loadData(false);
    setUpdatingId(null);
  }

  return (
    <section ref={topRef} className="space-y-6 pb-6 text-slate-900">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Recargas automáticas
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Centro único para recargas Bre-B / Llaves: historial, alertas anti-fraude y pagos del banco.
          Se actualiza automáticamente cada 15 segundos.
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

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">En proceso</p>
          <p className="mt-2 text-3xl font-extrabold text-amber-600">{pendingCount}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Aprobadas</p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-600">{approvedCount}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Alertas abiertas</p>
          <p className="mt-2 text-3xl font-extrabold text-rose-600">{openAlertsCount}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Pagos disponibles</p>
          <p className="mt-2 text-3xl font-extrabold text-blue-600">{availableBankPaymentsCount}</p>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Control Bre-B / Llaves</h2>
            <p className="mt-2 text-sm text-slate-500">
              Las recargas manuales quedan fuera de este panel y se manejan únicamente desde Wallet.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Buscar</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="correo, nombre, referencia..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white sm:w-72"
              />
            </div>

            {mainTab === "HISTORIAL" && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Estado</label>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white sm:w-48"
                >
                  <option value="ALL">Todos</option>
                  <option value="PENDING">En proceso</option>
                  <option value="APPROVED">Aprobadas</option>
                  <option value="REJECTED">Declinadas</option>
                  <option value="EXPIRED">Expiradas</option>
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => void loadData(true)}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Actualizar
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { key: "HISTORIAL", label: `Historial (${topups.length})` },
            { key: "ALERTAS", label: `Alertas (${openAlertsCount})` },
            { key: "BANCO", label: `Pagos del banco (${availableBankPaymentsCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchTab(tab.key as MainTab)}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                mainTab === tab.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mainTab === "HISTORIAL" && (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
            {loading ? (
              <div className="px-5 py-8 text-sm text-slate-500">Cargando recargas...</div>
            ) : filteredTopups.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">No hay recargas con ese filtro.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {paginatedTopups.map((topup) => {
                  const status = normalizeStatus(topup.status);
                  const badge = statusBadge(status);
                  const delay = computeDelaySeconds(topup);
                  const canApprove = status === "PENDING";
                  const canReject = status === "PENDING";
                  const canVoid = !["VOIDED"].includes(status);

                  return (
                    <div key={topup.id} className="p-5 md:p-6">
                      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.8fr_0.85fr_1fr_1fr] lg:items-center">
                        <div>
                          <p className="break-all text-sm font-bold text-slate-900">{topup.email}</p>
                          {topup.full_name && <p className="mt-1 text-xs text-slate-500">{topup.full_name}</p>}
                          <p className="mt-2 break-all text-xs font-semibold text-slate-500">{topup.reference || "Sin referencia"}</p>
                          {topup.payer_origin && (
                            <p className="mt-1 text-xs text-slate-500">Origen: {topup.payer_origin}</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Monto</p>
                          <p className="mt-1 text-lg font-extrabold text-slate-900">{formatMoney(topup.amount)}</p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Estado</p>
                          <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {delay !== null && delay > 300 && (
                            <p className="mt-2 text-xs font-semibold text-rose-600">Demora: {formatDelay(delay)}</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Fechas</p>
                          <p className="mt-1 text-xs text-slate-600">Solicitada: {formatDate(topup.created_at)}</p>
                          <p className="mt-1 text-xs text-slate-600">Aprobada: {formatDate(topup.executed_at || topup.credited_at || topup.approved_at)}</p>
                          {topup.matched_bank_reference && (
                            <p className="mt-1 break-all text-xs text-blue-600">Banco: {topup.matched_bank_reference}</p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 lg:items-end">
                          {canApprove && (
                            <button
                              type="button"
                              onClick={() => void approveTopup(topup)}
                              disabled={updatingId === topup.id}
                              className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {updatingId === topup.id ? "Procesando..." : "Aprobar"}
                            </button>
                          )}

                          {canReject && (
                            <button
                              type="button"
                              onClick={() => void rejectTopup(topup)}
                              disabled={updatingId === topup.id}
                              className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                            >
                              Declinar
                            </button>
                          )}

                          {canVoid && (
                            <button
                              type="button"
                              onClick={() => void voidTopup(topup)}
                              disabled={updatingId === topup.id}
                              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              Eliminar / anular
                            </button>
                          )}
                        </div>
                      </div>

                      {(topup.receipt_url || topup.admin_note || topup.error_message || topup.void_reason) && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                          {topup.receipt_url && (
                            <a
                              href={topup.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-blue-600 hover:underline"
                            >
                              Ver comprobante
                            </a>
                          )}
                          {topup.admin_note && <p className="mt-2">Nota admin: {topup.admin_note}</p>}
                          {topup.error_message && <p className="mt-2">Detalle: {topup.error_message}</p>}
                          {topup.void_reason && <p className="mt-2">Anulación: {topup.void_reason}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mainTab === "ALERTAS" && (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
            {loading ? (
              <div className="px-5 py-8 text-sm text-slate-500">Cargando alertas...</div>
            ) : filteredAlerts.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">No hay alertas con ese filtro.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {paginatedAlerts.map((alert) => {
                  const isOpen = normalizeStatus(alert.status) === "OPEN";
                  const expanded = expandedId === alert.id;

                  return (
                    <div key={alert.id} className="p-5 md:p-6">
                      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                isOpen
                                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                                  : "border border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {isOpen ? "Abierta" : normalizeStatus(alert.status)}
                            </span>
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                              Demoró {formatDelay(alert.delay_seconds)}
                            </span>
                          </div>

                          <p className="mt-3 break-all text-sm font-bold text-slate-900">
                            {alert.customer_email || "Sin correo"}
                          </p>
                          {alert.customer_name && <p className="mt-1 text-sm text-slate-500">{alert.customer_name}</p>}

                          <div className="mt-4 grid gap-4 md:grid-cols-4">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Monto</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{formatMoney(alert.amount)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Solicitada</p>
                              <p className="mt-1 text-sm text-slate-700">{formatDate(alert.requested_at)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Aprobada</p>
                              <p className="mt-1 text-sm text-slate-700">{formatDate(alert.executed_at)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Referencia</p>
                              <p className="mt-1 break-all text-sm text-slate-700">{alert.reference || "N/A"}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : alert.id)}
                            className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
                          >
                            {expanded ? "Ocultar detalle" : "Ver detalle completo"}
                          </button>

                          {expanded && alert.message && (
                            <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                              {alert.message}
                            </pre>
                          )}
                        </div>

                        <div className="flex flex-row gap-2 md:flex-col md:items-end">
                          {isOpen ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void updateAlertStatus(alert, "REVIEWED")}
                                disabled={updatingId === alert.id}
                                className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                              >
                                Revisada
                              </button>
                              <button
                                type="button"
                                onClick={() => void updateAlertStatus(alert, "DISMISSED")}
                                disabled={updatingId === alert.id}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                              >
                                Descartar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void updateAlertStatus(alert, "OPEN")}
                              disabled={updatingId === alert.id}
                              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              Reabrir
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mainTab === "BANCO" && (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
            {loading ? (
              <div className="px-5 py-8 text-sm text-slate-500">Cargando pagos del banco...</div>
            ) : filteredBankPayments.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">No hay pagos del banco disponibles para hacer match con ese filtro.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {paginatedBankPayments.map((payment) => {
                  const status = bankPaymentStatus(payment);
                  const canVoid = !payment.is_used;

                  return (
                    <div key={payment.id} className="p-5 md:p-6">
                      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.7fr_0.8fr_0.9fr_0.8fr] lg:items-center">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{payment.payer_origin || "Sin pagador"}</p>
                          <p className="mt-1 break-all text-xs text-slate-500">{payment.transaction_reference || "Sin referencia"}</p>
                          {payment.sender_email && <p className="mt-1 break-all text-xs text-slate-500">{payment.sender_email}</p>}
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Monto</p>
                          <p className="mt-1 text-lg font-extrabold text-slate-900">{formatMoney(payment.amount)}</p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Estado</p>
                          <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${status.cls}`}>
                            {status.label}
                          </span>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Fecha pago</p>
                          <p className="mt-1 text-sm text-slate-700">{formatDate(payment.paid_at || payment.created_at)}</p>
                          {payment.matched_topup_id && (
                            <p className="mt-1 break-all text-xs text-blue-600">Cruzado con recarga</p>
                          )}
                        </div>

                        <div className="flex justify-start lg:justify-end">
                          {canVoid ? (
                            <button
                              type="button"
                              onClick={() => void voidBankPayment(payment)}
                              disabled={updatingId === payment.id}
                              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              {updatingId === payment.id ? "Procesando..." : "Invalidar"}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">Sin acción</span>
                          )}
                        </div>
                      </div>

                      {payment.subject && <p className="mt-3 text-xs text-slate-500">Asunto: {payment.subject}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loading && activeLength > 0 && (
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{pageStart}</span> -{" "}
              <span className="font-semibold">{pageEnd}</span> de{" "}
              <span className="font-semibold">{activeLength}</span>
            </p>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.max(effectivePage - 1, 1))}
                  disabled={effectivePage === 1}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ‹
                </button>

                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`ra-ellipsis-${index}`}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handlePageChange(item)}
                      className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${
                        effectivePage === item
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
                  onClick={() => handlePageChange(Math.min(effectivePage + 1, totalPages))}
                  disabled={effectivePage === totalPages}
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