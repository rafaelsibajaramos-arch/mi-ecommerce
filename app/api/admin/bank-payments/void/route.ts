import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

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

export async function POST(request: NextRequest) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = await request.json();
    const paymentId = typeof body?.paymentId === "string" ? body.paymentId.trim() : "";

    if (!paymentId) return jsonError("Falta el id del pago del banco.");

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("bank_payment_notifications")
      .select("id, is_used, matched_topup_id, raw_body")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError) return jsonError(paymentError.message, 500);
    if (!payment) return jsonError("No se encontró el pago del banco.", 404);

    const row = payment as { id: string; is_used?: boolean | null; matched_topup_id?: string | null; raw_body?: string | null };

    if (row.is_used && row.matched_topup_id) {
      return jsonError("Este pago ya está cruzado con una recarga. Anula primero la recarga automática.", 409);
    }

    const now = new Date().toISOString();
    const rawBody = `${row.raw_body || ""}\n\n[ADMIN_VOIDED ${now}] Pago invalidado por admin ${user.id}.`;

    const { data: updatedPayment, error: updateError } = await supabaseAdmin
      .from("bank_payment_notifications")
      .update({
        is_used: true,
        matched_topup_id: null,
        used_at: now,
        raw_body: rawBody.slice(0, 4000),
        updated_at: now,
      })
      .eq("id", row.id)
      .select("id, is_used, matched_topup_id, used_at, updated_at")
      .single();

    if (updateError) return jsonError(updateError.message, 500);

    return NextResponse.json({ ok: true, payment: updatedPayment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 500;
    return jsonError(message, status);
  }
}
