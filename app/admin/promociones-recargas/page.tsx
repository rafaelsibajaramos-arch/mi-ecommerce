"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

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
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "PAUSED";
};

type BannerState = { kind: "success" | "error"; text: string } | null;

type PromotionsResponse = {
  ok?: boolean;
  promotions?: PromotionRow[];
  counts?: PromotionCounts;
  error?: string;
};

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

function normalizeStatus(status: string | null | undefined) {
  return String(status || "ACTIVE").trim().toUpperCase();
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
    return {
      label: "Pausada",
      shortLabel: "Pausada",
      cls: "border border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  if (Number.isFinite(startsAt) && startsAt > now) {
    return {
      label: "Programada",
      shortLabel: "Programada",
      cls: "border border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (endsAt && Number.isFinite(endsAt) && endsAt < now) {
    return {
      label: "Vencida",
      shortLabel: "Vencida",
      cls: "border border-zinc-200 bg-zinc-50 text-zinc-600",
    };
  }

  return {
    label: "Activa ahora",
    shortLabel: "Activa",
    cls: "border border-emerald-200 bg-emerald-50 text-emerald-700",
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

export default function PromocionesRecargasPage() {
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [counts, setCounts] = useState<PromotionCounts>({});
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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
    void loadPromotions(true);
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPromotion(true);
    setBanner(null);

    try {
      await postAdminAction({
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
      await loadPromotions(false);
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
      await postAdminAction({
        action: "status",
        id: promotion.id,
        status: nextStatus,
      });

      setBanner({ kind: "success", text: nextStatus === "ACTIVE" ? "Promoción activada." : "Promoción pausada." });
      await loadPromotions(false);
    } catch (error) {
      setBanner({ kind: "error", text: error instanceof Error ? error.message : "No se pudo cambiar la promoción." });
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredPromotions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return promotions.filter((promotion) => {
      const runtime = promotionRuntimeStatus(promotion).shortLabel.toUpperCase();
      const statusMatch = statusFilter === "ALL" || runtime === statusFilter;
      const termMatch =
        !term ||
        (promotion.name || "").toLowerCase().includes(term) ||
        promotionBonusLabel(promotion).toLowerCase().includes(term);

      return statusMatch && termMatch;
    });
  }, [promotions, searchTerm, statusFilter]);

  const previewAmount = Number(promotionForm.minAmount || 0);
  const previewBonus = calculateBonus(previewAmount, promotionForm.bonusType, Number(promotionForm.bonusValue || 0));
  const previewTotal = previewAmount + previewBonus;

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] bg-[#050816] px-5 py-6 text-white shadow-sm sm:px-8 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-violet-300">Promociones</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Promociones de recarga</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Control independiente para programar aumentos automáticos. Cuando una recarga automática hace match,
              el sistema revisa este módulo y acredita saldo base más bono si cumple las reglas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadPromotions(true)}
            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#050816] transition hover:bg-white/90"
          >
            Actualizar
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-3xl border px-5 py-4 text-sm font-semibold ${
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Activas ahora</p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-600">{counts.active || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Programadas</p>
          <p className="mt-2 text-3xl font-extrabold text-blue-600">{counts.scheduled || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Usos registrados</p>
          <p className="mt-2 text-3xl font-extrabold text-violet-600">{counts.totalUsed || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Bonos entregados</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">{formatMoney(counts.totalBonusAmount || 0)}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                {editingPromotionId ? "Editando" : "Nueva regla"}
              </p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Configurar promoción</h2>
              <p className="mt-2 text-sm text-slate-500">
                Define monto mínimo, bono y vigencia. Las recargas ya aprobadas no se recalculan.
              </p>
            </div>

            {editingPromotionId && (
              <button
                type="button"
                onClick={resetPromotionForm}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Nueva promoción
              </button>
            )}
          </div>

          <form onSubmit={savePromotion} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Nombre</label>
              <input
                type="text"
                value={promotionForm.name}
                onChange={(event) => setPromotionForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                placeholder="Aumento de recarga 10%"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Monto mínimo</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={promotionForm.minAmount}
                  onChange={(event) => setPromotionForm((current) => ({ ...current, minAmount: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Estado</label>
                <select
                  value={promotionForm.status}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      status: event.target.value === "PAUSED" ? "PAUSED" : "ACTIVE",
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                >
                  <option value="ACTIVE">Activa / programable</option>
                  <option value="PAUSED">Pausada</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Tipo de bono</label>
                <select
                  value={promotionForm.bonusType}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      bonusType: event.target.value === "FIXED" ? "FIXED" : "PERCENTAGE",
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                >
                  <option value="PERCENTAGE">Porcentaje</option>
                  <option value="FIXED">Valor fijo</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  {promotionForm.bonusType === "PERCENTAGE" ? "Porcentaje adicional" : "Valor fijo adicional"}
                </label>
                <input
                  type="number"
                  min="0"
                  step={promotionForm.bonusType === "PERCENTAGE" ? "1" : "1000"}
                  value={promotionForm.bonusValue}
                  onChange={(event) => setPromotionForm((current) => ({ ...current, bonusValue: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Inicio</label>
                <input
                  type="datetime-local"
                  value={promotionForm.startsAt}
                  onChange={(event) => setPromotionForm((current) => ({ ...current, startsAt: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Fin opcional</label>
                <input
                  type="datetime-local"
                  value={promotionForm.endsAt}
                  onChange={(event) => setPromotionForm((current) => ({ ...current, endsAt: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Vista previa</p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-slate-500">Recarga base</p>
                  <p className="mt-1 font-extrabold text-slate-900">{formatMoney(previewAmount)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Bono</p>
                  <p className="mt-1 font-extrabold text-violet-700">{formatMoney(previewBonus)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Total abonado</p>
                  <p className="mt-1 font-extrabold text-emerald-700">{formatMoney(previewTotal)}</p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPromotion}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {savingPromotion ? "Guardando..." : editingPromotionId ? "Guardar cambios" : "Crear promoción"}
            </button>
          </form>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Control</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Promociones creadas</h2>
              <p className="mt-2 text-sm text-slate-500">
                Pausa, activa o edita sin entrar al historial de recargas automáticas.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar promoción..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="ALL">Todos los estados</option>
                <option value="ACTIVA">Activas</option>
                <option value="PROGRAMADA">Programadas</option>
                <option value="PAUSADA">Pausadas</option>
                <option value="VENCIDA">Vencidas</option>
              </select>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {loading ? (
              <div className="px-5 py-8 text-sm text-slate-500">Cargando promociones...</div>
            ) : filteredPromotions.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">No hay promociones con ese filtro.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredPromotions.map((promotion) => {
                  const runtime = promotionRuntimeStatus(promotion);
                  const isPaused = normalizeStatus(promotion.status) === "PAUSED";

                  return (
                    <div key={promotion.id} className="grid gap-4 p-5 xl:grid-cols-[1.2fr_0.7fr_0.9fr_0.8fr] xl:items-center">
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">{promotion.name || "Promoción sin nombre"}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Desde {formatMoney(promotion.min_amount)} · {promotionBonusLabel(promotion)}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          Último uso: {formatDate(promotion.last_applied_at)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Estado</p>
                        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${runtime.cls}`}>
                          {runtime.label}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Vigencia</p>
                        <p className="mt-1 text-xs text-slate-600">Inicio: {formatDate(promotion.starts_at)}</p>
                        <p className="mt-1 text-xs text-slate-600">Fin: {formatDate(promotion.ends_at)}</p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Resultado</p>
                        <p className="mt-1 text-xs font-bold text-slate-700">Usos: {promotion.used_count || 0}</p>
                        <p className="mt-1 text-xs text-violet-700">Bonos: {formatMoney(promotion.total_bonus_amount || 0)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:col-span-4 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => editPromotion(promotion)}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void togglePromotionStatus(promotion)}
                          disabled={updatingId === promotion.id}
                          className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                        >
                          {updatingId === promotion.id ? "Actualizando..." : isPaused ? "Activar" : "Pausar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
