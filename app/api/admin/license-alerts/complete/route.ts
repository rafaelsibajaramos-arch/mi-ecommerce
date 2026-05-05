import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type CallerProfile = {
  id: string;
  role: string | null;
};

type LicenseAlertRow = {
  id: string;
  license_id: string | null;
  access_id: string | null;
  status: string;
};

type LicenseRow = {
  id: string;
  billing_ends_at: string | null;
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
    return { error: jsonError("No tienes permisos para completar alertas.", 403) };
  }

  return { supabaseAdmin, user };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);

    if (auth.error) return auth.error;

    const body = await request.json().catch(() => null);
    const alertId = typeof body?.alertId === "string" ? body.alertId : "";

    if (!alertId) {
      return jsonError("Falta el ID de la alerta.");
    }

    const { data: alertData, error: alertError } = await auth.supabaseAdmin
      .from("license_alerts")
      .select("id, license_id, access_id, status")
      .eq("id", alertId)
      .maybeSingle();

    if (alertError) {
      return jsonError(`No se pudo consultar la alerta: ${alertError.message}`, 500);
    }

    if (!alertData) {
      return jsonError("La alerta no existe.", 404);
    }

    const alert = alertData as LicenseAlertRow;
    const now = new Date().toISOString();

    if (alert.status !== "completed") {
      const { error: updateAlertError } = await auth.supabaseAdmin
        .from("license_alerts")
        .update({
          status: "completed",
          completed_at: now,
          completed_by: auth.user.id,
        })
        .eq("id", alert.id);

      if (updateAlertError) {
        return jsonError(
          `No se pudo marcar la alerta como realizada: ${updateAlertError.message}`,
          500
        );
      }
    }

    if (alert.access_id) {
      const { error: updateAccessError } = await auth.supabaseAdmin
        .from("license_accesses")
        .update({
          status: "expired",
          rotation_completed_at: now,
        })
        .eq("id", alert.access_id);

      if (updateAccessError) {
        return jsonError(
          `No se pudo cerrar el acceso vencido: ${updateAccessError.message}`,
          500
        );
      }
    }

    if (!alert.license_id) {
      return NextResponse.json({ ok: true });
    }

    const { count: activeSameLicenseAccesses, error: activeAccessError } = await auth.supabaseAdmin
      .from("license_accesses")
      .select("id", { count: "exact", head: true })
      .eq("license_id", alert.license_id)
      .eq("status", "active")
      .gt("expires_at", now);

    if (activeAccessError) {
      return jsonError(
        `No se pudo validar si la licencia tiene otros accesos activos: ${activeAccessError.message}`,
        500
      );
    }

    const { data: licenseData, error: licenseError } = await auth.supabaseAdmin
      .from("product_licenses")
      .select("id, billing_ends_at")
      .eq("id", alert.license_id)
      .maybeSingle();

    if (licenseError) {
      return jsonError(`No se pudo consultar la licencia: ${licenseError.message}`, 500);
    }

    const license = licenseData as LicenseRow | null;
    const providerExpired = Boolean(
      license?.billing_ends_at && new Date(license.billing_ends_at).getTime() <= Date.now()
    );

    const hasOtherAccessesOnThisRow = Number(activeSameLicenseAccesses || 0) > 0;

    const licenseUpdate = hasOtherAccessesOnThisRow
      ? {
          rotation_status: "normal",
          last_rotated_at: now,
        }
      : {
          status: providerExpired ? "disabled" : "available",
          assigned_order_id: null,
          assigned_order_item_id: null,
          assigned_user_id: null,
          rotation_status: "normal",
          last_rotated_at: now,
        };

    const { error: updateLicenseError } = await auth.supabaseAdmin
      .from("product_licenses")
      .update(licenseUpdate)
      .eq("id", alert.license_id);

    if (updateLicenseError) {
      return jsonError(
        `No se pudo actualizar la licencia: ${updateLicenseError.message}`,
        500
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
