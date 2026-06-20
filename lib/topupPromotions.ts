import type { SupabaseClient } from "@supabase/supabase-js";

export type TopupPromotionBonusType = "PERCENTAGE" | "FIXED";

export type TopupPromotionRow = {
  id: string;
  name: string;
  status: string | null;
  min_amount: number | string | null;
  bonus_type: TopupPromotionBonusType | string | null;
  bonus_value: number | string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TopupPromotionCalculation = {
  promotion: TopupPromotionRow | null;
  bonusAmount: number;
  totalAmount: number;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizePromotionBonusType(value: string | null | undefined): TopupPromotionBonusType {
  return String(value || "PERCENTAGE").trim().toUpperCase() === "FIXED" ? "FIXED" : "PERCENTAGE";
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
  const referenceDate = referenceAt ? new Date(referenceAt) : new Date();
  const referenceIso = Number.isFinite(referenceDate.getTime()) ? referenceDate.toISOString() : new Date().toISOString();

  if (baseAmount <= 0) {
    return { promotion: null, bonusAmount: 0, totalAmount: 0 };
  }

  const { data, error } = await supabaseAdmin
    .from("wallet_topup_promotions")
    .select("id, name, status, min_amount, bonus_type, bonus_value, starts_at, ends_at, created_at, updated_at")
    .eq("status", "ACTIVE")
    .lte("min_amount", baseAmount)
    .lte("starts_at", referenceIso)
    .or(`ends_at.is.null,ends_at.gte.${referenceIso}`)
    .order("min_amount", { ascending: false })
    .order("bonus_value", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`No se pudo validar la promoción de recarga: ${error.message}`);

  const promotion = ((data || [])[0] as TopupPromotionRow | undefined) || null;
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
