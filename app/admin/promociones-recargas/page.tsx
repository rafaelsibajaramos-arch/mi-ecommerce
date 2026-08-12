"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Edit3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import {
  getPromotionRuntimeStatus,
  normalizePromotionScheduleType,
  type TopupPromotionRow,
} from "../../../lib/topupPromotions";

type PromotionRow = {
  id: string;
  name: string | null;
  status: string | null;
  min_amount: number | null;
  bonus_type: string | null;
  bonus_value: number | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_type: string | null;
  weekdays: number[] | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  schedule_timezone: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  used_count?: number | null;
  total_bonus_amount?: number | null;
  total_promoted_amount?: number | null;
  last_applied_at?: string | null;
};

type PromotionCounts = {
  total?: number;
  active?: number;
  scheduled?: number;
  paused?: number;
  expired?: number;
  totalBonusAmount?: number;
  totalUsed?: number;
};

type PromotionFormState = {
  name: string;
  minAmount: string;
  bonusType: "PERCENTAGE" | "FIXED";
  bonusValue: string;
  scheduleType: "ONE_TIME" | "WEEKLY";
  startsAt: string;
  endsAt: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  dailyStartTime: string;
  dailyEndTime: string;
  status: "ACTIVE" | "PAUSED";
};

type BannerState = { kind: "success" | "error"; text: string } | null;

type PromotionsResponse = {
  ok?: boolean;
  promotions?: PromotionRow[];
  counts?: PromotionCounts;
  error?: string;
};

const WEEKDAYS = [
  { value: 1, short: "Lun", long: "lunes" },
  { value: 2, short: "Mar", long: "martes" },
  { value: 3, short: "Mié", long: "miércoles" },
  { value: 4, short: "Jue", long: "jueves" },
  { value: 5, short: "Vie", long: "viernes" },
  { value: 6, short: "Sáb", long: "sábado" },
  { value: 0, short: "Dom", long: "domingo" },
];

function formatMoney(value: number | null | undefined) {
  return `$ ${Number(Math.abs(Number(value || 0))).toLocaleString("es-CO")}`;
}

function formatDate(value: string | null | undefined, withTime = true) {
  if (!value) return "Sin límite";

  try {
    return new Date(value).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    });
  } catch {
    return "Sin fecha";
  }
}

function datePartsInBogota(value: string | Date | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return { date: "", dateTime: "" };

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const dateText = `${parts.year}-${parts.month}-${parts.day}`;
  return { date: dateText, dateTime: `${dateText}T${parts.hour}:${parts.minute}` };
}

function toBogotaBoundaryIso(value: string, endOfDay: boolean) {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-05:00`).toISOString();
}

function dateTimeInputToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "ACTIVE").trim().toUpperCase();
}

function normalizeTimeInput(value: string | null | undefined, fallback: string) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function buildDefaultPromotionForm(): PromotionFormState {
  const today = datePartsInBogota(new Date());

  return {
    name: "Aumento de recarga 10%",
    minAmount: "30000",
    bonusType: "PERCENTAGE",
    bonusValue: "10",
    scheduleType: "ONE_TIME",
    startsAt: today.dateTime,
    endsAt: "",
    startDate: today.date,
    endDate: "",
    weekdays: [6],
    dailyStartTime: "00:00",
    dailyEndTime: "23:59",
    status: "ACTIVE",
  };
}

function promotionRuntimeStatus(promotion: PromotionRow) {
  const runtime = getPromotionRuntimeStatus(promotion as unknown as TopupPromotionRow);

  if (runtime === "PAUSED") {
    return {
      key: runtime,
      label: "Pausada",
      filterLabel: "PAUSADA",
      cls: "border-slate-200 bg-slate-100 text-slate-700",
    };
  }

  if (runtime === "SCHEDULED") {
    return {
      key: runtime,
      label: normalizePromotionScheduleType(promotion.schedule_type) === "WEEKLY" ? "En espera del horario" : "Programada",
      filterLabel: "PROGRAMADA",
      cls: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (runtime === "EXPIRED") {
    return {
      key: runtime,
      label: "Vencida",
      filterLabel: "VENCIDA",
      cls: "border-zinc-200 bg-zinc-50 text-zinc-600",
    };
  }

  return {
    key: runtime,
    label: "Activa ahora",
    filterLabel: "ACTIVA",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function promotionBonusLabel(promotion: PromotionRow) {
  const type = String(promotion.bonus_type || "PERCENTAGE").toUpperCase();
  const value = Number(promotion.bonus_value || 0);

  if (type === "FIXED") return `${formatMoney(value)} fijos`;
  return `${value.toLocaleString("es-CO")}% adicional`;
}

function calculateBonus(amount: number, bonusType: "PERCENTAGE" | "FIXED", bonusValue: number) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(bonusValue) || bonusValue <= 0) return 0;
  if (bonusType === "FIXED") return Math.round(bonusValue);
  return Math.round(amount * (bonusValue / 100));
}

function weekdayText(days: number[] | null | undefined) {
  const normalized = Array.isArray(days) ? days : [];
  if (normalized.length === 7) return "Todos los días";
  if (normalized.length === 0) return "Sin días seleccionados";

  return WEEKDAYS.filter((day) => normalized.includes(day.value))
    .map((day) => day.long)
    .join(", ");
}

function scheduleLabel(promotion: PromotionRow) {
  if (normalizePromotionScheduleType(promotion.schedule_type) !== "WEEKLY") {
    return `Una sola vigencia · ${formatDate(promotion.starts_at)} a ${formatDate(promotion.ends_at)}`;
  }

  return `Cada ${weekdayText(promotion.weekdays)} · ${normalizeTimeInput(promotion.daily_start_time, "00:00")} a ${normalizeTimeInput(
    promotion.daily_end_time,
    "23:59"
  )}`;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>;
}

function Label({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>;
}

function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function MetricCard({ title, value, tone }: { title: string; value: string | number; tone: "emerald" | "blue" | "violet" | "slate" }) {
  const toneMap = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    violet: "text-violet-600",
    slate: "text-slate-900",
  } as const;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-extrabold sm:text-3xl ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}

export default function PromocionesRecargasPage() {
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [counts, setCounts] = useState<PromotionCounts>({});
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [savingPromotion, setSavingPromotion] = useState(false);
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [promotionForm, setPromotionForm] = useState<PromotionFormState>(() => buildDefaultPromotionForm());

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) throw new Error("No tienes una sesión activa de administrador.");
    return session.access_token;
  }

  const loadPromotions = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/topup-promotions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as PromotionsResponse | null;

      if (!response.ok) {
        throw new Error(result?.error || "No se pudieron cargar las promociones.");
      }

      setPromotions(result?.promotions || []);
      setCounts(result?.counts || {});
      setBanner((current) => (current?.kind === "error" ? null : current));
    } catch (error) {
      setPromotions([]);
      setCounts({});
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las promociones. Revisa que el SQL de soporte esté aplicado.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadPromotions(true), 0);
    return () => window.clearTimeout(initialTimer);
  }, [loadPromotions]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5500);
    return () => window.clearTimeout(timer);
  }, [banner]);

  async function postAdminAction(body: Record<string, unknown>) {
    const token = await getAccessToken();

    const response = await fetch("/api/admin/topup-promotions", {
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

  function resetPromotionForm() {
    setEditingPromotionId(null);
    setPromotionForm(buildDefaultPromotionForm());
  }

  function applySaturdayTemplate() {
    setPromotionForm((current) => ({
      ...current,
      name: current.name || "Promoción de sábados",
      scheduleType: "WEEKLY",
      weekdays: [6],
      dailyStartTime: "00:00",
      dailyEndTime: "23:59",
      startDate: current.startDate || datePartsInBogota(new Date()).date,
      endDate: "",
    }));
  }

  function editPromotion(promotion: PromotionRow) {
    const scheduleType = normalizePromotionScheduleType(promotion.schedule_type);
    const startParts = datePartsInBogota(promotion.starts_at);
    const endParts = promotion.ends_at ? datePartsInBogota(promotion.ends_at) : { date: "", dateTime: "" };

    setEditingPromotionId(promotion.id);
    setPromotionForm({
      name: promotion.name || "",
      minAmount: String(Math.round(Number(promotion.min_amount || 0))),
      bonusType: String(promotion.bonus_type || "PERCENTAGE").toUpperCase() === "FIXED" ? "FIXED" : "PERCENTAGE",
      bonusValue: String(Math.round(Number(promotion.bonus_value || 0))),
      scheduleType,
      startsAt: startParts.dateTime,
      endsAt: endParts.dateTime,
      startDate: startParts.date,
      endDate: endParts.date,
      weekdays: Array.isArray(promotion.weekdays) && promotion.weekdays.length > 0 ? promotion.weekdays : [6],
      dailyStartTime: normalizeTimeInput(promotion.daily_start_time, "00:00"),
      dailyEndTime: normalizeTimeInput(promotion.daily_end_time, "23:59"),
      status: normalizeStatus(promotion.status) === "PAUSED" ? "PAUSED" : "ACTIVE",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleWeekday(day: number) {
    setPromotionForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((item) => item !== day)
        : [...current.weekdays, day].sort((left, right) => left - right),
    }));
  }

  async function savePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPromotion(true);
    setBanner(null);

    const isWeekly = promotionForm.scheduleType === "WEEKLY";
    const startsAt = isWeekly
      ? toBogotaBoundaryIso(promotionForm.startDate, false)
      : dateTimeInputToIso(promotionForm.startsAt);
    const endsAt = isWeekly
      ? promotionForm.endDate
        ? toBogotaBoundaryIso(promotionForm.endDate, true)
        : null
      : dateTimeInputToIso(promotionForm.endsAt);

    try {
      await postAdminAction({
        action: "save",
        id: editingPromotionId,
        name: promotionForm.name,
        minAmount: Number(promotionForm.minAmount),
        bonusType: promotionForm.bonusType,
        bonusValue: Number(promotionForm.bonusValue),
        scheduleType: promotionForm.scheduleType,
        weekdays: isWeekly ? promotionForm.weekdays : [],
        dailyStartTime: isWeekly ? promotionForm.dailyStartTime : null,
        dailyEndTime: isWeekly ? promotionForm.dailyEndTime : null,
        scheduleTimezone: "America/Bogota",
        startsAt,
        endsAt,
        status: promotionForm.status,
      });

      setBanner({ kind: "success", text: editingPromotionId ? "Promoción actualizada correctamente." : "Promoción creada correctamente." });
      resetPromotionForm();
      await loadPromotions(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "No se pudo guardar la promoción." });
    } finally {
      setSavingPromotion(false);
    }
  }

  async function togglePromotionStatus(promotion: PromotionRow) {
    setWorkingId(promotion.id);
    setBanner(null);

    const currentStatus = normalizeStatus(promotion.status) === "PAUSED" ? "PAUSED" : "ACTIVE";
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";

    try {
      await postAdminAction({ action: "status", id: promotion.id, status: nextStatus });
      setBanner({ kind: "success", text: nextStatus === "ACTIVE" ? "Promoción activada." : "Promoción pausada." });
      await loadPromotions(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "No se pudo cambiar la promoción." });
    } finally {
      setWorkingId(null);
    }
  }

  async function deletePromotion(promotion: PromotionRow) {
    const confirmed = window.confirm(
      `¿Eliminar la promoción “${promotion.name || "Sin nombre"}”?\n\nDejará de aparecer y no volverá a aplicarse. El historial de bonos entregados se conservará.`
    );
    if (!confirmed) return;

    setWorkingId(promotion.id);
    setBanner(null);

    try {
      await postAdminAction({ action: "delete", id: promotion.id });
      if (editingPromotionId === promotion.id) resetPromotionForm();
      setBanner({ kind: "success", text: "Promoción eliminada correctamente." });
      await loadPromotions(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "No se pudo eliminar la promoción." });
    } finally {
      setWorkingId(null);
    }
  }

  const filteredPromotions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return promotions.filter((promotion) => {
      const runtime = promotionRuntimeStatus(promotion).filterLabel;
      const statusMatch = statusFilter === "ALL" || runtime === statusFilter;
      const termMatch =
        !term ||
        (promotion.name || "").toLowerCase().includes(term) ||
        promotionBonusLabel(promotion).toLowerCase().includes(term) ||
        scheduleLabel(promotion).toLowerCase().includes(term);

      return statusMatch && termMatch;
    });
  }, [promotions, searchTerm, statusFilter]);

  const previewAmount = Number(promotionForm.minAmount || 0);
  const previewBonus = calculateBonus(previewAmount, promotionForm.bonusType, Number(promotionForm.bonusValue || 0));
  const previewTotal = previewAmount + previewBonus;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-1 pb-2">
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">Promociones de recarga</h1>
            
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={applySaturdayTemplate}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              <CalendarClock size={16} />
              Plantilla sábados
            </button>

            {editingPromotionId ? (
              <button
                type="button"
                onClick={resetPromotionForm}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Plus size={16} />
                Nueva promoción
              </button>
            ) : null}

          </div>
        </div>
      </Panel>

      {banner ? (
        <div
          className={`rounded-3xl border px-5 py-4 text-sm font-semibold ${
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="Activas ahora" value={counts.active || 0} tone="emerald" />
        <MetricCard title="Programadas / en espera" value={counts.scheduled || 0} tone="blue" />
        <MetricCard title="Usos registrados" value={counts.totalUsed || 0} tone="violet" />
        <MetricCard title="Bonos entregados" value={formatMoney(counts.totalBonusAmount || 0)} tone="slate" />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <Panel className="min-w-0 overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Control</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">Promociones creadas</h2>
              </div>

              <div className="text-sm text-slate-500">
                Mostrando <span className="font-bold text-slate-900">{filteredPromotions.length}</span> de <span className="font-bold text-slate-900">{promotions.length}</span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por nombre, bono o programación..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="ALL">Todos los estados</option>
                <option value="ACTIVA">Activas ahora</option>
                <option value="PROGRAMADA">Programadas / en espera</option>
                <option value="PAUSADA">Pausadas</option>
                <option value="VENCIDA">Vencidas</option>
              </select>
            </div>

            
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
                Cargando promociones...
              </div>
            ) : filteredPromotions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
                No hay promociones con ese filtro.
              </div>
            ) : (
              filteredPromotions.map((promotion) => {
                const runtime = promotionRuntimeStatus(promotion);
                const isPaused = normalizeStatus(promotion.status) === "PAUSED";
                const isWorking = workingId === promotion.id;
                const isWeekly = normalizePromotionScheduleType(promotion.schedule_type) === "WEEKLY";

                return (
                  <article key={promotion.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-extrabold text-slate-900">{promotion.name || "Promoción sin nombre"}</h3>
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${runtime.cls}`}>{runtime.label}</span>
                          <span className="inline-flex rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                            {isWeekly ? "Semanal" : "Única"}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Configuración</p>
                            <p className="mt-2 text-sm font-bold text-slate-800">Desde {formatMoney(promotion.min_amount)}</p>
                            <p className="mt-1 text-sm text-slate-600">{promotionBonusLabel(promotion)}</p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Programación</p>
                            <p className="mt-2 text-sm font-bold leading-6 text-slate-800">{scheduleLabel(promotion)}</p>
                            {isWeekly ? (
                              <p className="mt-1 text-xs text-slate-500">
                                Vigencia general: {formatDate(promotion.starts_at, false)} a {formatDate(promotion.ends_at, false)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Usos</p>
                          <p className="mt-2 text-xl font-extrabold text-slate-800">{promotion.used_count || 0}</p>
                        </div>
                        <div className="rounded-2xl bg-violet-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-400">Bonos</p>
                          <p className="mt-2 text-sm font-extrabold text-violet-700 break-words">{formatMoney(promotion.total_bonus_amount || 0)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Último uso</p>
                          <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{formatDate(promotion.last_applied_at)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => editPromotion(promotion)}
                        disabled={isWorking}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Edit3 size={16} />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => void togglePromotionStatus(promotion)}
                        disabled={isWorking}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                      >
                        {isPaused ? <Play size={16} /> : <Pause size={16} />}
                        {isWorking ? "Actualizando..." : isPaused ? "Activar" : "Pausar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void deletePromotion(promotion)}
                        disabled={isWorking}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        <Trash2 size={16} />
                        {isWorking ? "Procesando..." : "Eliminar"}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </Panel>

        <Panel className="p-5 sm:p-6 2xl:sticky 2xl:top-6 2xl:self-start">
          <div className="border-b border-slate-100 pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
              {editingPromotionId ? "Editando promoción" : "Nueva promoción"}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">Configurar promoción</h2>
           
          </div>

          <form onSubmit={savePromotion} className="mt-5 space-y-5">
            <FieldSection title="Información básica">
              <div>
                <Label>Nombre</Label>
                <input
                  type="text"
                  required
                  value={promotionForm.name}
                  onChange={(event) => setPromotionForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Recarga mínima</Label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={promotionForm.minAmount}
                    onChange={(event) => setPromotionForm((current) => ({ ...current, minAmount: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300"
                  />
                </div>

                <div>
                  <Label>Estado administrativo</Label>
                  <select
                    value={promotionForm.status}
                    onChange={(event) =>
                      setPromotionForm((current) => ({ ...current, status: event.target.value === "PAUSED" ? "PAUSED" : "ACTIVE" }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-300"
                  >
                    <option value="ACTIVE">Activa según horario</option>
                    <option value="PAUSED">Pausada</option>
                  </select>
                </div>
              </div>
            </FieldSection>

            <FieldSection title="Bono">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Tipo de bono</Label>
                  <select
                    value={promotionForm.bonusType}
                    onChange={(event) =>
                      setPromotionForm((current) => ({
                        ...current,
                        bonusType: event.target.value === "FIXED" ? "FIXED" : "PERCENTAGE",
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-300"
                  >
                    <option value="PERCENTAGE">Porcentaje</option>
                    <option value="FIXED">Valor fijo</option>
                  </select>
                </div>

                <div>
                  <Label>{promotionForm.bonusType === "PERCENTAGE" ? "Porcentaje adicional" : "Valor fijo adicional"}</Label>
                  <input
                    type="number"
                    min="1"
                    max={promotionForm.bonusType === "PERCENTAGE" ? "100" : undefined}
                    step={promotionForm.bonusType === "PERCENTAGE" ? "1" : "1000"}
                    required
                    value={promotionForm.bonusValue}
                    onChange={(event) => setPromotionForm((current) => ({ ...current, bonusValue: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300"
                  />
                </div>
              </div>
            </FieldSection>

            <FieldSection title="Programación">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
                <button
                  type="button"
                  onClick={() => setPromotionForm((current) => ({ ...current, scheduleType: "ONE_TIME" }))}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    promotionForm.scheduleType === "ONE_TIME" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  Una sola vez
                </button>
                <button
                  type="button"
                  onClick={() => setPromotionForm((current) => ({ ...current, scheduleType: "WEEKLY" }))}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    promotionForm.scheduleType === "WEEKLY" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  Repetir semanalmente
                </button>
              </div>

              {promotionForm.scheduleType === "ONE_TIME" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Inicio</Label>
                    <input
                      type="datetime-local"
                      required
                      value={promotionForm.startsAt}
                      onChange={(event) => setPromotionForm((current) => ({ ...current, startsAt: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300"
                    />
                  </div>

                  <div>
                    <Label>Fin opcional</Label>
                    <input
                      type="datetime-local"
                      value={promotionForm.endsAt}
                      onChange={(event) => setPromotionForm((current) => ({ ...current, endsAt: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
                  <div>
                    <Label>Días de activación</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 2xl:grid-cols-4">
                      {WEEKDAYS.map((day) => {
                        const selected = promotionForm.weekdays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleWeekday(day.value)}
                            className={`rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
                              selected
                                ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                                : "border-blue-100 bg-white text-blue-700 hover:bg-blue-50"
                            }`}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Hora de inicio</Label>
                      <input
                        type="time"
                        required
                        value={promotionForm.dailyStartTime}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, dailyStartTime: event.target.value }))}
                        className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                      />
                    </div>

                    <div>
                      <Label>Hora de cierre</Label>
                      <input
                        type="time"
                        required
                        value={promotionForm.dailyEndTime}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, dailyEndTime: event.target.value }))}
                        className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Empezar el</Label>
                      <input
                        type="date"
                        required
                        value={promotionForm.startDate}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, startDate: event.target.value }))}
                        className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                      />
                    </div>

                    <div>
                      <Label>Terminar el (opcional)</Label>
                      <input
                        type="date"
                        value={promotionForm.endDate}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, endDate: event.target.value }))}
                        className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                      />
                    </div>
                  </div>

                  <p className="text-xs leading-5 text-blue-700">
                    Horario de Colombia (America/Bogota). Si no defines fecha final, la promoción seguirá repitiéndose cada semana hasta
                    que la pauses o la elimines.
                  </p>
                </div>
              )}
            </FieldSection>

            <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Vista previa</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-sm text-slate-500">Recarga base</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">{formatMoney(previewAmount)}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-sm text-slate-500">Bono</p>
                  <p className="mt-1 text-base font-extrabold text-violet-700">{formatMoney(previewBonus)}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3">
                  <p className="text-sm text-slate-500">Total abonado</p>
                  <p className="mt-1 text-base font-extrabold text-emerald-700">{formatMoney(previewTotal)}</p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPromotion}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {savingPromotion ? <RefreshCw className="animate-spin" size={17} /> : editingPromotionId ? <Save size={17} /> : <Plus size={17} />}
              {savingPromotion ? "Guardando..." : editingPromotionId ? "Guardar cambios" : "Crear promoción"}
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
