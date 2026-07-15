import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { listActiveTopupPromotions, type TopupPromotionRow } from "../../../../../lib/topupPromotions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizePromotion(row: TopupPromotionRow) {
  const bonusType = String(row.bonus_type || "PERCENTAGE").toUpperCase() === "FIXED" ? "FIXED" : "PERCENTAGE";

  return {
    id: String(row.id || ""),
    name: String(row.name || "Promoción de recarga"),
    minAmount: Math.max(0, Math.round(toNumber(row.min_amount))),
    bonusType,
    bonusValue: Math.max(0, toNumber(row.bonus_value)),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    scheduleType: String(row.schedule_type || "ONE_TIME").toUpperCase() === "WEEKLY" ? "WEEKLY" : "ONE_TIME",
    weekdays: Array.isArray(row.weekdays) ? row.weekdays : [],
    dailyStartTime: row.daily_start_time || null,
    dailyEndTime: row.daily_end_time || null,
    scheduleTimezone: row.schedule_timezone || "America/Bogota",
  };
}

export async function GET() {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const promotions = await listActiveTopupPromotions({
      supabaseAdmin,
      referenceAt: new Date(),
      maximumRows: 200,
    });

    return jsonNoStore({ ok: true, promotions: promotions.map(normalizePromotion) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar la promoción activa.";
    return jsonNoStore({ ok: false, error: message, promotions: [] }, 500);
  }
}
