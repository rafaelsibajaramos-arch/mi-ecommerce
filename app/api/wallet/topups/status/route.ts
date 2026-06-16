import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { tryAutoApproveBankTopup } from "../../../../../lib/bankTopups";
import { getWalletTopupByReference } from "../../../../../lib/walletTopups";

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

    const body = await request.json();
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!reference) return jsonError("Falta la referencia de recarga.");

    let topup = await getWalletTopupByReference(supabaseAdmin, reference);
    if (!topup || topup.user_id !== user.id) {
      return jsonError("La recarga no existe o no te pertenece.", 404);
    }

    if (String(topup.status || "PENDING").toUpperCase() === "PENDING") {
      await tryAutoApproveBankTopup(supabaseAdmin, topup.id);
      topup = await getWalletTopupByReference(supabaseAdmin, reference);
    }

    return NextResponse.json({ ok: true, topup });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Ocurrió un error inesperado.", 500);
  }
}
