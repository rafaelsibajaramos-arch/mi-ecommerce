"use client";

import type { FormEvent } from "react";
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
  promotion_id: string | null;
  promotion_name: string | null;
  promotion_bonus_type: string | null;
  promotion_bonus_value: number | null;
  promotion_bonus_amount: number | null;
  promotion_total_amount: number | null;
  promotion_applied_at: string | null;
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
  updated_at: string | null;
};

type PromotionRow = {
  id: string;
  name: string | null;
  status: string | null;
  min_amount: number | null;
  bonus_type: string | null;
  bonus_value: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PromotionFormState = {
  name: string;
  minAmount: string;
  bonusType: "PERCENTAGE" | "FIXED";
  bonusValue: string;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "PAUSED";
};

type BannerState = { kind: "success" | "error"; text: string } | null;
type MainTab = "HISTORIAL" | "ALERTAS" | "BANCO" | "BANCO_HISTORIAL";

type RecargasDataResponse = {
  ok?: boolean;
  topups?: FormattedTopup[];
  alerts?: AlertRow[];
  promotions?: PromotionRow[];
  bankPayments?: BankPaymentRow[];
  bankHistoryToday?: BankPaymentRow[];
  bankHistoryDate?: string;
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

function toDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function isWithinDateRange(value: string | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;

  const current = new Date(value).getTime();
  if (!Number.isFinite(current)) return false;

  if (from) {
    const fromTime = new Date(`${from}T00:00:00`).getTime();
    if (Number.isFinite(fromTime) && current < fromTime) return false;
  }

  if (to) {
    const toTime = new Date(`${to}T23:59:59.999`).getTime();
    if (Number.isFinite(toTime) && current > toTime) return false;
  }

  return true;
}

function getTopupDateForFilter(topup: FormattedTopup) {
  const status = normalizeStatus(topup.status);

  if (status === "APPROVED") {
    return topup.executed_at || topup.credited_at || topup.approved_at || topup.created_at;
  }

  if (status === "REJECTED") return topup.rejected_at || topup.created_at;
  if (status === "EXPIRED") return topup.expired_at || topup.created_at;

  return topup.created_at;
}

function sumMoney<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}


function toLocalDateTimeInput(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function buildDefaultPromotionForm(): PromotionFormState {
  return {
    name: "Aumento de recarga 10%",
    minAmount: "30000",
    bonusType: "PERCENTAGE",
    bonusValue: "10",
    startsAt: toLocalDateTimeInput(new Date().toISOString()),
    endsAt: "",
    status: "ACTIVE",
  };
}

function promotionRuntimeStatus(promotion: PromotionRow) {
  const status = normalizeStatus(promotion.status);
  const now = Date.now();
  const startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : 0;
  const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;

  if (status === "PAUSED") {
    return { label: "Pausada", cls: "border border-slate-200 bg-slate-50 text-slate-600" };
  }

  if (Number.isFinite(startsAt) && startsAt > now) {
    return { label: "Programada", cls: "border border-blue-200 bg-blue-50 text-blue-700" };
  }

  if (endsAt && Number.isFinite(endsAt) && endsAt < now) {
    return { label: "Vencida", cls: "border border-zinc-200 bg-zinc-50 text-zinc-600" };
  }

  return { label: "Activa", cls: "border border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function promotionBonusLabel(promotion: PromotionRow) {
  const type = String(promotion.bonus_type || "PERCENTAGE").toUpperCase();
  const value = Number(promotion.bonus_value || 0);

  if (type === "FIXED") return `${formatMoney(value)} fijos`;
  return `${value.toLocaleString("es-CO")}% adicional`;
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
      label: "Acreditado",
      cls: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (!payment.is_used && payment.matched_topup_id) {
    return {
      label: "En proceso",
      cls: "border border-blue-200 bg-blue-50 text-blue-700",
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
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [bankPayments, setBankPayments] = useState<BankPaymentRow[]>([]);
  const [bankHistoryToday, setBankHistoryToday] = useState<BankPaymentRow[]>([]);
  const [bankHistoryDate, setBankHistoryDate] = useState("");
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promotionForm, setPromotionForm] = useState<PromotionFormState>(() => buildDefaultPromotionForm());
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [savingPromotion, setSavingPromotion] = useState(false);

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) throw new Error("No tienes una sesión activa de administrador.");
    return session.access_token;
  }

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
      setPromotions(result?.promotions || []);
      setBankPayments((result?.bankPayments || []).filter((payment) => !payment.is_used && !payment.matched_topup_id));
      setBankHistoryToday(result?.bankHistoryToday || []);
      setBankHistoryDate(result?.bankHistoryDate || "");
      setLoading(false);

      if (result?.partialErrors?.length) {
        console.warn("Recargas automáticas: carga parcial", result.partialErrors);
      }

      setBanner((current) => (current?.kind === "error" ? null : current));
    } catch (error) {
      setTopups([]);
      setAlerts([]);
      setPromotions([]);
      setBankPayments([]);
      setBankHistoryToday([]);
      setBankHistoryDate("");
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

  const availableBankPayments = useMemo(
    () => bankPayments.filter((payment) => !payment.is_used),
    [bankPayments]
  );

  const availableBankPaymentsInScope = useMemo(() => {
    return availableBankPayments.filter((payment) =>
      isWithinDateRange(payment.paid_at || payment.created_at, dateFrom, dateTo)
    );
  }, [availableBankPayments, dateFrom, dateTo]);

  const topupsInScope = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return topups.filter((topup) => {
      const termMatch =
        !term ||
        topup.email.toLowerCase().includes(term) ||
        (topup.full_name || "").toLowerCase().includes(term) ||
        (topup.reference || "").toLowerCase().includes(term) ||
        (topup.payer_origin || "").toLowerCase().includes(term) ||
        (topup.matched_bank_reference || "").toLowerCase().includes(term);

      return termMatch && isWithinDateRange(getTopupDateForFilter(topup), dateFrom, dateTo);
    });
  }, [topups, searchTerm, dateFrom, dateTo]);

  const alertsInScope = useMemo(() => {
    return alerts.filter((alert) =>
      isWithinDateRange(alert.executed_at || alert.requested_at || alert.created_at, dateFrom, dateTo)
    );
  }, [alerts, dateFrom, dateTo]);

  const openAlertsCount = useMemo(
    () => alertsInScope.filter((alert) => normalizeStatus(alert.status) === "OPEN").length,
    [alertsInScope]
  );

  const pendingCount = useMemo(
    () => topupsInScope.filter((topup) => normalizeStatus(topup.status) === "PENDING").length,
    [topupsInScope]
  );

  const approvedTopupsInScope = useMemo(
    () => topupsInScope.filter((topup) => normalizeStatus(topup.status) === "APPROVED"),
    [topupsInScope]
  );

  const approvedCount = approvedTopupsInScope.length;

  const totalRechargedAmount = useMemo(
    () => sumMoney(approvedTopupsInScope, (topup) => Number(topup.amount || 0)),
    [approvedTopupsInScope]
  );

  const availableBankPaymentsCount = availableBankPaymentsInScope.length;

  const filteredTopups = useMemo(() => {
    return topupsInScope.filter((topup) => {
      const status = normalizeStatus(topup.status);
      return statusFilter === "ALL" || status === statusFilter;
    });
  }, [topupsInScope, statusFilter]);

  const filteredAlerts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return alertsInScope.filter((alert) => {
      return (
        !term ||
        (alert.customer_email || "").toLowerCase().includes(term) ||
        (alert.customer_name || "").toLowerCase().includes(term) ||
        (alert.reference || "").toLowerCase().includes(term) ||
        (alert.reason || "").toLowerCase().includes(term)
      );
    });
  }, [alertsInScope, searchTerm]);

  const filteredBankPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return availableBankPaymentsInScope.filter((payment) => {
      return (
        !term ||
        (payment.payer_origin || "").toLowerCase().includes(term) ||
        (payment.transaction_reference || "").toLowerCase().includes(term) ||
        (payment.sender_email || "").toLowerCase().includes(term) ||
        (payment.subject || "").toLowerCase().includes(term)
      );
    });
  }, [availableBankPaymentsInScope, searchTerm]);

  const filteredBankHistoryToday = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return bankHistoryToday.filter((payment) => {
      return (
        !term ||
        (payment.payer_origin || "").toLowerCase().includes(term) ||
        (payment.transaction_reference || "").toLowerCase().includes(term) ||
        (payment.sender_email || "").toLowerCase().includes(term) ||
        (payment.subject || "").toLowerCase().includes(term)
      );
    });
  }, [bankHistoryToday, searchTerm]);

  const activeLength =
    mainTab === "HISTORIAL"
      ? filteredTopups.length
      : mainTab === "ALERTAS"
      ? filteredAlerts.length
      : mainTab === "BANCO"
      ? filteredBankPayments.length
      : filteredBankHistoryToday.length;

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

  const paginatedBankHistoryToday = useMemo(
    () => filteredBankHistoryToday.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredBankHistoryToday, effectivePage]
  );

  const paginationItems = useMemo(
    () => buildPagination(effectivePage, totalPages),
    [effectivePage, totalPages]
  );

  function switchTab(tab: MainTab) {
    setMainTab(tab);
    setPage(1);
    setExpandedId(null);

    if (tab === "BANCO_HISTORIAL") {
      const today = toDateInputValue(new Date());
      setDateFrom(today);
      setDateTo(today);
    }
  }

  function handlePageChange(next: number) {
    setPage(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setTodayFilter() {
    const today = toDateInputValue(new Date());
    setDateFrom(today);
    setDateTo(today);
    setPage(1);
  }

  function setCurrentMonthFilter() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    setDateFrom(toDateInputValue(firstDay));
    setDateTo(toDateInputValue(now));
    setPage(1);
  }

  function clearDateFilter() {
    setDateFrom("");
    setDateTo("");
    setPage(1);
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


  function resetPromotionForm() {
    setEditingPromotionId(null);
    setPromotionForm(buildDefaultPromotionForm());
  }

  function editPromotion(promotion: PromotionRow) {
    setEditingPromotionId(promotion.id);
    setPromotionForm({
      name: promotion.name || "",
      minAmount: String(Math.round(Number(promotion.min_amount || 0))),
      bonusType: String(promotion.bonus_type || "PERCENTAGE").toUpperCase() === "FIXED" ? "FIXED" : "PERCENTAGE",
      bonusValue: String(Math.round(Number(promotion.bonus_value || 0))),
      startsAt: toLocalDateTimeInput(promotion.starts_at),
      endsAt: promotion.ends_at ? toLocalDateTimeInput(promotion.ends_at) : "",
      status: normalizeStatus(promotion.status) === "PAUSED" ? "PAUSED" : "ACTIVE",
    });
  }

  async function savePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPromotion(true);
    setBanner(null);

    try {
      await postAdminAction("/api/admin/topup-promotions", {
        action: "save",
        id: editingPromotionId,
        name: promotionForm.name,
        minAmount: Number(promotionForm.minAmount),
        bonusType: promotionForm.bonusType,
        bonusValue: Number(promotionForm.bonusValue),
        startsAt: dateTimeInputToIso(promotionForm.startsAt),
        endsAt: dateTimeInputToIso(promotionForm.endsAt),
        status: promotionForm.status,
      });

      setBanner({ kind: "success", text: editingPromotionId ? "Promoción actualizada." : "Promoción creada." });
      resetPromotionForm();
      await loadData(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "No se pudo guardar la promoción." });
    } finally {
      setSavingPromotion(false);
    }
  }

  async function togglePromotionStatus(promotion: PromotionRow) {
    setUpdatingId(promotion.id);
    setBanner(null);

    const currentStatus = normalizeStatus(promotion.status) === "PAUSED" ? "PAUSED" : "ACTIVE";
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";

    try {
      await postAdminAction("/api/admin/topup-promotions", {
        action: "status",
        id: promotion.id,
        status: nextStatus,
      });

      setBanner({ kind: "success", text: nextStatus === "ACTIVE" ? "Promoción activada." : "Promoción pausada." });
      await loadData(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "No se pudo cambiar la promoción." });
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">En proceso</p>
          <p className="mt-2 text-2xl font-extrabold leading-none text-amber-600">{pendingCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Aprobadas</p>
          <p className="mt-2 text-2xl font-extrabold leading-none text-emerald-600">{approvedCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total recargado</p>
          <p className="mt-2 whitespace-nowrap text-2xl font-extrabold leading-none text-slate-900">
            {formatMoney(totalRechargedAmount)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Alertas abiertas</p>
          <p className="mt-2 text-2xl font-extrabold leading-none text-rose-600">{openAlertsCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pagos disponibles</p>
          <p className="mt-2 text-2xl font-extrabold leading-none text-blue-600">{availableBankPaymentsCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Llegaron hoy</p>
          <p className="mt-2 text-2xl font-extrabold leading-none text-violet-600">{bankHistoryToday.length}</p>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-extrabold text-slate-900">Control Bre-B / Llaves</h2>

          <button
            type="button"
            onClick={() => void loadData(true)}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Actualizar
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_180px_150px_150px_auto] xl:items-end">
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
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          {mainTab === "HISTORIAL" ? (
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Estado</label>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="ALL">Todos</option>
                <option value="PENDING">En proceso</option>
                <option value="APPROVED">Aprobadas</option>
                <option value="REJECTED">Declinadas</option>
                <option value="EXPIRED">Expiradas</option>
              </select>
            </div>
          ) : (
            <div className="hidden xl:block" />
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1 xl:flex-nowrap xl:justify-end">
            <button
              type="button"
              onClick={setTodayFilter}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={setCurrentMonthFilter}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Mes
            </button>
            <button
              type="button"
              onClick={clearDateFilter}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {[
            { key: "HISTORIAL", label: `Historial (${filteredTopups.length})` },
            { key: "ALERTAS", label: `Alertas (${openAlertsCount})` },
            { key: "BANCO", label: `Pagos del banco (${availableBankPaymentsCount})` },
            { key: "BANCO_HISTORIAL", label: `Historial del banco hoy (${bankHistoryToday.length})` },
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
                          {Number(topup.promotion_bonus_amount || 0) > 0 && (
                            <div className="mt-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2">
                              <p className="text-xs font-bold text-violet-700">Bono: {formatMoney(topup.promotion_bonus_amount)}</p>
                              <p className="mt-1 text-xs text-violet-700">Total: {formatMoney(topup.promotion_total_amount || Number(topup.amount || 0) + Number(topup.promotion_bonus_amount || 0))}</p>
                            </div>
                          )}
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
                          {topup.promotion_name && (
                            <p className="mt-1 text-xs font-semibold text-violet-600">Promo: {topup.promotion_name}</p>
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

        {mainTab === "BANCO_HISTORIAL" && (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 md:px-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Transferencias recibidas hoy</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Aquí aparecen todas las transferencias que sí llegaron a la página, estén disponibles, en proceso, acreditadas o invalidadas.
                  </p>
                </div>
                <span className="mt-2 inline-flex w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 sm:mt-0">
                  {bankHistoryDate || toDateInputValue(new Date())}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="px-5 py-8 text-sm text-slate-500">Cargando historial del banco...</div>
            ) : filteredBankHistoryToday.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">Hoy todavía no han llegado transferencias al banco de la página.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {paginatedBankHistoryToday.map((payment) => {
                  const status = bankPaymentStatus(payment);

                  return (
                    <div key={payment.id} className="p-5 md:p-6">
                      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.7fr_0.75fr_1fr] lg:items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">{payment.payer_origin || "Sin pagador"}</p>
                          <p className="mt-1 break-all text-xs text-slate-500">{payment.transaction_reference || "Sin referencia"}</p>
                          {payment.sender_email && (
                            <p className="mt-1 break-all text-xs text-slate-500">{payment.sender_email}</p>
                          )}
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
                          {payment.matched_topup_id && (
                            <p className="mt-2 text-xs font-semibold text-blue-600">Asociada a una recarga</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Registro en la página</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{formatDate(payment.created_at)}</p>
                          <p className="mt-2 text-xs text-slate-500">Fecha reportada por el correo: {formatDate(payment.paid_at)}</p>
                          {payment.used_at && (
                            <p className="mt-1 text-xs text-slate-500">Procesada: {formatDate(payment.used_at)}</p>
                          )}
                        </div>
                      </div>

                      {payment.subject && (
                        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">Asunto: {payment.subject}</p>
                      )}
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
