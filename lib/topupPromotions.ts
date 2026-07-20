import type { SupabaseClient } from "@supabase/supabase-js";

export type TopupPromotionBonusType = "PERCENTAGE" | "FIXED";
export type TopupPromotionScheduleType = "ONE_TIME" | "WEEKLY";
export type TopupPromotionRuntimeStatus = "ACTIVE" | "SCHEDULED" | "PAUSED" | "EXPIRED";

export type TopupPromotionRow = {
  id: string;
  name: string;
  status: string | null;
  min_amount: number | string | null;
  bonus_type: TopupPromotionBonusType | string | null;
  bonus_value: number | string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_type?: TopupPromotionScheduleType | string | null;
  weekdays?: number[] | null;
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  schedule_timezone?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TopupPromotionCalculation = {
  promotion: TopupPromotionRow | null;
  bonusAmount: number;
  totalAmount: number;
};

type BogotaDateParts = {
  weekday: number;
  hour: number;
  minute: number;
};

const BOGOTA_UTC_OFFSET_MINUTES = -5 * 60;

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseTimeToMinutes(value: string | null | undefined, fallback: number) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }

  return hour * 60 + minute;
}

/**
 * Colombia uses UTC-5 throughout the year and does not use daylight-saving time.
 * Calculating the local parts arithmetically avoids browser/server Intl differences
 * and removes any dependency on a dynamically named timezone variable.
 */
function getBogotaDateParts(date: Date): BogotaDateParts {
  const shifted = new Date(date.getTime() + BOGOTA_UTC_OFFSET_MINUTES * 60_000);

  return {
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function normalizeWeekdays(value: number[] | null | undefined) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);
}

export function normalizePromotionBonusType(value: string | null | undefined): TopupPromotionBonusType {
  return String(value || "PERCENTAGE").trim().toUpperCase() === "FIXED" ? "FIXED" : "PERCENTAGE";
}

export function normalizePromotionScheduleType(value: string | null | undefined): TopupPromotionScheduleType {
  return String(value || "ONE_TIME").trim().toUpperCase() === "WEEKLY" ? "WEEKLY" : "ONE_TIME";
}

export function getPromotionRuntimeStatus(
  promotion: TopupPromotionRow,
  referenceAt: string | Date | null | undefined = new Date()
): TopupPromotionRuntimeStatus {
  if (promotion.deleted_at) return "EXPIRED";

  const status = String(promotion.status || "ACTIVE").trim().toUpperCase();
  if (status === "PAUSED") return "PAUSED";

  const referenceDate = referenceAt ? new Date(referenceAt) : new Date();
  const referenceTime = Number.isFinite(referenceDate.getTime()) ? referenceDate.getTime() : Date.now();
  const startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : null;
  const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;

  if (startsAt !== null && Number.isFinite(startsAt) && referenceTime < startsAt) return "SCHEDULED";
  if (endsAt !== null && Number.isFinite(endsAt) && referenceTime > endsAt) return "EXPIRED";

  if (normalizePromotionScheduleType(promotion.schedule_type) === "ONE_TIME") return "ACTIVE";

  const weekdays = normalizeWeekdays(promotion.weekdays);
  if (weekdays.length === 0) return "SCHEDULED";

  const bogota = getBogotaDateParts(new Date(referenceTime));
  if (!weekdays.includes(bogota.weekday)) return "SCHEDULED";

  const currentMinutes = bogota.hour * 60 + bogota.minute;
  const startMinutes = parseTimeToMinutes(promotion.daily_start_time, 0);
  const endMinutes = parseTimeToMinutes(promotion.daily_end_time, 23 * 60 + 59);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes ? "ACTIVE" : "SCHEDULED";
}

export function isPromotionActiveAt(
  promotion: TopupPromotionRow,
  referenceAt: string | Date | null | undefined = new Date()
) {
  return getPromotionRuntimeStatus(promotion, referenceAt) === "ACTIVE";
}

export function calculatePromotionBonus(promotion: TopupPromotionRow | null, amount: number | string | null | undefined) {
  if (!promotion) return 0;

  const baseAmount = Math.max(0, Math.round(toNumber(amount)));
  const bonusValue = Math.max(0, toNumber(promotion.bonus_value));
  const bonusType = normalizePromotionBonusType(promotion.bonus_type);

  if (baseAmount <= 0 || bonusValue <= 0) return 0;
  if (bonusType === "FIXED") return Math.round(bonusValue);

  return Math.round((baseAmount * bonusValue) / 100);
}

const PROMOTION_SELECT = [
  "id",
  "name",
  "status",
  "min_amount",
  "bonus_type",
  "bonus_value",
  "starts_at",
  "ends_at",
  "schedule_type",
  "weekdays",
  "daily_start_time",
  "daily_end_time",
  "schedule_timezone",
  "deleted_at",
  "created_at",
  "updated_at",
].join(", ");

export async function listActiveTopupPromotions({
  supabaseAdmin,
  referenceAt,
  maximumRows = 50,
}: {
  supabaseAdmin: SupabaseClient;
  referenceAt?: string | Date | null;
  maximumRows?: number;
}) {
  const referenceDate = referenceAt ? new Date(referenceAt) : new Date();
  const safeReferenceDate = Number.isFinite(referenceDate.getTime()) ? referenceDate : new Date();

  const { data, error } = await supabaseAdmin
    .from("wallet_topup_promotions")
    .select(PROMOTION_SELECT)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .order("min_amount", { ascending: true })
    .order("bonus_value", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.round(maximumRows))));

  if (error) throw new Error(`No se pudo validar la promoción de recarga: ${error.message}`);

  return (((data || []) as unknown) as TopupPromotionRow[]).filter((promotion) =>
    isPromotionActiveAt(promotion, safeReferenceDate)
  );
}

export async function findActiveTopupPromotion({
  supabaseAdmin,
  amount,
  referenceAt,
}: {
  supabaseAdmin: SupabaseClient;
  amount: number | string | null | undefined;
  referenceAt?: string | Date | null;
}): Promise<TopupPromotionCalculation> {
  const baseAmount = Math.max(0, Math.round(toNumber(amount)));

  if (baseAmount <= 0) {
    return { promotion: null, bonusAmount: 0, totalAmount: 0 };
  }

  const activePromotions = await listActiveTopupPromotions({
    supabaseAdmin,
    referenceAt,
    maximumRows: 50,
  });

  const promotion =
    activePromotions
      .filter((item) => toNumber(item.min_amount) <= baseAmount)
      .sort((left, right) => {
        const minimumDifference = toNumber(right.min_amount) - toNumber(left.min_amount);
        if (minimumDifference !== 0) return minimumDifference;

        const bonusDifference = toNumber(right.bonus_value) - toNumber(left.bonus_value);
        if (bonusDifference !== 0) return bonusDifference;

        return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
      })[0] || null;

  const bonusAmount = calculatePromotionBonus(promotion, baseAmount);

  return {
    promotion,
    bonusAmount,
    totalAmount: baseAmount + bonusAmount,
  };
}

export function buildPromotionTopupPatch(calculation: TopupPromotionCalculation, baseAmount: number | string | null | undefined) {
  const amount = Math.max(0, Math.round(toNumber(baseAmount)));

  if (!calculation.promotion || calculation.bonusAmount <= 0) {
    return {
      promotion_id: null,
      promotion_name: null,
      promotion_bonus_type: null,
      promotion_bonus_value: null,
      promotion_bonus_amount: 0,
      promotion_total_amount: amount,
    };
  }

  return {
    promotion_id: calculation.promotion.id,
    promotion_name: calculation.promotion.name,
    promotion_bonus_type: normalizePromotionBonusType(calculation.promotion.bonus_type),
    promotion_bonus_value: toNumber(calculation.promotion.bonus_value),
    promotion_bonus_amount: calculation.bonusAmount,
    promotion_total_amount: calculation.totalAmount,
  };
}
