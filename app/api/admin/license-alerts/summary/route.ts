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

async function requireAdmin(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return { error: jsonError("No autorizado.", 401) };
  }

  const supabaseAuth = createSupabaseUserClientFromToken(token);
  const supabaseAdmin = createSupabaseAdmin();

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return { error: jsonError("Sesión inválida.", 401) };
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (callerProfileError) {
    return {
      error: jsonError("No se pudo validar el perfil del administrador.", 500),
    };
  }

  if (
    !(callerProfile as CallerProfile | null) ||
    (callerProfile as CallerProfile).role !== "admin"
  ) {
    return { error: jsonError("No tienes permisos para ver alertas.", 403) };
  }

  return { supabaseAdmin, user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);

    if (auth.error) return auth.error;

    const now = new Date().toISOString();

    const [pendingDueResult, pendingTotalResult] = await Promise.all([
      auth.supabaseAdmin
        .from("license_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("due_at", now),
      auth.supabaseAdmin
        .from("license_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    if (pendingDueResult.error) {
      return jsonError(
        `No se pudo contar alertas vencidas: ${pendingDueResult.error.message}`,
        500
      );
    }

    if (pendingTotalResult.error) {
      return jsonError(
        `No se pudo contar alertas pendientes: ${pendingTotalResult.error.message}`,
        500
      );
    }

    return NextResponse.json({
      ok: true,
      pendingDueCount: pendingDueResult.count || 0,
      pendingTotalCount: pendingTotalResult.count || 0,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
