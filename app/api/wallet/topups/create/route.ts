import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  buildWompiIntegritySignature,
  getWompiCheckoutBaseUrl,
  getWompiPublicKey,
} from "../../../../../lib/wompi";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

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

function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const proto = forwardedProto || (host?.includes("localhost") ? "http" : "https");

  if (!host) {
    throw new Error("No se pudo determinar el dominio de la aplicación.");
  }

  return `${proto}://${host}`;
}

function generateTopupReference(userId: string) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TOPUP-${userId.slice(0, 8).toUpperCase()}-${Date.now()}-${random}`;
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
    const amount = Number(body?.amount || 0);

    if (!Number.isFinite(amount) || amount < 1000) {
      return jsonError("El monto mínimo de recarga es $ 1.000 COP.");
    }

    const normalizedAmount = Math.round(amount);
    const amountInCents = normalizedAmount * 100;
    const currency = "COP";
    const reference = generateTopupReference(user.id);

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return jsonError("No se pudo cargar el perfil del usuario.", 500);
    }

    const profile = (profileData as ProfileRow | null) || {
      id: user.id,
      email: user.email || null,
      full_name:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null,
    };

    const redirectUrl = `${getRequestOrigin(
      request
    )}/account/wallet/topup-result?reference=${encodeURIComponent(reference)}`;

    const signature = buildWompiIntegritySignature({
      reference,
      amountInCents,
      currency,
    });

    const checkoutParams = new URLSearchParams({
      "public-key": getWompiPublicKey(),
      currency,
      "amount-in-cents": String(amountInCents),
      reference,
      "signature:integrity": signature,
      "redirect-url": redirectUrl,
      "customer-data:email": profile.email || user.email || "",
      "customer-data:full-name": profile.full_name || "Usuario StreamingMayor",
    });

    const checkoutUrl = `${getWompiCheckoutBaseUrl()}?${checkoutParams.toString()}`;

    const { error: insertError } = await supabaseAdmin.from("wallet_topups").insert({
      user_id: user.id,
      reference,
      amount: normalizedAmount,
      amount_in_cents: amountInCents,
      currency,
      provider: "WOMPI",
      status: "PENDING",
      wompi_status: "PENDING",
      redirect_url: redirectUrl,
      checkout_url: checkoutUrl,
    });

    if (insertError) {
      return jsonError(
        `No se pudo crear la recarga pendiente: ${insertError.message}`,
        500
      );
    }

    return NextResponse.json({
      ok: true,
      reference,
      amount: normalizedAmount,
      amount_in_cents: amountInCents,
      currency,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
