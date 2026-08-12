import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { tryAutoApproveBankTopup } from "../../../../../lib/bankTopups";
import { getWalletTopupByReference } from "../../../../../lib/walletTopups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

let cachedSupabaseAuthClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAuthClient() {
  if (cachedSupabaseAuthClient) return cachedSupabaseAuthClient;

  cachedSupabaseAuthClient = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  return cachedSupabaseAuthClient;
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) return jsonError("No autorizado.", 401);

    const supabaseAuth = getSupabaseAuthClient();
    const supabaseAdmin = createSupabaseAdmin();

    // getClaims verifica el JWT localmente cuando Supabase usa claves
    // asimétricas y conserva el JWKS en memoria entre invocaciones calientes.
    // Si el proyecto usa firma simétrica, Supabase cae de forma segura a getUser.
    const { data: claimsData, error: authError } =
      await supabaseAuth.auth.getClaims(token);
    const userId = String(claimsData?.claims?.sub || "").trim();

    if (authError || !userId) return jsonError("Sesión inválida.", 401);

    const body = await request.json();
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!reference) return jsonError("Falta la referencia de recarga.");

    let topup = await getWalletTopupByReference(supabaseAdmin, reference);

    if (!topup || topup.user_id !== userId) {
      return jsonError("La recarga no existe o no te pertenece.", 404);
    }

    if (String(topup.status || "PENDING").toUpperCase() === "PENDING") {
      topup = await tryAutoApproveBankTopup(supabaseAdmin, topup.id, topup);
    }

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
