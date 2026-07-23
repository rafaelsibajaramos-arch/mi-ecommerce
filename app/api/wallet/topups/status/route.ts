import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOPUP_STATUS_COLUMNS = [
  "id",
  "user_id",
  "reference",
  "amount",
  "amount_in_cents",
  "status",
  "provider",
  "payer_origin",
  "destination_account",
  "receipt_url",
  "matched_bank_reference",
  "error_message",
  "approved_at",
  "rejected_at",
  "credited_at",
].join(",");

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
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
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) return jsonError("No autorizado.", 401);

    const supabaseAuth = createSupabaseUserClientFromToken(token);
    const supabaseAdmin = createSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) return jsonError("Sesión inválida.", 401);

    const body = await request.json();
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!reference) return jsonError("Falta la referencia de recarga.");

    // Esta ruta solo consulta el estado. La aprobación automática se realiza una vez
    // al crear la recarga y posteriormente mediante el cron bancario.
    const { data: topup, error: topupError } = await supabaseAdmin
      .from("wallet_topups")
      .select(TOPUP_STATUS_COLUMNS)
      .eq("reference", reference)
      .eq("user_id", user.id)
      .maybeSingle();

    if (topupError) throw new Error(topupError.message);
    if (!topup) return jsonError("La recarga no existe o no te pertenece.", 404);

    return NextResponse.json(
      { ok: true, topup },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
