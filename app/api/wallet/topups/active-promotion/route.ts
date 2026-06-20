import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizePromotion(row: AnyRow) {
  const bonusType = String(row.bonus_type || "PERCENTAGE").toUpperCase() === "FIXED" ? "FIXED" : "PERCENTAGE";

  return {
    id: String(row.id || ""),
    name: String(row.name || "Promoción de recarga"),
    minAmount: Math.max(0, Math.round(toNumber(row.min_amount))),
    bonusType,
    bonusValue: Math.max(0, toNumber(row.bonus_value)),
    startsAt: toText(row.starts_at),
    endsAt: toText(row.ends_at),
  };
}

export async function GET() {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Se consulta primero lo activo/programado por fecha de inicio y se filtra ends_at en JS.
    // Esto evita que PostgREST falle silenciosamente por la sintaxis del OR con timestamps.
    const { data, error } = await supabaseAdmin
      .from("wallet_topup_promotions")
      .select("id, name, min_amount, bonus_type, bonus_value, starts_at, ends_at, status, created_at")
      .eq("status", "ACTIVE")
      .lte("starts_at", nowIso)
      .order("min_amount", { ascending: true })
      .order("bonus_value", { ascending: false })
      .limit(20);

    if (error) {
      return jsonNoStore({ ok: false, error: error.message, promotions: [] }, 500);
    }

    const promotions = (((data || []) as unknown) as AnyRow[])
      .filter((promotion) => {
        const endsAt = toText(promotion.ends_at);
        if (!endsAt) return true;
        const endsTime = new Date(endsAt).getTime();
        return Number.isFinite(endsTime) && endsTime >= now;
      })
      .map(normalizePromotion);

    return jsonNoStore({ ok: true, promotions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar la promoción activa.";
    return jsonNoStore({ ok: false, error: message, promotions: [] }, 500);
  }
}
