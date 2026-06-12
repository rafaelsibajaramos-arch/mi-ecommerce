import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  buildBankTopupReference,
  normalizePaymentOrigin,
  tryAutoApproveBankTopup,
} from "../../../../../lib/bankTopups";
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
    const amount = Math.round(Number(body?.amount || 0));
    const payerOrigin = typeof body?.payerOrigin === "string" ? body.payerOrigin.trim() : "";
    const destinationAccount =
      typeof body?.destinationAccount === "string" ? body.destinationAccount.trim() : "";
    const receiptUrl = typeof body?.receiptUrl === "string" ? body.receiptUrl.trim() : "";

    if (!Number.isFinite(amount) || amount < 1000) {
      return jsonError("El monto mínimo de recarga es $ 1.000 COP.");
    }

    const normalizedOrigin = normalizePaymentOrigin(payerOrigin);
    if (!normalizedOrigin || normalizedOrigin.length < 6) {
      return jsonError("Ingresa la llave, celular o cuenta origen desde donde pagaste por Bre-B / Llaves.");
    }

    if (!receiptUrl) {
      return jsonError("Sube la foto del comprobante para dejar respaldo de la recarga.");
    }

    const reference = buildBankTopupReference(user.id);
    const now = new Date().toISOString();

    const { data: insertedTopup, error: insertError } = await supabaseAdmin
      .from("wallet_topups")
      .insert({
        user_id: user.id,
        reference,
        amount,
        amount_in_cents: amount * 100,
        currency: "COP",
        provider: "BREB_LLAVES",
        status: "PENDING",
        wompi_status: null,
        payer_origin: payerOrigin,
        normalized_payer_origin: normalizedOrigin,
        destination_account: destinationAccount || null,
        receipt_url: receiptUrl,
        error_message: null,
        created_at: now,
        updated_at: now,
      })
      .select("id, reference")
      .single();

    if (insertError || !insertedTopup) {
      return jsonError(`No se pudo crear la recarga: ${insertError?.message || "error desconocido"}`, 500);
    }

    await tryAutoApproveBankTopup(supabaseAdmin, String(insertedTopup.id));
    const topup = await getWalletTopupByReference(supabaseAdmin, reference);

    return NextResponse.json({
      ok: true,
      reference,
      topup,
      matched: String(topup?.status || "").toUpperCase() === "APPROVED",
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Ocurrió un error inesperado.", 500);
  }
}
