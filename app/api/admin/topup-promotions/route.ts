import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  getPromotionRuntimeStatus,
  normalizePromotionScheduleType,
  type TopupPromotionRow,
} from "../../../../lib/topupPromotions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMOTION_TIME_ZONE = "America/Bogota";

type AnyRow = Record<string, unknown>;

type PromotionPayload = {
  id?: unknown;
  name?: unknown;
  minAmount?: unknown;
  bonusType?: unknown;
  bonusValue?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  status?: unknown;
  scheduleType?: unknown;
  weekdays?: unknown;
  dailyStartTime?: unknown;
  dailyEndTime?: unknown;
  scheduleTimezone?: unknown;
  action?: unknown;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function jsonOk(payload: Record<string, unknown>) {
  return NextResponse.json(
    { ok: true, ...payload },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Falta la variable de entorno ${name}`);
  return value.trim();
}

function createSupabaseUserClientFromToken(token: string) {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function requireAdmin(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) throw new Error("No autorizado.");

  const supabaseAuth = createSupabaseUserClientFromToken(token);
  const supabaseAdmin = createSupabaseAdmin();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) throw new Error("Sesión inválida.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error("No se pudo validar el administrador.");
  if (!profile || String((profile as { role?: string | null }).role || "") !== "admin") {
    throw new Error("No tienes permisos de administrador.");
  }

  return { user, supabaseAdmin };
}

function normalizeMoney(value: unknown, fieldLabel: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} debe ser un número válido mayor o igual a cero.`);
  }
  return Math.round(numeric);
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeIsoDate(value: unknown, fieldLabel: string, required: boolean) {
  const raw = normalizeText(value, "");
  if (!raw) {
    if (required) throw new Error(`${fieldLabel} es obligatorio.`);
    return null;
  }

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error(`${fieldLabel} no tiene una fecha válida.`);
  return date.toISOString();
}

function normalizeStatus(value: unknown) {
  const status = normalizeText(value, "ACTIVE").toUpperCase();
  return status === "PAUSED" ? "PAUSED" : "ACTIVE";
}

function normalizeBonusType(value: unknown) {
  const type = normalizeText(value, "PERCENTAGE").toUpperCase();
  return type === "FIXED" ? "FIXED" : "PERCENTAGE";
}

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((left, right) => left - right);
}

function normalizeTime(value: unknown, fieldLabel: string, fallback: string) {
  const raw = normalizeText(value, fallback);
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error(`${fieldLabel} no tiene una hora válida.`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`${fieldLabel} no tiene una hora válida.`);
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeTimezone(_value: unknown) {
  // La plataforma opera con horario de Colombia. Mantenerlo fijo evita
  // referencias indefinidas y diferencias entre navegador, servidor y Supabase.
  return PROMOTION_TIME_ZONE;
}

function normalizePromotionPayload(body: PromotionPayload) {
  const name = normalizeText(body.name);
  const minAmount = normalizeMoney(body.minAmount, "El monto mínimo");
  const bonusType = normalizeBonusType(body.bonusType);
  const bonusValue = normalizeMoney(body.bonusValue, "El valor del bono");
  const startsAt = normalizeIsoDate(body.startsAt, "La fecha de inicio", true);
  const endsAt = normalizeIsoDate(body.endsAt, "La fecha de finalización", false);
  const status = normalizeStatus(body.status);
  const scheduleType = normalizePromotionScheduleType(normalizeText(body.scheduleType, "ONE_TIME"));
  const scheduleTimezone = normalizeTimezone(body.scheduleTimezone);
  const weekdays = scheduleType === "WEEKLY" ? normalizeWeekdays(body.weekdays) : [];
  const dailyStartTime = scheduleType === "WEEKLY" ? normalizeTime(body.dailyStartTime, "La hora de inicio", "00:00") : null;
  const dailyEndTime = scheduleType === "WEEKLY" ? normalizeTime(body.dailyEndTime, "La hora de finalización", "23:59") : null;

  if (!name) throw new Error("El nombre de la promoción es obligatorio.");
  if (bonusValue <= 0) throw new Error("El bono debe ser mayor a cero.");
  if (bonusType === "PERCENTAGE" && bonusValue > 100) {
    throw new Error("El porcentaje no puede ser mayor a 100%.");
  }
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error("La fecha final debe ser posterior a la fecha de inicio.");
  }
  if (scheduleType === "WEEKLY" && weekdays.length === 0) {
    throw new Error("Selecciona por lo menos un día de la semana.");
  }
  if (
    scheduleType === "WEEKLY" &&
    dailyStartTime &&
    dailyEndTime &&
    timeToMinutes(dailyEndTime) < timeToMinutes(dailyStartTime)
  ) {
    throw new Error("La hora final debe ser igual o posterior a la hora de inicio.");
  }

  return {
    name,
    min_amount: minAmount,
    bonus_type: bonusType,
    bonus_value: bonusValue,
    starts_at: startsAt,
    ends_at: endsAt,
    status,
    schedule_type: scheduleType,
    weekdays,
    daily_start_time: dailyStartTime,
    daily_end_time: dailyEndTime,
    schedule_timezone: scheduleTimezone,
    deleted_at: null,
    deleted_by: null,
  };
}

function textValue(row: AnyRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function numberValue(row: AnyRow, key: string) {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function numberArrayValue(row: AnyRow, key: string) {
  const value = row[key];
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

type PromotionStats = {
  usedCount: number;
  totalBonusAmount: number;
  totalPromotedAmount: number;
  lastAppliedAt: string | null;
};

function emptyStats(): PromotionStats {
  return {
    usedCount: 0,
    totalBonusAmount: 0,
    totalPromotedAmount: 0,
    lastAppliedAt: null,
  };
}

function normalizePromotion(row: AnyRow, stats: PromotionStats) {
  return {
    id: String(row.id || ""),
    name: textValue(row, "name"),
    status: textValue(row, "status"),
    min_amount: numberValue(row, "min_amount"),
    bonus_type: textValue(row, "bonus_type"),
    bonus_value: numberValue(row, "bonus_value"),
    starts_at: textValue(row, "starts_at"),
    ends_at: textValue(row, "ends_at"),
    schedule_type: textValue(row, "schedule_type") || "ONE_TIME",
    weekdays: numberArrayValue(row, "weekdays"),
    daily_start_time: textValue(row, "daily_start_time"),
    daily_end_time: textValue(row, "daily_end_time"),
    schedule_timezone: textValue(row, "schedule_timezone") || "America/Bogota",
    deleted_at: textValue(row, "deleted_at"),
    created_at: textValue(row, "created_at"),
    updated_at: textValue(row, "updated_at"),
    used_count: stats.usedCount,
    total_bonus_amount: stats.totalBonusAmount,
    total_promoted_amount: stats.totalPromotedAmount,
    last_applied_at: stats.lastAppliedAt,
  };
}

async function loadPromotionStats(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .select("id, promotion_id, promotion_bonus_amount, promotion_total_amount, promotion_applied_at, status")
    .not("promotion_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(3000);

  if (error) return new Map<string, PromotionStats>();

  const statsMap = new Map<string, PromotionStats>();

  ((((data || []) as unknown) as AnyRow[])).forEach((row) => {
    const promotionId = textValue(row, "promotion_id");
    if (!promotionId) return;

    const stats = statsMap.get(promotionId) || emptyStats();
    const bonus = numberValue(row, "promotion_bonus_amount") || 0;
    const total = numberValue(row, "promotion_total_amount") || 0;
    const appliedAt = textValue(row, "promotion_applied_at");

    stats.usedCount += 1;
    stats.totalBonusAmount += bonus;
    stats.totalPromotedAmount += total;

    if (appliedAt) {
      const current = stats.lastAppliedAt ? new Date(stats.lastAppliedAt).getTime() : 0;
      const next = new Date(appliedAt).getTime();
      if (Number.isFinite(next) && next > current) stats.lastAppliedAt = appliedAt;
    }

    statsMap.set(promotionId, stats);
  });

  return statsMap;
}

export async function GET(request: NextRequest) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);

    const [{ data, error }, statsMap] = await Promise.all([
      supabaseAdmin
        .from("wallet_topup_promotions")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      loadPromotionStats(supabaseAdmin),
    ]);

    if (error) return jsonError(error.message, 500);

    const rawPromotions = (((data || []) as unknown) as AnyRow[]);
    const promotions = rawPromotions.map((row) => normalizePromotion(row, statsMap.get(String(row.id || "")) || emptyStats()));

    const counts = promotions.reduce(
      (acc, promotion) => {
        const runtime = getPromotionRuntimeStatus(promotion as TopupPromotionRow);
        acc.total += 1;
        if (runtime === "ACTIVE") acc.active += 1;
        if (runtime === "SCHEDULED") acc.scheduled += 1;
        if (runtime === "PAUSED") acc.paused += 1;
        if (runtime === "EXPIRED") acc.expired += 1;
        acc.totalBonusAmount += Number(promotion.total_bonus_amount || 0);
        acc.totalUsed += Number(promotion.used_count || 0);
        return acc;
      },
      {
        total: 0,
        active: 0,
        scheduled: 0,
        paused: 0,
        expired: 0,
        totalBonusAmount: 0,
        totalUsed: 0,
      }
    );

    return jsonOk({ promotions, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as PromotionPayload;
    const action = normalizeText(body.action, "save").toLowerCase();
    const id = normalizeText(body.id, "");
    const now = new Date().toISOString();

    if (action === "status") {
      if (!id) return jsonError("Falta el id de la promoción.");
      const nextStatus = normalizeStatus(body.status);
      const { data, error } = await supabaseAdmin
        .from("wallet_topup_promotions")
        .update({ status: nextStatus, updated_by: user.id, updated_at: now })
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);
      return jsonOk({ promotion: data });
    }

    if (action === "delete") {
      if (!id) return jsonError("Falta el id de la promoción.");

      const { error } = await supabaseAdmin
        .from("wallet_topup_promotions")
        .update({
          status: "PAUSED",
          deleted_at: now,
          deleted_by: user.id,
          updated_by: user.id,
          updated_at: now,
        })
        .eq("id", id)
        .is("deleted_at", null);

      if (error) return jsonError(error.message, 500);
      return jsonOk({});
    }

    const payload = normalizePromotionPayload(body);

    if (id) {
      const { data, error } = await supabaseAdmin
        .from("wallet_topup_promotions")
        .update({ ...payload, updated_by: user.id, updated_at: now })
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);
      return jsonOk({ promotion: data });
    }

    const { data, error } = await supabaseAdmin
      .from("wallet_topup_promotions")
      .insert({ ...payload, created_by: user.id, updated_by: user.id })
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);
    return jsonOk({ promotion: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 400;
    return jsonError(message, status);
  }
}
