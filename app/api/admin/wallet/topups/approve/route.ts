import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../../lib/supabaseAdmin";
import { approveTopupWithBankPayment } from "../../../../../../lib/bankTopups";

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
    const topupId = typeof body?.topupId === "string" ? body.topupId.trim() : "";
    const bankPaymentId = typeof body?.bankPaymentId === "string" ? body.bankPaymentId.trim() : null;
    const note = typeof body?.note === "string" ? body.note.trim() : null;

    if (!topupId) return jsonError("Falta el id de la recarga.");

    const topup = await approveTopupWithBankPayment({
      supabaseAdmin,
      topupId,
      bankPaymentId,
      approvedBy: user.id,
      manualNote: note || "Aprobación manual desde admin",
    });

    return NextResponse.json({ ok: true, topup });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 500;
    return jsonError(message, status);
  }
}
