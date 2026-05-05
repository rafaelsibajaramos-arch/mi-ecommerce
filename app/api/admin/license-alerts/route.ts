import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type CallerProfile = {
  id: string;
  role: string | null;
};

type LicenseAlertRow = {
  id: string;
  license_id: string | null;
  access_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  user_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  task_type: string;
  due_at: string;
  status: string;
  priority: string;
  message: string | null;
  manual_license_text?: string | null;
  manual_product_note?: string | null;
  manual_note?: string | null;
  completed_at: string | null;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string | null;
};

type VariantRow = {
  id: string;
  name: string | null;
  access_duration_months: number | null;
};

type LicenseRow = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  license_text: string | null;
  billing_duration_days: number | null;
  billing_duration_months: number | null;
  billing_ends_at: string | null;
  rotation_status: string | null;
};

type AccessRow = {
  id: string;
  license_id: string;
  order_id: string | null;
  order_item_id: string | null;
  user_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  starts_at: string;
  expires_at: string;
  status: string;
};

type OrderRow = {
  id: string;
  order_number: number | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type ActiveAccessInfo = {
  access_id: string;
  user_id: string | null;
  customer_email: string;
  customer_full_name: string;
  order_number: number | null;
  product_name: string;
  variant_name: string | null;
  expires_at: string;
  license_id: string;
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

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function normalizeLicenseText(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function addDays(date: Date, days: number) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;

  return Math.floor(numberValue);
}

function parseNonNegativeInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;

  return Math.floor(numberValue);
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
    return { error: jsonError("No tienes permisos para gestionar alertas.", 403) };
  }

  return { supabaseAdmin, user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);

    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const filterParam = url.searchParams.get("filter") || "pending";
    const filter = ["pending", "due", "completed", "all"].includes(filterParam)
      ? filterParam
      : "pending";
    const page = parsePositiveInteger(url.searchParams.get("page"), 1);
    const requestedPageSize = parsePositiveInteger(url.searchParams.get("pageSize"), 10);
    const pageSize = Math.min(Math.max(requestedPageSize, 5), 50);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const nowIso = new Date().toISOString();

    let alertsQuery = auth.supabaseAdmin
      .from("license_alerts")
      .select(
        "id, license_id, access_id, order_id, order_item_id, user_id, product_id, variant_id, task_type, due_at, status, priority, message, manual_license_text, manual_product_note, manual_note, completed_at, created_at",
        { count: "exact" }
      );

    if (filter === "pending") {
      alertsQuery = alertsQuery.eq("status", "pending");
    } else if (filter === "due") {
      alertsQuery = alertsQuery.eq("status", "pending").lte("due_at", nowIso);
    } else if (filter === "completed") {
      alertsQuery = alertsQuery.eq("status", "completed");
    }

    const { data, error, count } = await alertsQuery
      .order("status", { ascending: false })
      .order("due_at", { ascending: true })
      .range(from, to);

    if (error) {
      return jsonError(`No se pudieron cargar las alertas: ${error.message}`, 500);
    }

    const [pendingCountResult, dueCountResult, completedCountResult] = await Promise.all([
      auth.supabaseAdmin
        .from("license_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      auth.supabaseAdmin
        .from("license_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("due_at", nowIso),
      auth.supabaseAdmin
        .from("license_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
    ]);

    const alerts = (data as LicenseAlertRow[]) || [];
    const productIds = uniqueIds(alerts.map((item) => item.product_id));
    const variantIds = uniqueIds(alerts.map((item) => item.variant_id));
    const licenseIds = uniqueIds(alerts.map((item) => item.license_id));
    const accessIds = uniqueIds(alerts.map((item) => item.access_id));
    const orderIds = uniqueIds(alerts.map((item) => item.order_id));
    const userIds = uniqueIds(alerts.map((item) => item.user_id));

    const [productsResult, variantsResult, licensesResult, accessesResult, ordersResult, profilesResult] =
      await Promise.all([
        productIds.length
          ? auth.supabaseAdmin
              .from("products")
              .select("id, name")
              .in("id", productIds)
          : Promise.resolve({ data: [] as ProductRow[], error: null }),
        variantIds.length
          ? auth.supabaseAdmin
              .from("product_variants")
              .select("id, name, access_duration_months")
              .in("id", variantIds)
          : Promise.resolve({ data: [] as VariantRow[], error: null }),
        licenseIds.length
          ? auth.supabaseAdmin
              .from("product_licenses")
              .select(
                "id, product_id, variant_id, license_text, billing_duration_days, billing_duration_months, billing_ends_at, rotation_status"
              )
              .in("id", licenseIds)
          : Promise.resolve({ data: [] as LicenseRow[], error: null }),
        accessIds.length
          ? auth.supabaseAdmin
              .from("license_accesses")
              .select("id, license_id, order_id, order_item_id, user_id, product_id, variant_id, starts_at, expires_at, status")
              .in("id", accessIds)
          : Promise.resolve({ data: [] as AccessRow[], error: null }),
        orderIds.length
          ? auth.supabaseAdmin
              .from("orders")
              .select("id, order_number")
              .in("id", orderIds)
          : Promise.resolve({ data: [] as OrderRow[], error: null }),
        userIds.length
          ? auth.supabaseAdmin
              .from("profiles")
              .select("id, email, full_name")
              .in("id", userIds)
          : Promise.resolve({ data: [] as ProfileRow[], error: null }),
      ]);

    const firstError = [
      productsResult.error,
      variantsResult.error,
      licensesResult.error,
      accessesResult.error,
      ordersResult.error,
      profilesResult.error,
    ].find(Boolean);

    if (firstError) {
      return jsonError(`No se pudo completar la informacion: ${firstError.message}`, 500);
    }

    const productsMap = new Map(
      ((productsResult.data as ProductRow[]) || []).map((item) => [item.id, item])
    );
    const variantsMap = new Map(
      ((variantsResult.data as VariantRow[]) || []).map((item) => [item.id, item])
    );
    const licensesMap = new Map(
      ((licensesResult.data as LicenseRow[]) || []).map((item) => [item.id, item])
    );
    const accessesMap = new Map(
      ((accessesResult.data as AccessRow[]) || []).map((item) => [item.id, item])
    );
    const ordersMap = new Map(
      ((ordersResult.data as OrderRow[]) || []).map((item) => [item.id, item])
    );
    const profilesMap = new Map(
      ((profilesResult.data as ProfileRow[]) || []).map((item) => [item.id, item])
    );

    const normalizedTextByAlertId = new Map<string, string>();
    const normalizedTexts = new Set<string>();

    for (const alert of alerts) {
      const licenseText = alert.license_id
        ? licensesMap.get(alert.license_id)?.license_text
        : alert.manual_license_text;
      const normalizedText = normalizeLicenseText(licenseText);

      if (normalizedText) {
        normalizedTextByAlertId.set(alert.id, normalizedText);
        normalizedTexts.add(normalizedText);
      }
    }

    const allSharedActiveAccesses = new Map<string, ActiveAccessInfo[]>();

    if (normalizedTexts.size > 0) {
      const allLicenseTexts = Array.from(normalizedTexts);
      const { data: matchingLicensesData, error: matchingLicensesError } = await auth.supabaseAdmin
        .from("product_licenses")
        .select("id, product_id, variant_id, license_text")
        .in("license_text", allLicenseTexts);

      if (!matchingLicensesError) {
        const matchingLicenses = (matchingLicensesData as LicenseRow[]) || [];
        const licenseIdsForShared = matchingLicenses.map((item) => item.id);
        const licenseById = new Map(matchingLicenses.map((item) => [item.id, item]));

        if (licenseIdsForShared.length > 0) {
          const { data: activeAccessesData } = await auth.supabaseAdmin
            .from("license_accesses")
            .select("id, license_id, order_id, user_id, product_id, variant_id, starts_at, expires_at, status")
            .in("license_id", licenseIdsForShared)
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString());

          const activeAccesses = (activeAccessesData as AccessRow[]) || [];
          const activeProductIds = uniqueIds(activeAccesses.map((item) => item.product_id));
          const activeVariantIds = uniqueIds(activeAccesses.map((item) => item.variant_id));
          const activeOrderIds = uniqueIds(activeAccesses.map((item) => item.order_id));
          const activeUserIds = uniqueIds(activeAccesses.map((item) => item.user_id));

          const [activeProductsResult, activeVariantsResult, activeOrdersResult, activeProfilesResult] =
            await Promise.all([
              activeProductIds.length
                ? auth.supabaseAdmin.from("products").select("id, name").in("id", activeProductIds)
                : Promise.resolve({ data: [] as ProductRow[], error: null }),
              activeVariantIds.length
                ? auth.supabaseAdmin.from("product_variants").select("id, name, access_duration_months").in("id", activeVariantIds)
                : Promise.resolve({ data: [] as VariantRow[], error: null }),
              activeOrderIds.length
                ? auth.supabaseAdmin.from("orders").select("id, order_number").in("id", activeOrderIds)
                : Promise.resolve({ data: [] as OrderRow[], error: null }),
              activeUserIds.length
                ? auth.supabaseAdmin.from("profiles").select("id, email, full_name").in("id", activeUserIds)
                : Promise.resolve({ data: [] as ProfileRow[], error: null }),
            ]);

          const activeProductsMap = new Map(((activeProductsResult.data as ProductRow[]) || []).map((item) => [item.id, item]));
          const activeVariantsMap = new Map(((activeVariantsResult.data as VariantRow[]) || []).map((item) => [item.id, item]));
          const activeOrdersMap = new Map(((activeOrdersResult.data as OrderRow[]) || []).map((item) => [item.id, item]));
          const activeProfilesMap = new Map(((activeProfilesResult.data as ProfileRow[]) || []).map((item) => [item.id, item]));

          for (const access of activeAccesses) {
            const license = licenseById.get(access.license_id);
            const normalizedText = normalizeLicenseText(license?.license_text);
            if (!normalizedText) continue;

            const product = access.product_id ? activeProductsMap.get(access.product_id) : null;
            const variant = access.variant_id ? activeVariantsMap.get(access.variant_id) : null;
            const order = access.order_id ? activeOrdersMap.get(access.order_id) : null;
            const profile = access.user_id ? activeProfilesMap.get(access.user_id) : null;

            if (!allSharedActiveAccesses.has(normalizedText)) {
              allSharedActiveAccesses.set(normalizedText, []);
            }

            allSharedActiveAccesses.get(normalizedText)!.push({
              access_id: access.id,
              user_id: access.user_id,
              customer_email: profile?.email || "Sin correo",
              customer_full_name: profile?.full_name || "Sin nombre",
              order_number: order?.order_number || null,
              product_name: product?.name || "Producto",
              variant_name: variant?.name || null,
              expires_at: access.expires_at,
              license_id: access.license_id,
            });
          }
        }
      }
    }

    const nowMs = Date.now();

    const enrichedAlerts = alerts.map((alert) => {
      const product = alert.product_id ? productsMap.get(alert.product_id) : null;
      const variant = alert.variant_id ? variantsMap.get(alert.variant_id) : null;
      const license = alert.license_id ? licensesMap.get(alert.license_id) : null;
      const access = alert.access_id ? accessesMap.get(alert.access_id) : null;
      const order = alert.order_id ? ordersMap.get(alert.order_id) : null;
      const profile = alert.user_id ? profilesMap.get(alert.user_id) : null;
      const dueMs = new Date(alert.due_at).getTime();
      const normalizedText = normalizedTextByAlertId.get(alert.id) || "";
      const activeAccessesForSameLicense = (allSharedActiveAccesses.get(normalizedText) || []).filter(
        (item) => item.access_id !== alert.access_id
      );

      return {
        ...alert,
        is_due: alert.status === "pending" && dueMs <= nowMs,
        product_name: product?.name || alert.manual_product_note || "Producto manual",
        variant_name: variant?.name || null,
        customer_email: profile?.email || "Sin correo",
        customer_full_name: profile?.full_name || "Sin nombre",
        order_number: order?.order_number || null,
        license_text: license?.license_text || alert.manual_license_text || "Licencia manual",
        billing_duration_days: license?.billing_duration_days || null,
        billing_duration_months: license?.billing_duration_months || null,
        billing_ends_at: license?.billing_ends_at || null,
        rotation_status: license?.rotation_status || null,
        access_starts_at: access?.starts_at || null,
        access_expires_at: access?.expires_at || alert.due_at,
        access_status: access?.status || null,
        access_duration_months: variant?.access_duration_months || null,
        active_accesses: activeAccessesForSameLicense,
      };
    });

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      ok: true,
      alerts: enrichedAlerts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
      stats: {
        pendingDueCount: dueCountResult.count || 0,
        pendingTotalCount: pendingCountResult.count || 0,
        completedCount: completedCountResult.count || 0,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);

    if (auth.error) return auth.error;

    const body = await request.json().catch(() => null);
    const licenseText = typeof body?.licenseText === "string" ? body.licenseText.trim() : "";
    const productNote = typeof body?.productNote === "string" ? body.productNote.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const daysUntilAlert = parseNonNegativeInteger(body?.daysUntilAlert, 0);
    const priority = body?.priority === "urgent" ? "urgent" : "normal";

    if (!licenseText) {
      return jsonError("Escribe los datos de la licencia entregada.");
    }

    if (!productNote) {
      return jsonError("Escribe una nota para identificar el producto o cliente.");
    }

    const dueAt = addDays(new Date(), daysUntilAlert).toISOString();
    const message = note || `Alerta manual para ${productNote}. Revisar/cambiar credenciales de la licencia indicada.`;

    const { data, error } = await auth.supabaseAdmin
      .from("license_alerts")
      .insert([
        {
          license_id: null,
          access_id: null,
          order_id: null,
          order_item_id: null,
          user_id: null,
          product_id: null,
          variant_id: null,
          task_type: "manual",
          due_at: dueAt,
          status: "pending",
          priority,
          message,
          manual_license_text: licenseText,
          manual_product_note: productNote,
          manual_note: note || null,
        },
      ])
      .select("id")
      .single();

    if (error || !data) {
      return jsonError(`No se pudo crear la alerta manual: ${error?.message || "error desconocido"}`, 500);
    }

    return NextResponse.json({ ok: true, alertId: data.id });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}


export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);

    if (auth.error) return auth.error;

    const url = new URL(request.url);
    let alertId = url.searchParams.get("alertId") || "";

    if (!alertId) {
      const body = await request.json().catch(() => null);
      alertId = typeof body?.alertId === "string" ? body.alertId : "";
    }

    if (!alertId) {
      return jsonError("Falta el ID de la alerta a borrar.");
    }

    const { data, error } = await auth.supabaseAdmin
      .from("license_alerts")
      .delete()
      .eq("id", alertId)
      .select("id")
      .maybeSingle();

    if (error) {
      return jsonError(`No se pudo borrar la alerta: ${error.message}`, 500);
    }

    if (!data) {
      return jsonError("La alerta no existe o ya fue borrada.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
