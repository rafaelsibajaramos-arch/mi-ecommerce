import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
};

type OrderRow = {
  id: string;
};

type AssignedLicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
};

type ProductStockRow = {
  id: string;
  stock: number | null;
};

type VariantStockRow = {
  id: string;
  stock: number | null;
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

function groupCountById(items: Array<string | null | undefined>) {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  return counts;
}

async function restoreLicenseStock(
  supabaseAdmin: SupabaseClient,
  assignedLicenses: AssignedLicenseRow[]
) {
  const productCounts = groupCountById(
    assignedLicenses
      .filter((license) => !license.variant_id)
      .map((license) => license.product_id)
  );

  const variantCounts = groupCountById(
    assignedLicenses
      .filter((license) => Boolean(license.variant_id))
      .map((license) => license.variant_id)
  );

  if (productCounts.size > 0) {
    const productIds = Array.from(productCounts.keys());

    const { data: productsData, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, stock")
      .in("id", productIds);

    if (productsError) {
      throw new Error(
        `No se pudo restaurar el stock de productos: ${productsError.message}`
      );
    }

    for (const product of (productsData as ProductStockRow[]) || []) {
      const increment = productCounts.get(product.id) || 0;
      const nextStock = Number(product.stock || 0) + increment;

      const { error: updateError } = await supabaseAdmin
        .from("products")
        .update({ stock: nextStock })
        .eq("id", product.id);

      if (updateError) {
        throw new Error(
          `No se pudo actualizar el stock del producto ${product.id}: ${updateError.message}`
        );
      }
    }
  }

  if (variantCounts.size > 0) {
    const variantIds = Array.from(variantCounts.keys());

    const { data: variantsData, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id, stock")
      .in("id", variantIds);

    if (variantsError) {
      throw new Error(
        `No se pudo restaurar el stock de variantes: ${variantsError.message}`
      );
    }

    for (const variant of (variantsData as VariantStockRow[]) || []) {
      const increment = variantCounts.get(variant.id) || 0;
      const nextStock = Number(variant.stock || 0) + increment;

      const { error: updateError } = await supabaseAdmin
        .from("product_variants")
        .update({ stock: nextStock })
        .eq("id", variant.id);

      if (updateError) {
        throw new Error(
          `No se pudo actualizar el stock de la variante ${variant.id}: ${updateError.message}`
        );
      }
    }
  }
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
      .select("id, email, full_name")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetProfileError) {
      return jsonError("No se pudo cargar el usuario a eliminar.", 500);
    }

    if (!targetProfile) {
      return jsonError("El usuario ya no existe o no tiene perfil.", 404);
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
        .select("id, product_id, variant_id")
        .eq("assigned_user_id", targetUserId)
        .eq("status", "assigned");

    if (assignedLicensesError) {
      return jsonError("No se pudieron cargar las licencias del usuario.", 500);
    }

    const assignedLicenses = (assignedLicensesData as AssignedLicenseRow[]) || [];

    if (assignedLicenses.length > 0) {
      await restoreLicenseStock(supabaseAdmin, assignedLicenses);

      const { error: releaseLicensesError } = await supabaseAdmin
        .from("product_licenses")
        .update({
          status: "available",
          assigned_order_id: null,
          assigned_order_item_id: null,
          assigned_user_id: null,
        })
        .eq("assigned_user_id", targetUserId);

      if (releaseLicensesError) {
        return jsonError(
          `No se pudieron liberar las licencias del usuario: ${releaseLicensesError.message}`,
          500
        );
      }
    }

    if (orderIds.length > 0) {
      const { error: deleteOrderItemsError } = await supabaseAdmin
        .from("order_items")
        .delete()
        .in("order_id", orderIds);

      if (deleteOrderItemsError) {
        return jsonError(
          `No se pudieron eliminar los productos de los pedidos: ${deleteOrderItemsError.message}`,
          500
        );
      }

      const { error: deleteOrdersError } = await supabaseAdmin
        .from("orders")
        .delete()
        .in("id", orderIds);

      if (deleteOrdersError) {
        return jsonError(
          `No se pudieron eliminar los pedidos: ${deleteOrdersError.message}`,
          500
        );
      }
    }

    const { error: deleteTransactionsError } = await supabaseAdmin
      .from("wallet_transactions")
      .delete()
      .eq("user_id", targetUserId);

    if (deleteTransactionsError) {
      return jsonError(
        `No se pudieron eliminar las recargas y movimientos: ${deleteTransactionsError.message}`,
        500
      );
    }

    const { error: deleteProfileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", targetUserId);

    if (deleteProfileError) {
      return jsonError(
        `No se pudo eliminar el perfil del usuario: ${deleteProfileError.message}`,
        500
      );
    }

    const { error: deleteAuthUserError } =
      await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (deleteAuthUserError) {
      return jsonError(
        `El perfil se eliminó, pero falló la eliminación en Auth: ${deleteAuthUserError.message}`,
        500
      );
    }

    const safeProfile = targetProfile as TargetProfile;

    return NextResponse.json({
      ok: true,
      message: "Usuario eliminado correctamente.",
      deletedUser: {
        id: safeProfile.id,
        email: safeProfile.email,
        full_name: safeProfile.full_name,
      },
      deletedCounts: {
        orders: orderIds.length,
        releasedLicenses: assignedLicenses.length,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}