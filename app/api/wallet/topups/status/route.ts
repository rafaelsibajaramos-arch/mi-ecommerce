import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { creditWalletTopup, getWalletTopupByReference, upsertTopupTransactionState } from "../../../../../lib/walletTopups";
import { fetchWompiTransactionById } from "../../../../../lib/wompi";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value.trim();
}

function createSupabaseUserClientFromToken(token: string) {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return jsonError("No autorizado.", 401);
    }

    const supabaseAuth = createSupabaseUserClientFromToken(token);
    const supabaseAdmin = createSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return jsonError("Sesión inválida.", 401);
    }

    const body = await request.json();
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    const transactionId =
      typeof body?.transactionId === "string" ? body.transactionId.trim() : "";

    if (!reference) {
      return jsonError("Falta la referencia de recarga.");
    }

    let topup = await getWalletTopupByReference(supabaseAdmin, reference);

    if (!topup || topup.user_id !== user.id) {
      return jsonError("La recarga no existe o no te pertenece.", 404);
    }

    if (transactionId) {
      const wompiTransaction = await fetchWompiTransactionById(transactionId);

      if (wompiTransaction.reference !== reference) {
        return jsonError("La transacción no coincide con la referencia de recarga.", 400);
      }

      topup = await upsertTopupTransactionState({
        supabaseAdmin,
        topup,
        transaction: wompiTransaction,
      });

      if (String(wompiTransaction.status).toUpperCase() === "APPROVED") {
        await creditWalletTopup(supabaseAdmin, topup.id);
        topup = await getWalletTopupByReference(supabaseAdmin, reference);
      }
    }

    return NextResponse.json({
      ok: true,
      topup,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}