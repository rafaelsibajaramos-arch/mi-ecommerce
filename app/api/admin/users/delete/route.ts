import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type CallerProfile = {
  id: string;
  role: string | null;
};

type TargetProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  deleted_at?: string | null;
};

type OrderRow = {
  id: string;
};

type AssignedLicenseRow = {
  id: string;
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

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfileError) {
      return jsonError("No se pudo validar el perfil del administrador.", 500);
    }

    if (
      !(callerProfile as CallerProfile | null) ||
      (callerProfile as CallerProfile).role !== "admin"
    ) {
      return jsonError("No tienes permisos para eliminar usuarios.", 403);
    }

    const body = await request.json();
    const targetUserId =
      typeof body?.userId === "string" ? body.userId.trim() : "";

    if (!targetUserId) {
      return jsonError("Falta el id del usuario.");
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, deleted_at")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetProfileError) {
      return jsonError("No se pudo cargar el usuario a eliminar.", 500);
    }

    if (!targetProfile) {
      return jsonError("El usuario ya no existe o no tiene perfil.", 404);
    }

    const safeProfile = targetProfile as TargetProfile;

    if (safeProfile.deleted_at) {
      return jsonError("Este usuario ya estaba eliminado.", 409);
    }

    const { data: ordersData, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("user_id", targetUserId);

    if (ordersError) {
      return jsonError("No se pudieron cargar los pedidos del usuario.", 500);
    }

    const orderIds = ((ordersData as OrderRow[]) || []).map((order) => order.id);

    const { data: assignedLicensesData, error: assignedLicensesError } =
      await supabaseAdmin
        .from("product_licenses")
        .select("id")
        .eq("assigned_user_id", targetUserId)
        .eq("status", "assigned");

    if (assignedLicensesError) {
      return jsonError("No se pudieron cargar las licencias del usuario.", 500);
    }

    const assignedLicenses = (assignedLicensesData as AssignedLicenseRow[]) || [];

    const now = new Date().toISOString();

    if (assignedLicenses.length > 0) {
      // Las licencias entregadas quedan desactivadas para que no vuelvan a stock,
      // pero conservan assigned_order_id y assigned_order_item_id para que el
      // historial de compras siga mostrando qué licencia recibió el cliente.
      const { error: disableLicensesError } = await supabaseAdmin
        .from("product_licenses")
        .update({
          status: "disabled",
        })
        .eq("assigned_user_id", targetUserId)
        .eq("status", "assigned");

      if (disableLicensesError) {
        return jsonError(
          `No se pudieron desactivar las licencias del usuario: ${disableLicensesError.message}`,
          500
        );
      }
    }

    const { error: expireAccessesError } = await supabaseAdmin
      .from("license_accesses")
      .update({
        status: "expired",
        rotation_completed_at: now,
      })
      .eq("user_id", targetUserId)
      .eq("status", "active");

    if (expireAccessesError) {
      return jsonError(
        `No se pudieron cerrar los accesos activos del usuario: ${expireAccessesError.message}`,
        500
      );
    }

    // No borramos orders, order_items ni wallet_transactions: son historial de
    // compras/recargas y deben quedar visibles en el panel administrativo.
    const { error: markProfileDeletedError } = await supabaseAdmin
      .from("profiles")
      .update({
        deleted_at: now,
        deleted_by: user.id,
      })
      .eq("id", targetUserId);

    if (markProfileDeletedError) {
      return jsonError(
        `No se pudo marcar el perfil como eliminado: ${markProfileDeletedError.message}`,
        500
      );
    }

    const { error: softDeleteAuthUserError } =
      await supabaseAdmin.auth.admin.deleteUser(targetUserId, true);

    if (softDeleteAuthUserError) {
      return jsonError(
        `El historial se conservó, pero falló la baja del usuario en Auth: ${softDeleteAuthUserError.message}`,
        500
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Usuario eliminado correctamente. El historial de compras se conservó.",
      deletedUser: {
        id: safeProfile.id,
        email: safeProfile.email,
        full_name: safeProfile.full_name,
      },
      preservedCounts: {
        orders: orderIds.length,
      },
      disabledCounts: {
        licenses: assignedLicenses.length,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}