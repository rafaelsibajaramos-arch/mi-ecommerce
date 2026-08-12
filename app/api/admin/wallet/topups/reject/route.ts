import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return jsonError("No se pudo validar el administrador.", 500);
    if (!profile || String((profile as { role?: string | null }).role || "") !== "admin") {
      return jsonError("No tienes permisos de administrador.", 403);
    }

    const body = await request.json();
    const topupId = typeof body?.topupId === "string" ? body.topupId.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "Recarga rechazada por revisión manual";

    if (!topupId) return jsonError("Falta el id de la recarga.");

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("wallet_topups")
      .update({
        status: "REJECTED",
        rejected_at: now,
        error_message: reason,
        approved_by: user.id,
        admin_note: reason,
        updated_at: now,
      })
      .eq("id", topupId)
      .eq("status", "PENDING")
      .select("id, status, rejected_at, error_message, admin_note")
      .maybeSingle();

    if (error) return jsonError(error.message, 500);
    if (!data) return jsonError("La recarga no está pendiente o no existe.", 409);

    return NextResponse.json({ ok: true, topup: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Ocurrió un error inesperado.", 500);
  }
}
