import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
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
  requires_rotation_alert?: boolean | null;
};

type AssignedLicenseRow = LicenseRow & {
  status?: string | null;
  requires_rotation_alert?: boolean | null;
  assigned_order_id?: string | null;
  assigned_order_item_id?: string | null;
  assigned_user_id?: string | null;
};

type BackfillOrderRow = OrderRow & {
  created_at: string | null;
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

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function normalizeLicenseText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[\t ]+/g, " "))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function getRotationAlertReasonText(
  reason: "billing_shorter_than_license" | "shared_different_duration"
) {
  return reason === "shared_different_duration"
    ? "Misma licencia vendida con duraciones diferentes."
    : "El cliente compro menos tiempo que la facturacion real de la licencia.";
}

function addDays(date: Date, days: number) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();

  result.setMonth(result.getMonth() + months);

  if (result.getDate() !== originalDay) {
    result.setDate(0);
  }

  return result;
}

function resolveExplicitBillingDurationDays(license: Pick<LicenseRow, "billing_duration_days" | "billing_duration_months">) {
  const days = Number(license.billing_duration_days || 0);

  if (Number.isFinite(days) && days > 0) return Math.floor(days);

  const months = Number(license.billing_duration_months || 0);

  if (Number.isFinite(months) && months > 0) return Math.floor(months * 30);

  return null;
}

function resolveBillingRemainingDays(value: string | null | undefined) {
  if (!value) return null;

  const diffMs = new Date(value).getTime() - Date.now();

  if (!Number.isFinite(diffMs)) return null;

  return Math.ceil(diffMs / 86400000);
}

function resolveAccessDurationDaysFromMonths(accessDurationMonths: number) {
  if (!Number.isFinite(accessDurationMonths) || accessDurationMonths <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(accessDurationMonths * 30));
}

function resolveAccessDurationDays(access: Pick<AccessRow, "starts_at" | "expires_at">) {
  const startsMs = new Date(access.starts_at).getTime();
  const expiresMs = new Date(access.expires_at).getTime();
  const diffMs = expiresMs - startsMs;

  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;

  return Math.ceil(diffMs / 86400000);
}

function resolveAccessDurationMonths({
  product,
  variant,
}: {
  product: ProductRow & { access_duration_months?: number | null };
  variant: VariantRow | null;
}) {
  return Number(variant?.access_duration_months || product.access_duration_months || 0);
}

function canTrackLicenseAccess({
  product,
  variant,
  license,
}: {
  product: ProductRow & { enable_license_alerts?: boolean; access_duration_months?: number | null };
  variant: VariantRow | null;
  license: LicenseRow | AssignedLicenseRow;
}) {
  if (!product.enable_license_alerts) return false;
  if (license.requires_rotation_alert === false) return false;

  const accessDurationMonths = resolveAccessDurationMonths({ product, variant });

  return Number.isFinite(accessDurationMonths) && accessDurationMonths > 0;
}

function shouldCreateBillingRotationAlert({
  product,
  variant,
  license,
}: {
  product: ProductRow & { enable_license_alerts?: boolean; access_duration_months?: number | null };
  variant: VariantRow | null;
  license: LicenseRow | AssignedLicenseRow;
}) {
  if (!canTrackLicenseAccess({ product, variant, license })) return false;

  const billingDurationDays = resolveExplicitBillingDurationDays(license);

  if (!billingDurationDays) return false;

  const soldDurationDays = resolveAccessDurationDaysFromMonths(
    resolveAccessDurationMonths({ product, variant })
  );

  return soldDurationDays > 0 && soldDurationDays < billingDurationDays;
}

function buildRotationAlertMessage({
  license,
  productLabel,
  customerEmail,
  reason,
}: {
  license: LicenseRow;
  productLabel: string;
  customerEmail: string | null | undefined;
  reason: "billing_shorter_than_license" | "shared_different_duration";
}) {
  const billingDurationDays = resolveExplicitBillingDurationDays(license);
  const billingRemainingDays = resolveBillingRemainingDays(license.billing_ends_at);
  const billingText = billingDurationDays
    ? `Licencia facturada por ${billingDurationDays} dia(s). Dias restantes para ti: ${billingRemainingDays ?? "Sin fecha"}.`
    : "Sin facturacion configurada en la licencia.";
  const reasonText = getRotationAlertReasonText(reason);

  return `Quitar/cambiar acceso de ${productLabel}. ${reasonText} ${billingText} Cliente: ${customerEmail || "Sin correo"}.`;
}

async function createRotationAlertIfMissing({
  supabaseAdmin,
  license,
  access,
  productLabel,
  customerEmail,
  reason,
}: {
  supabaseAdmin: SupabaseClient;
  license: LicenseRow;
  access: AccessRow;
  productLabel: string;
  customerEmail: string | null | undefined;
  reason: "billing_shorter_than_license" | "shared_different_duration";
}) {
  const { data: existingAlert, error: existingAlertError } = await supabaseAdmin
    .from("license_alerts")
    .select("id")
    .eq("access_id", access.id)
    .ilike("message", `%${getRotationAlertReasonText(reason)}%`)
    .limit(1)
    .maybeSingle();

  if (existingAlertError) {
    throw new Error(existingAlertError.message);
  }

  if (existingAlert?.id) return null;

  const { data: createdAlert, error: createAlertError } = await supabaseAdmin
    .from("license_alerts")
    .insert([
      {
        license_id: license.id,
        access_id: access.id,
        order_id: access.order_id,
        order_item_id: access.order_item_id,
        user_id: access.user_id,
        product_id: access.product_id,
        variant_id: access.variant_id,
        task_type: "rotate_password",
        due_at: access.expires_at,
        status: "pending",
        priority: "normal",
        message: buildRotationAlertMessage({
          license,
          productLabel,
          customerEmail,
          reason,
        }),
      },
    ])
    .select("id")
    .single();

  if (createAlertError || !createdAlert) {
    throw new Error(createAlertError?.message || "No se pudo crear la alerta automatica.");
  }

  return createdAlert.id as string;
}

async function ensureSharedDurationAlertsForLicenseText({
  supabaseAdmin,
  productId,
  licenseText,
}: {
  supabaseAdmin: SupabaseClient;
  productId: string;
  licenseText: string;
}) {
  const normalizedLicenseText = normalizeLicenseText(licenseText);
  if (!normalizedLicenseText) return;

  const { data: matchingLicensesData, error: matchingLicensesError } = await supabaseAdmin
    .from("product_licenses")
    .select("id, product_id, variant_id, license_text, billing_duration_days, billing_duration_months, billing_ends_at, rotation_status, requires_rotation_alert")
    .eq("product_id", productId);

  if (matchingLicensesError) {
    throw new Error(`No se pudieron revisar licencias compartidas: ${matchingLicensesError.message}`);
  }

  const matchingLicenses = ((matchingLicensesData as LicenseRow[]) || []).filter(
    (item) => normalizeLicenseText(item.license_text) === normalizedLicenseText
  );
  const licenseIds = uniqueIds(matchingLicenses.map((item) => item.id));
  if (licenseIds.length < 2) return;

  const { data: activeAccessesData, error: activeAccessesError } = await supabaseAdmin
    .from("license_accesses")
    .select("id, license_id, order_id, order_item_id, user_id, product_id, variant_id, starts_at, expires_at, status")
    .in("license_id", licenseIds)
    .eq("status", "active");

  if (activeAccessesError) {
    throw new Error(`No se pudieron revisar accesos compartidos: ${activeAccessesError.message}`);
  }

  const activeAccesses = ((activeAccessesData as AccessRow[]) || []).filter((access) => {
    const durationDays = resolveAccessDurationDays(access);
    const expiresMs = new Date(access.expires_at).getTime();
    return durationDays > 0 && Number.isFinite(expiresMs);
  });

  const durationSet = new Set(activeAccesses.map(resolveAccessDurationDays));
  if (activeAccesses.length < 2 || durationSet.size < 2) return;

  const maxExpiresMs = Math.max(...activeAccesses.map((access) => new Date(access.expires_at).getTime()));
  const targetAccesses = activeAccesses.filter((access) => new Date(access.expires_at).getTime() < maxExpiresMs);
  if (targetAccesses.length === 0) return;

  const targetAccessIds = targetAccesses.map((item) => item.id);
  const { data: existingAlertsData, error: existingAlertsError } = await supabaseAdmin
    .from("license_alerts")
    .select("id, access_id")
    .in("access_id", targetAccessIds)
    .ilike("message", `%${getRotationAlertReasonText("shared_different_duration")}%`);

  if (existingAlertsError) {
    throw new Error(`No se pudieron revisar alertas compartidas existentes: ${existingAlertsError.message}`);
  }

  const existingAlertAccessIds = new Set(
    ((existingAlertsData as { access_id: string | null }[]) || [])
      .map((item) => item.access_id)
      .filter(Boolean) as string[]
  );

  const productIds = uniqueIds(targetAccesses.map((item) => item.product_id));
  const variantIds = uniqueIds(targetAccesses.map((item) => item.variant_id));
  const userIds = uniqueIds(targetAccesses.map((item) => item.user_id));

  const [productsResult, variantsResult, profilesResult] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as ProductRow[], error: null }),
    variantIds.length
      ? supabaseAdmin.from("product_variants").select("id, name, access_duration_months").in("id", variantIds)
      : Promise.resolve({ data: [] as VariantRow[], error: null }),
    userIds.length
      ? supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);

  const firstLookupError = [productsResult.error, variantsResult.error, profilesResult.error].find(Boolean);
  if (firstLookupError) {
    throw new Error(`No se pudieron preparar datos de alerta compartida: ${firstLookupError.message}`);
  }

  const productsMap = new Map(((productsResult.data as ProductRow[]) || []).map((item) => [item.id, item]));
  const variantsMap = new Map(((variantsResult.data as VariantRow[]) || []).map((item) => [item.id, item]));
  const profilesMap = new Map(((profilesResult.data as ProfileRow[]) || []).map((item) => [item.id, item]));
  const licensesMap = new Map(matchingLicenses.map((item) => [item.id, item]));

  for (const access of targetAccesses) {
    if (existingAlertAccessIds.has(access.id)) continue;

    const license = licensesMap.get(access.license_id);
    if (!license || license.requires_rotation_alert === false) continue;

    const product = access.product_id ? productsMap.get(access.product_id) : null;
    const variant = access.variant_id ? variantsMap.get(access.variant_id) : null;
    const profile = access.user_id ? profilesMap.get(access.user_id) : null;
    const productLabel = variant?.name
      ? `${product?.name || "Producto"} - ${variant.name}`
      : product?.name || "Producto";

    await createRotationAlertIfMissing({
      supabaseAdmin,
      license,
      access,
      productLabel,
      customerEmail: profile?.email,
      reason: "shared_different_duration",
    });
  }
}

async function cleanupInvalidAutomaticAlerts(supabaseAdmin: SupabaseClient) {
  const { data: alertsData, error: alertsError } = await supabaseAdmin
    .from("license_alerts")
    .select("id, license_id, access_id, task_type, status")
    .eq("task_type", "rotate_password")
    .eq("status", "pending")
    .not("license_id", "is", null)
    .not("access_id", "is", null)
    .limit(100);

  if (alertsError) {
    throw new Error(`No se pudieron limpiar alertas automaticas: ${alertsError.message}`);
  }

  const alerts = (alertsData as Pick<LicenseAlertRow, "id" | "license_id" | "access_id" | "task_type" | "status">[]) || [];
  if (alerts.length === 0) return;

  const licenseIds = uniqueIds(alerts.map((item) => item.license_id));
  const accessIds = uniqueIds(alerts.map((item) => item.access_id));

  const [licensesResult, accessesResult] = await Promise.all([
    supabaseAdmin
      .from("product_licenses")
      .select("id, product_id, variant_id, license_text, billing_duration_days, billing_duration_months, billing_ends_at, rotation_status, requires_rotation_alert")
      .in("id", licenseIds),
    supabaseAdmin
      .from("license_accesses")
      .select("id, license_id, order_id, order_item_id, user_id, product_id, variant_id, starts_at, expires_at, status")
      .in("id", accessIds),
  ]);

  const firstError = [licensesResult.error, accessesResult.error].find(Boolean);
  if (firstError) {
    throw new Error(`No se pudieron validar alertas automaticas: ${firstError.message}`);
  }

  const licenses = (licensesResult.data as LicenseRow[]) || [];
  const accesses = (accessesResult.data as AccessRow[]) || [];
  const productIds = uniqueIds(licenses.map((item) => item.product_id));
  const variantIds = uniqueIds(licenses.map((item) => item.variant_id));

  const [productsResult, variantsResult] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("products").select("id, name, enable_license_alerts, access_duration_months").in("id", productIds)
      : Promise.resolve({ data: [] as Array<ProductRow & { enable_license_alerts?: boolean; access_duration_months?: number | null }>, error: null }),
    variantIds.length
      ? supabaseAdmin.from("product_variants").select("id, name, access_duration_months").in("id", variantIds)
      : Promise.resolve({ data: [] as VariantRow[], error: null }),
  ]);

  const secondError = [productsResult.error, variantsResult.error].find(Boolean);
  if (secondError) {
    throw new Error(`No se pudieron validar productos de alertas: ${secondError.message}`);
  }

  const productsMap = new Map(
    ((productsResult.data as Array<ProductRow & { enable_license_alerts?: boolean; access_duration_months?: number | null }>) || []).map((item) => [item.id, item])
  );
  const variantsMap = new Map(((variantsResult.data as VariantRow[]) || []).map((item) => [item.id, item]));
  const licensesMap = new Map(licenses.map((item) => [item.id, item]));
  const accessesMap = new Map(accesses.map((item) => [item.id, item]));

  const rawLicenseTexts = uniqueIds(licenses.map((item) => item.license_text));
  const sharedAccessesByKey = new Map<string, AccessRow[]>();

  if (rawLicenseTexts.length > 0) {
    const { data: matchingLicensesData } = await supabaseAdmin
      .from("product_licenses")
      .select("id, product_id, license_text")
      .in("license_text", rawLicenseTexts);

    const matchingLicenses = (matchingLicensesData as Pick<LicenseRow, "id" | "product_id" | "license_text">[]) || [];
    const matchingLicenseIds = uniqueIds(matchingLicenses.map((item) => item.id));
    const matchingLicenseById = new Map(matchingLicenses.map((item) => [item.id, item]));

    if (matchingLicenseIds.length > 0) {
      const { data: sharedAccessesData } = await supabaseAdmin
        .from("license_accesses")
        .select("id, license_id, order_id, order_item_id, user_id, product_id, variant_id, starts_at, expires_at, status")
        .in("license_id", matchingLicenseIds)
        .eq("status", "active");

      for (const access of ((sharedAccessesData as AccessRow[]) || [])) {
        const license = matchingLicenseById.get(access.license_id);
        const key = `${license?.product_id || access.product_id || ""}::${normalizeLicenseText(license?.license_text)}`;
        if (!key.endsWith("::")) {
          if (!sharedAccessesByKey.has(key)) sharedAccessesByKey.set(key, []);
          sharedAccessesByKey.get(key)!.push(access);
        }
      }
    }
  }

  const invalidAlertIds: string[] = [];

  for (const alert of alerts) {
    const license = alert.license_id ? licensesMap.get(alert.license_id) : null;
    const access = alert.access_id ? accessesMap.get(alert.access_id) : null;

    if (!license || !access || license.requires_rotation_alert === false) {
      invalidAlertIds.push(alert.id);
      continue;
    }

    const product = license.product_id ? productsMap.get(license.product_id) : null;
    const variant = license.variant_id ? variantsMap.get(license.variant_id) ?? null : null;
    const billingValid = product
      ? shouldCreateBillingRotationAlert({ product, variant, license })
      : false;
    const sharedKey = `${license.product_id || access.product_id || ""}::${normalizeLicenseText(license.license_text)}`;
    const sharedAccesses = (sharedAccessesByKey.get(sharedKey) || []).filter((item) => {
      const durationDays = resolveAccessDurationDays(item);
      const expiresMs = new Date(item.expires_at).getTime();
      return durationDays > 0 && Number.isFinite(expiresMs);
    });
    const sharedDurations = new Set(sharedAccesses.map(resolveAccessDurationDays));
    const maxSharedExpiresMs = sharedAccesses.length
      ? Math.max(...sharedAccesses.map((item) => new Date(item.expires_at).getTime()))
      : 0;
    const currentExpiresMs = new Date(access.expires_at).getTime();
    const sharedValid =
      sharedAccesses.length >= 2 &&
      sharedDurations.size >= 2 &&
      Number.isFinite(currentExpiresMs) &&
      currentExpiresMs < maxSharedExpiresMs;

    if (!billingValid && !sharedValid) {
      invalidAlertIds.push(alert.id);
    }
  }

  if (invalidAlertIds.length > 0) {
    await supabaseAdmin.from("license_alerts").delete().in("id", invalidAlertIds);
  }
}

async function ensureAutomaticLicenseAlerts(supabaseAdmin: SupabaseClient) {
  const { data: assignedLicensesData, error: assignedLicensesError } = await supabaseAdmin
    .from("product_licenses")
    .select(
      "id, product_id, variant_id, license_text, status, billing_duration_days, billing_duration_months, billing_ends_at, rotation_status, requires_rotation_alert, assigned_order_id, assigned_order_item_id, assigned_user_id"
    )
    .eq("status", "assigned")
    .not("assigned_order_id", "is", null)
    .not("assigned_order_item_id", "is", null)
    .not("assigned_user_id", "is", null)
    .limit(100);

  if (assignedLicensesError) {
    throw new Error(`No se pudieron revisar licencias asignadas: ${assignedLicensesError.message}`);
  }

  const assignedLicenses = (assignedLicensesData as AssignedLicenseRow[]) || [];

  if (assignedLicenses.length > 0) {
    const productIds = uniqueIds(assignedLicenses.map((item) => item.product_id));
    const variantIds = uniqueIds(assignedLicenses.map((item) => item.variant_id));
    const orderIds = uniqueIds(assignedLicenses.map((item) => item.assigned_order_id));
    const profileIds = uniqueIds(assignedLicenses.map((item) => item.assigned_user_id));

    const productsResult = productIds.length
      ? await supabaseAdmin.from("products").select("id, name, enable_license_alerts, access_duration_months").in("id", productIds)
      : { data: [], error: null };
    const variantsResult = variantIds.length
      ? await supabaseAdmin.from("product_variants").select("id, name, access_duration_months").in("id", variantIds)
      : { data: [], error: null };
    const ordersResult = orderIds.length
      ? await supabaseAdmin.from("orders").select("id, order_number, created_at").in("id", orderIds)
      : { data: [], error: null };
    const profilesResult = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", profileIds)
      : { data: [], error: null };

    const firstLookupError = [
      productsResult.error,
      variantsResult.error,
      ordersResult.error,
      profilesResult.error,
    ].find(Boolean);

    if (firstLookupError) {
      throw new Error(`No se pudieron preparar datos de alertas automaticas: ${firstLookupError.message}`);
    }

    const productsMap = new Map(
      ((productsResult.data as Array<ProductRow & { enable_license_alerts?: boolean; access_duration_months?: number | null }>) || []).map((item) => [item.id, item])
    );
    const variantsMap = new Map(((variantsResult.data as VariantRow[]) || []).map((item) => [item.id, item]));
    const ordersMap = new Map(((ordersResult.data as BackfillOrderRow[]) || []).map((item) => [item.id, item]));
    const profilesMap = new Map(((profilesResult.data as ProfileRow[]) || []).map((item) => [item.id, item]));

    const candidates = assignedLicenses.filter((license) => {
      if (!license.id) return false;
      const product = license.product_id ? productsMap.get(license.product_id) : null;
      if (!product) return false;
      const variant = license.variant_id ? variantsMap.get(license.variant_id) ?? null : null;
      return canTrackLicenseAccess({ product, variant, license });
    });

    for (const licenseBatch of chunkArray(candidates, 25)) {
      const licenseIds = uniqueIds(licenseBatch.map((item) => item.id));
      const accessesResult = await supabaseAdmin
        .from("license_accesses")
        .select("id, license_id, order_id, order_item_id, user_id, product_id, variant_id, starts_at, expires_at, status")
        .in("license_id", licenseIds);

      if (accessesResult.error) {
        throw new Error(`No se pudieron revisar accesos existentes: ${accessesResult.error.message}`);
      }

      const accesses = (accessesResult.data as AccessRow[]) || [];
      const sharedReviewKeys = new Set<string>();

      for (const license of licenseBatch) {
        if (!license.id) continue;

        const product = license.product_id ? productsMap.get(license.product_id) : null;
        if (!product) continue;

        const variant = license.variant_id ? variantsMap.get(license.variant_id) ?? null : null;
        const order = license.assigned_order_id ? ordersMap.get(license.assigned_order_id) : null;
        const profile = license.assigned_user_id ? profilesMap.get(license.assigned_user_id) : null;
        const accessDurationMonths = resolveAccessDurationMonths({ product, variant });
        const startsAt = order?.created_at ? new Date(order.created_at) : new Date();
        const expiresAt = addMonths(startsAt, accessDurationMonths);
        const productLabel = variant?.name ? `${product.name || "Producto"} - ${variant.name}` : product.name || "Producto";

        let access = accesses.find(
          (item) =>
            item.license_id === license.id &&
            item.order_id === license.assigned_order_id &&
            item.order_item_id === license.assigned_order_item_id
        );

        if (!access) {
          const { data: createdAccess, error: createAccessError } = await supabaseAdmin
            .from("license_accesses")
            .insert([
              {
                license_id: license.id,
                order_id: license.assigned_order_id,
                order_item_id: license.assigned_order_item_id,
                user_id: license.assigned_user_id,
                product_id: license.product_id,
                variant_id: license.variant_id,
                starts_at: startsAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                status: "active",
                requires_rotation: shouldCreateBillingRotationAlert({ product, variant, license }),
              },
            ])
            .select("id")
            .single();

          if (createAccessError || !createdAccess) continue;

          access = {
            id: createdAccess.id,
            license_id: license.id,
            order_id: license.assigned_order_id || null,
            order_item_id: license.assigned_order_item_id || null,
            user_id: license.assigned_user_id || null,
            product_id: license.product_id || null,
            variant_id: license.variant_id || null,
            starts_at: startsAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            status: "active",
          };

          accesses.push(access);
        }

        if (shouldCreateBillingRotationAlert({ product, variant, license })) {
          await createRotationAlertIfMissing({
            supabaseAdmin,
            license,
            access,
            productLabel,
            customerEmail: profile?.email,
            reason: "billing_shorter_than_license",
          });
        }

        const normalizedLicenseText = normalizeLicenseText(license.license_text);
        if (license.product_id && normalizedLicenseText) {
          sharedReviewKeys.add(`${license.product_id}::${normalizedLicenseText}`);
        }
      }

      for (const key of sharedReviewKeys) {
        const [productId, ...licenseTextParts] = key.split("::");
        await ensureSharedDurationAlertsForLicenseText({
          supabaseAdmin,
          productId,
          licenseText: licenseTextParts.join("::"),
        });
      }
    }
  }

  await cleanupInvalidAutomaticAlerts(supabaseAdmin);
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

    let automaticPreparationError: string | null = null;

    try {
      await ensureAutomaticLicenseAlerts(auth.supabaseAdmin);
    } catch (error) {
      automaticPreparationError = error instanceof Error ? error.message : "No se pudieron preparar alertas automaticas.";
      console.error("Error preparando alertas automaticas:", error);
    }

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
        billing_remaining_days: resolveBillingRemainingDays(license?.billing_ends_at || null),
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
      warning: automaticPreparationError,
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
