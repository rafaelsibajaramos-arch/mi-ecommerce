import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type CallerProfile = {
  id: string;
  role: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function createSupabaseUserClientFromToken(token: string) {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) return jsonError("No autorizado.", 401);

    const body = await request.json().catch(() => null);
    const orderId = String(body?.orderId || "").trim();

    if (!orderId) {
      return jsonError("Debes seleccionar un pedido válido.");
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

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return jsonError("No se pudo validar el administrador.", 500);
    }

    if (
      !(callerProfile as CallerProfile | null) ||
      (callerProfile as CallerProfile).role !== "admin"
    ) {
      return jsonError("No tienes permisos para revertir pedidos.", 403);
    }

    const { data, error } = await supabaseAdmin.rpc("reverse_paid_order", {
      p_order_id: orderId,
      p_admin_id: user.id,
    });

    if (error) {
      const message = error.message || "No se pudo revertir el pedido.";
      const normalized = message.toLowerCase();
      const status = normalized.includes("ya fue revertido") || normalized.includes("ya tiene una reversión") ? 409 : 400;
      return jsonError(message, status);
    }

    const result = (data || {}) as {
      refund_amount?: number;
      released_licenses?: number;
    };

    return NextResponse.json({
      ok: true,
      refundAmount: Number(result.refund_amount || 0),
      releasedLicenses: Number(result.released_licenses || 0),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
