import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient, createClient, type User } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../lib/supabaseAdmin";

type ProductType = "simple" | "variable" | "composite";

type CheckoutCartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variantId?: string | null;
  variantName?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  product_type?: ProductType;
  avoid_repeat_license?: boolean;
  use_priority_licenses?: boolean;
  fallback_to_general_licenses?: boolean;
  enable_license_alerts?: boolean;
  access_duration_months?: number | null;
  default_license_billing_months?: number | null;
  default_license_requires_rotation_alert?: boolean;
  default_license_mode?: "individual" | "shared";
  default_max_active_users?: number | null;
  combo_stock?: number | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  access_duration_months?: number | null;
  default_license_billing_months?: number | null;
};

type ProductComponentRow = {
  id: string;
  product_id: string;
  child_product_id: string;
  child_variant_id: string | null;
  quantity: number;
  sort_order?: number | null;
};

type FulfillmentRequest = {
  parentItemKey: string;
  deliveryItemKey: string;
  parentItemName: string;
  product: ProductRow;
  variant: VariantRow | null;
  quantity: number;
};

type SelectedLicenseDelivery = {
  license: LicenseRow;
  product: ProductRow;
  variant: VariantRow | null;
};

type ProfileRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  balance: number;
};

type CreatedOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  item_type: string;
  product_name: string;
  variant_name: string | null;
};

type LicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  license_text: string;
  status: string;
  assigned_order_id?: string | null;
  assigned_order_item_id?: string | null;
  assigned_user_id?: string | null;
  is_priority?: boolean;
  billing_duration_days?: number | null;
  billing_duration_months?: number | null;
  billing_ends_at?: string | null;
  requires_rotation_alert?: boolean | null;
  license_mode?: "individual" | "shared" | null;
  max_active_users?: number | null;
};

type AssignedLicenseHistoryRow = {
  product_id: string;
  license_text: string;
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

type AlertInsertInput = {
  license: LicenseRow;
  access: AccessRow;
  productLabel: string;
  customerEmail: string | null | undefined;
  reason: "billing_shorter_than_license" | "shared_different_duration";
};

// Genera un número aleatorio base para intentar crear un pedido.
const generateRandomOrderNumber = () => {
  return Math.floor(10000 + Math.random() * 90000);
};

// Normaliza el texto de una licencia para comparar datos equivalentes sin depender de espacios o saltos de línea.
const normalizeLicenseText = (value: string | null | undefined) =>
  String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[\t ]+/g, " "))
    .filter(Boolean)
    .join("\n")
    .trim();

function getRotationAlertReasonText(
  reason: "billing_shorter_than_license" | "shared_different_duration"
) {
  return reason === "shared_different_duration"
    ? "Misma licencia vendida con duraciones diferentes."
    : "El cliente compro menos tiempo que la facturacion real de la licencia.";
}

// Suma meses a una fecha conservando un comportamiento estable para fin de mes.
function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();

  result.setMonth(result.getMonth() + months);

  if (result.getDate() !== originalDay) {
    result.setDate(0);
  }

  return result;
}

function resolveExplicitBillingDurationDays(license: LicenseRow) {
  const days = Number(license.billing_duration_days || 0);

  if (Number.isFinite(days) && days > 0) return Math.floor(days);

  const months = Number(license.billing_duration_months || 0);

  if (Number.isFinite(months) && months > 0) return Math.floor(months * 30);

  return null;
}

function resolveBillingRemainingDays(license: LicenseRow) {
  if (!license.billing_ends_at) return null;

  const diffMs = new Date(license.billing_ends_at).getTime() - Date.now();

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

// Calcula la duracion vendida al cliente segun variante o producto base.
function resolveAccessDurationMonths({
  product,
  variant,
}: {
  product: ProductRow;
  variant: VariantRow | null;
}) {
  return Number(
    variant?.access_duration_months || product.access_duration_months || 0
  );
}

// Determina si hay que guardar el vencimiento de acceso de una licencia.
function shouldTrackLicenseAccess({
  product,
  accessDurationMonths,
  license,
}: {
  product: ProductRow;
  accessDurationMonths: number;
  license: LicenseRow;
}) {
  if (!product.enable_license_alerts) return false;
  if (!accessDurationMonths || accessDurationMonths <= 0) return false;
  if (license.requires_rotation_alert === false) return false;

  return true;
}

// Alerta tipo 1: la licencia fue facturada por mas dias que los vendidos al cliente.
function shouldCreateBillingRotationAlert({
  product,
  accessDurationMonths,
  license,
}: {
  product: ProductRow;
  accessDurationMonths: number;
  license: LicenseRow;
}) {
  if (!shouldTrackLicenseAccess({ product, accessDurationMonths, license })) {
    return false;
  }

  const billingDurationDays = resolveExplicitBillingDurationDays(license);

  if (!billingDurationDays) return false;

  const soldDurationDays = resolveAccessDurationDaysFromMonths(accessDurationMonths);

  return soldDurationDays > 0 && soldDurationDays < billingDurationDays;
}

function buildRotationAlertMessage({
  license,
  productLabel,
  customerEmail,
  reason,
}: AlertInsertInput) {
  const billingDurationDays = resolveExplicitBillingDurationDays(license);
  const billingRemainingDays = resolveBillingRemainingDays(license);
  const billingText = billingDurationDays
    ? `Licencia facturada por ${billingDurationDays} dia(s). Dias restantes para ti: ${billingRemainingDays ?? "Sin fecha"}.`
    : "Sin facturacion configurada en la licencia.";
  const reasonText = getRotationAlertReasonText(reason);

  return `Quitar/cambiar acceso de ${productLabel}. ${reasonText} ${billingText} Cliente: ${customerEmail || "Sin correo"}.`;
}

async function createRotationAlertIfMissing({
  supabaseAdmin,
  input,
}: {
  supabaseAdmin: SupabaseClient;
  input: AlertInsertInput;
}) {
  const { data: existingAlert, error: existingAlertError } = await supabaseAdmin
    .from("license_alerts")
    .select("id")
    .eq("access_id", input.access.id)
    .ilike("message", `%${getRotationAlertReasonText(input.reason)}%`)
    .limit(1)
    .maybeSingle();

  if (existingAlertError) {
    throw new Error(existingAlertError.message);
  }

  if (existingAlert?.id) return null;

  const { data: alertData, error: alertError } = await supabaseAdmin
    .from("license_alerts")
    .insert([
      {
        license_id: input.license.id,
        access_id: input.access.id,
        order_id: input.access.order_id,
        order_item_id: input.access.order_item_id,
        user_id: input.access.user_id,
        product_id: input.access.product_id,
        variant_id: input.access.variant_id,
        task_type: "rotate_password",
        due_at: input.access.expires_at,
        status: "pending",
        priority: "normal",
        message: buildRotationAlertMessage(input),
      },
    ])
    .select("id")
    .single();

  if (alertError || !alertData) {
    throw new Error(alertError?.message || "No se pudo crear la alerta.");
  }

  return alertData.id as string;
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
  if (!normalizedLicenseText) return [];

  const { data: matchingLicensesData, error: matchingLicensesError } =
    await supabaseAdmin
      .from("product_licenses")
      .select(
        "id, product_id, variant_id, license_text, status, billing_duration_days, billing_duration_months, billing_ends_at, requires_rotation_alert"
      )
      .eq("product_id", productId);

  if (matchingLicensesError) {
    throw new Error(matchingLicensesError.message);
  }

  const matchingLicenses = ((matchingLicensesData as LicenseRow[]) || []).filter(
    (item) => normalizeLicenseText(item.license_text) === normalizedLicenseText
  );
  const licenseIds = matchingLicenses.map((item) => item.id).filter(Boolean);

  if (licenseIds.length < 2) return [];

  const { data: activeAccessesData, error: activeAccessesError } =
    await supabaseAdmin
      .from("license_accesses")
      .select(
        "id, license_id, order_id, order_item_id, user_id, product_id, variant_id, starts_at, expires_at, status"
      )
      .in("license_id", licenseIds)
      .eq("status", "active");

  if (activeAccessesError) {
    throw new Error(activeAccessesError.message);
  }

  const activeAccesses = (activeAccessesData as AccessRow[]) || [];

  if (activeAccesses.length < 2) return [];

  const validAccesses = activeAccesses.filter((access) => {
    const durationDays = resolveAccessDurationDays(access);
    const expiresMs = new Date(access.expires_at).getTime();

    return durationDays > 0 && Number.isFinite(expiresMs);
  });

  const durationSet = new Set(validAccesses.map(resolveAccessDurationDays));

  if (validAccesses.length < 2 || durationSet.size < 2) return [];

  const maxExpiresMs = Math.max(
    ...validAccesses.map((access) => new Date(access.expires_at).getTime())
  );
  const targetAccesses = validAccesses.filter(
    (access) => new Date(access.expires_at).getTime() < maxExpiresMs
  );

  if (targetAccesses.length === 0) return [];

  const targetAccessIds = targetAccesses.map((access) => access.id);
  const { data: existingAlertsData, error: existingAlertsError } =
    await supabaseAdmin
      .from("license_alerts")
      .select("id, access_id")
      .in("access_id", targetAccessIds)
      .ilike("message", `%${getRotationAlertReasonText("shared_different_duration")}%`);

  if (existingAlertsError) {
    throw new Error(existingAlertsError.message);
  }

  const existingAlertAccessIds = new Set(
    ((existingAlertsData as { access_id: string | null }[]) || [])
      .map((item) => item.access_id)
      .filter(Boolean) as string[]
  );

  const productIds = Array.from(
    new Set(targetAccesses.map((item) => item.product_id).filter(Boolean) as string[])
  );
  const variantIds = Array.from(
    new Set(targetAccesses.map((item) => item.variant_id).filter(Boolean) as string[])
  );
  const userIds = Array.from(
    new Set(targetAccesses.map((item) => item.user_id).filter(Boolean) as string[])
  );

  const [productsResult, variantsResult, profilesResult] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as ProductRow[], error: null }),
    variantIds.length
      ? supabaseAdmin.from("product_variants").select("id, name").in("id", variantIds)
      : Promise.resolve({ data: [] as VariantRow[], error: null }),
    userIds.length
      ? supabaseAdmin.from("profiles").select("id, email").in("id", userIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);

  const firstLookupError = [
    productsResult.error,
    variantsResult.error,
    profilesResult.error,
  ].find(Boolean);

  if (firstLookupError) {
    throw new Error(firstLookupError.message);
  }

  const productsMap = new Map(
    ((productsResult.data as ProductRow[]) || []).map((item) => [item.id, item])
  );
  const variantsMap = new Map(
    ((variantsResult.data as VariantRow[]) || []).map((item) => [item.id, item])
  );
  const profilesMap = new Map(
    ((profilesResult.data as ProfileRow[]) || []).map((item) => [item.id, item])
  );
  const licensesMap = new Map(matchingLicenses.map((item) => [item.id, item]));
  const createdAlertIds: string[] = [];

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

    const createdAlertId = await createRotationAlertIfMissing({
      supabaseAdmin,
      input: {
        license,
        access,
        productLabel,
        customerEmail: profile?.email,
        reason: "shared_different_duration",
      },
    });

    if (createdAlertId) {
      createdAlertIds.push(createdAlertId);
    }
  }

  return createdAlertIds;
}

// Crea una clave única por producto y variante para indexar datos del carrito.
const buildItemKey = (productId: string, variantId?: string | null) =>
  `${productId}__${variantId ?? "base"}`;

// Crea una clave única para cada componente entregable de un combo.
const buildComboComponentKey = (
  parentItemKey: string,
  productId: string,
  variantId?: string | null
) => `${parentItemKey}__component__${productId}__${variantId ?? "base"}`;

// Construye una respuesta JSON de error con el código HTTP indicado.
function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Extrae el token Bearer desde el encabezado Authorization.
function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

// Valida que una variable de entorno exista antes de usarla.
function requireEnv(name: string) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value.trim();
}

// Crea un cliente de Supabase autenticado con el token actual del usuario.
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

// Comprueba que el cliente admin de Supabase esté bien configurado y operativo.
async function assertAdminClient(supabaseAdmin: SupabaseClient) {
  const { error } = await supabaseAdmin.from("profiles").select("id").limit(1);

  if (error) {
    if (/Invalid API key/i.test(error.message)) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY inválida o pertenece a otro proyecto."
      );
    }

    throw new Error(`Error validando Supabase Admin: ${error.message}`);
  }
}

// Genera un número de pedido único verificando que no exista previamente.
async function getUniqueOrderNumber(supabaseAdmin: SupabaseClient) {
  let attempts = 0;

  while (attempts < 25) {
    const candidate = generateRandomOrderNumber();

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("order_number", candidate)
      .maybeSingle();

    if (error) {
      throw new Error("No se pudo validar el número de pedido.");
    }

    if (!data) {
      return candidate;
    }

    attempts += 1;
  }

  throw new Error("No se pudo generar un número de pedido único.");
}

// Consulta las licencias disponibles para un producto según variante y prioridad.
async function fetchAvailableLicensePool({
  supabaseAdmin,
  productId,
  variantId,
  isPriority,
}: {
  supabaseAdmin: SupabaseClient;
  productId: string;
  variantId: string | null;
  isPriority: boolean;
}) {
  let query = supabaseAdmin
    .from("product_licenses")
    .select("id, product_id, variant_id, license_text, status, assigned_order_id, assigned_order_item_id, assigned_user_id, is_priority, billing_duration_days, billing_duration_months, billing_ends_at, requires_rotation_alert, license_mode, max_active_users")
    .eq("product_id", productId)
    .eq("status", "available")
    .eq("is_priority", isPriority)
    .order("created_at", { ascending: true });

  if (variantId) {
    query = query.eq("variant_id", variantId);
  } else {
    query = query.is("variant_id", null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const pool = ((data as LicenseRow[]) || []).filter(
    (license) =>
      !license.assigned_order_id &&
      !license.assigned_order_item_id &&
      !license.assigned_user_id
  );

  if (pool.length === 0) return [];

  // Protección extra para datos antiguos: si una licencia ya tiene historial de
  // acceso, no debe salir de nuevo por checkout aunque haya quedado available.
  const { data: usedAccesses, error: usedAccessesError } = await supabaseAdmin
    .from("license_accesses")
    .select("license_id")
    .in(
      "license_id",
      pool.map((license) => license.id)
    );

  if (usedAccessesError) {
    throw new Error(usedAccessesError.message);
  }

  const usedLicenseIds = new Set(
    ((usedAccesses as Array<{ license_id: string | null }> | null) || [])
      .map((access) => access.license_id)
      .filter(Boolean) as string[]
  );

  return pool.filter((license) => !usedLicenseIds.has(license.id));
}

// Selecciona las licencias a entregar respetando prioridad, fallback y reglas de no repetición.
async function selectLicensesForItem({
  supabaseAdmin,
  productId,
  variantId,
  quantity,
  avoidRepeatLicense,
  usePriorityLicenses,
  fallbackToGeneralLicenses,
  previouslyAssignedTexts,
  alreadySelectedTexts,
  reservedLicenseIds,
}: {
  supabaseAdmin: SupabaseClient;
  productId: string;
  variantId: string | null;
  quantity: number;
  avoidRepeatLicense: boolean;
  usePriorityLicenses: boolean;
  fallbackToGeneralLicenses: boolean;
  previouslyAssignedTexts: Set<string>;
  alreadySelectedTexts: Set<string>;
  reservedLicenseIds: Set<string>;
}) {
  const pools: { variantId: string | null; isPriority: boolean }[] = [];

  if (variantId) {
    const priorityPool = { variantId, isPriority: true };
    const generalPool = { variantId: null, isPriority: false };

    if (usePriorityLicenses) {
      pools.push(priorityPool);

      if (fallbackToGeneralLicenses) {
        pools.push(generalPool);
      }
    } else {
      if (fallbackToGeneralLicenses) {
        pools.push(generalPool);
      }

      pools.push(priorityPool);
    }
  } else {
    pools.push({ variantId: null, isPriority: false });
  }

  const selected: LicenseRow[] = [];
  const selectedIds = new Set<string>();
  const selectedTexts = new Set<string>(alreadySelectedTexts);

  for (const pool of pools) {
    const poolLicenses = await fetchAvailableLicensePool({
      supabaseAdmin,
      productId,
      variantId: pool.variantId,
      isPriority: pool.isPriority,
    });

    for (const license of poolLicenses) {
      if (selectedIds.has(license.id) || reservedLicenseIds.has(license.id)) continue;

      const normalizedText = normalizeLicenseText(license.license_text);
      if (!normalizedText) continue;

      if (avoidRepeatLicense) {
        if (previouslyAssignedTexts.has(normalizedText)) continue;
        if (selectedTexts.has(normalizedText)) continue;
      }

      selected.push(license);
      selectedIds.add(license.id);

      if (avoidRepeatLicense) {
        selectedTexts.add(normalizedText);
      }

      if (selected.length >= quantity) {
        return selected;
      }
    }
  }

  return selected;
}

// Busca o crea el perfil que se usará durante el checkout.
async function resolveCheckoutProfile(
  supabaseAdmin: SupabaseClient,
  user: User
): Promise<ProfileRow> {
  const normalizedEmail = user.email?.trim().toLowerCase() || null;

  const { data: profileById, error: profileByIdError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, balance")
    .eq("id", user.id)
    .maybeSingle();

  if (profileByIdError) {
    if (/Invalid API key/i.test(profileByIdError.message)) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY inválida o pertenece a otro proyecto."
      );
    }

    throw new Error(`Error buscando perfil por id: ${profileByIdError.message}`);
  }

  if (profileById) {
    return {
      ...(profileById as ProfileRow),
      balance: Number((profileById as ProfileRow).balance || 0),
    };
  }

  if (normalizedEmail) {
    const { data: profileByEmail, error: profileByEmailError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, role, balance")
        .ilike("email", normalizedEmail)
        .maybeSingle();

    if (profileByEmailError) {
      throw new Error(
        `Error buscando perfil por email: ${profileByEmailError.message}`
      );
    }

    if (profileByEmail) {
      const resolvedProfile = profileByEmail as ProfileRow;

      return {
        ...resolvedProfile,
        balance: Number(resolvedProfile.balance || 0),
      };
    }
  }

  const insertPayload = {
    id: user.id,
    email: normalizedEmail,
    full_name:
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) || null,
    role: "user",
    balance: 0,
  };

  const { data: createdProfile, error: createProfileError } = await supabaseAdmin
    .from("profiles")
    .insert([insertPayload])
    .select("id, email, full_name, role, balance")
    .single();

  if (createProfileError) {
    if (normalizedEmail) {
      const { data: fallbackProfile, error: fallbackProfileError } =
        await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, role, balance")
          .ilike("email", normalizedEmail)
          .maybeSingle();

      if (fallbackProfileError) {
        throw new Error(
          `No se pudo crear ni recuperar el perfil: ${fallbackProfileError.message}`
        );
      }

      if (fallbackProfile) {
        return {
          ...(fallbackProfile as ProfileRow),
          balance: Number((fallbackProfile as ProfileRow).balance || 0),
        };
      }
    }

    throw new Error(
      `No se pudo crear el perfil del usuario: ${createProfileError.message}`
    );
  }

  return {
    ...(createdProfile as ProfileRow),
    balance: Number((createdProfile as ProfileRow).balance || 0),
  };
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return jsonError("No autorizado.", 401);
    }

    const supabaseAuth = createSupabaseUserClientFromToken(token);
    const supabaseAdmin = createSupabaseAdmin();

    await assertAdminClient(supabaseAdmin);

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return jsonError("Sesión inválida.", 401);
    }

    const body = await request.json();
    const cart = Array.isArray(body?.cart)
      ? (body.cart as CheckoutCartItem[])
      : null;

    if (!cart || cart.length === 0) {
      return jsonError("Tu carrito está vacío.");
    }

    const checkoutProfile = await resolveCheckoutProfile(supabaseAdmin, user);

    const cartProductIds = Array.from(new Set(cart.map((item) => item.id)));
    const cartVariantIds = Array.from(
      new Set(cart.map((item) => item.variantId).filter(Boolean) as string[])
    );

    const productSelect =
      "id, name, description, category, price, stock, is_active, product_type, avoid_repeat_license, use_priority_licenses, fallback_to_general_licenses, enable_license_alerts, access_duration_months, default_license_billing_months, default_license_requires_rotation_alert, default_license_mode, default_max_active_users, combo_stock";
    const variantSelect =
      "id, product_id, name, price, stock, is_active, access_duration_months, default_license_billing_months";

    const [
      { data: productsData, error: productsError },
      { data: variantsData, error: variantsError },
    ] = await Promise.all([
      supabaseAdmin.from("products").select(productSelect).in("id", cartProductIds),
      cartVariantIds.length
        ? supabaseAdmin
            .from("product_variants")
            .select(variantSelect)
            .in("id", cartVariantIds)
        : Promise.resolve({ data: [] as VariantRow[], error: null }),
    ]);

    if (productsError) {
      return jsonError("No se pudieron validar los productos.");
    }

    if (variantsError) {
      return jsonError("No se pudieron validar las variantes.");
    }

    const productsMap: Record<string, ProductRow> = Object.fromEntries(
      ((productsData as ProductRow[]) || []).map((product) => [product.id, product])
    );

    const variantsMap: Record<string, VariantRow> = Object.fromEntries(
      ((variantsData as VariantRow[]) || []).map((variant) => [variant.id, variant])
    );

    const compositeProductIds = cartProductIds.filter(
      (productId) => productsMap[productId]?.product_type === "composite"
    );

    const { data: componentsData, error: componentsError } =
      compositeProductIds.length > 0
        ? await supabaseAdmin
            .from("product_components")
            .select("id, product_id, child_product_id, child_variant_id, quantity, sort_order")
            .in("product_id", compositeProductIds)
            .order("sort_order", { ascending: true })
        : { data: [] as ProductComponentRow[], error: null };

    if (componentsError) {
      return jsonError("No se pudieron validar los componentes de los combos.");
    }

    const components = (componentsData as ProductComponentRow[]) || [];
    const childProductIds = Array.from(
      new Set(components.map((component) => component.child_product_id).filter(Boolean))
    );
    const childVariantIds = Array.from(
      new Set(
        components
          .map((component) => component.child_variant_id)
          .filter(Boolean) as string[]
      )
    );

    const missingChildProductIds = childProductIds.filter(
      (productId) => !productsMap[productId]
    );
    const missingChildVariantIds = childVariantIds.filter(
      (variantId) => !variantsMap[variantId]
    );

    const [childProductsResult, childVariantsResult] = await Promise.all([
      missingChildProductIds.length
        ? supabaseAdmin
            .from("products")
            .select(productSelect)
            .in("id", missingChildProductIds)
        : Promise.resolve({ data: [] as ProductRow[], error: null }),
      missingChildVariantIds.length
        ? supabaseAdmin
            .from("product_variants")
            .select(variantSelect)
            .in("id", missingChildVariantIds)
        : Promise.resolve({ data: [] as VariantRow[], error: null }),
    ]);

    if (childProductsResult.error) {
      return jsonError("No se pudieron validar los productos incluidos en los combos.");
    }

    if (childVariantsResult.error) {
      return jsonError("No se pudieron validar las variantes incluidas en los combos.");
    }

    for (const product of (childProductsResult.data as ProductRow[]) || []) {
      productsMap[product.id] = product;
    }

    for (const variant of (childVariantsResult.data as VariantRow[]) || []) {
      variantsMap[variant.id] = variant;
    }

    const componentsByProduct = new Map<string, ProductComponentRow[]>();

    // Cada componente del combo representa exactamente una entrega. También se
    // eliminan duplicados antiguos para impedir que un mismo producto entregue
    // más de una licencia por una sola unidad del combo.
    for (const component of components) {
      const current = componentsByProduct.get(component.product_id) || [];
      const duplicateIndex = current.findIndex(
        (item) =>
          item.child_product_id === component.child_product_id &&
          (item.child_variant_id || null) === (component.child_variant_id || null)
      );

      if (duplicateIndex >= 0) {
        const previous = current[duplicateIndex];
        current[duplicateIndex] = {
          ...previous,
          quantity: 1,
          sort_order: Math.min(
            Number(previous.sort_order ?? Number.MAX_SAFE_INTEGER),
            Number(component.sort_order ?? Number.MAX_SAFE_INTEGER)
          ),
        };
      } else {
        current.push({ ...component, quantity: 1 });
      }

      current.sort(
        (left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)
      );
      componentsByProduct.set(component.product_id, current);
    }

    const fulfillmentRequests: FulfillmentRequest[] = [];
    const comboRequestedUnits = new Map<string, number>();
    let validatedTotal = 0;

    for (const item of cart) {
      const itemQuantity = Number(item.quantity);

      if (!item?.id || !item?.name || !Number.isInteger(itemQuantity) || itemQuantity <= 0) {
        return jsonError("Hay un producto inválido en el carrito.");
      }

      const product = productsMap[item.id];

      if (!product || !product.is_active) {
        return jsonError(`El producto "${item.name}" ya no está disponible.`);
      }

      const parentItemKey = buildItemKey(item.id, item.variantId || null);

      if (product.product_type === "composite") {
        if (item.variantId) {
          return jsonError(`El combo "${item.name}" no admite una variante directa.`);
        }

        const requestedComboUnits =
          (comboRequestedUnits.get(product.id) || 0) + itemQuantity;
        comboRequestedUnits.set(product.id, requestedComboUnits);

        const configuredComboStock =
          product.combo_stock === null || product.combo_stock === undefined
            ? null
            : Number(product.combo_stock);

        if (
          configuredComboStock !== null &&
          Number.isFinite(configuredComboStock) &&
          requestedComboUnits > configuredComboStock
        ) {
          return jsonError(`No hay suficiente stock disponible del combo "${item.name}".`);
        }

        const comboComponents = componentsByProduct.get(product.id) || [];

        if (comboComponents.length < 2) {
          return jsonError(`El combo "${item.name}" no tiene componentes válidos.`);
        }

        for (const component of comboComponents) {
          const childProduct = productsMap[component.child_product_id];

          if (
            !childProduct ||
            !childProduct.is_active ||
            childProduct.product_type === "composite"
          ) {
            return jsonError(
              `Uno de los productos incluidos en "${item.name}" ya no está disponible.`
            );
          }

          const childVariant = component.child_variant_id
            ? variantsMap[component.child_variant_id]
            : null;

          if (
            component.child_variant_id &&
            (!childVariant ||
              !childVariant.is_active ||
              childVariant.product_id !== childProduct.id)
          ) {
            return jsonError(
              `Una variante incluida en "${item.name}" ya no está disponible.`
            );
          }

          const requiredQuantity = itemQuantity;
          const effectiveComponentStock = childVariant
            ? Number(childVariant.stock || 0) +
              (childProduct.fallback_to_general_licenses === false
                ? 0
                : Number(childProduct.stock || 0))
            : Number(childProduct.stock || 0);

          if (effectiveComponentStock < requiredQuantity) {
            return jsonError(
              `No hay stock suficiente de "${childProduct.name}" para completar "${item.name}".`
            );
          }

          fulfillmentRequests.push({
            parentItemKey,
            deliveryItemKey: buildComboComponentKey(
              parentItemKey,
              childProduct.id,
              childVariant?.id || null
            ),
            parentItemName: item.name,
            product: childProduct,
            variant: childVariant,
            quantity: requiredQuantity,
          });
        }

        validatedTotal += Number(product.price) * itemQuantity;
        continue;
      }

      if (item.variantId) {
        const variant = variantsMap[item.variantId];

        if (
          !variant ||
          !variant.is_active ||
          variant.product_id !== product.id
        ) {
          return jsonError(
            `La variante de "${item.name}" ya no está disponible.`
          );
        }

        const fallbackEnabled =
          product.fallback_to_general_licenses !== false;
        const effectiveStock =
          Number(variant.stock || 0) +
          (fallbackEnabled ? Number(product.stock || 0) : 0);

        if (effectiveStock < itemQuantity) {
          return jsonError(`No hay stock suficiente para "${item.name}".`);
        }

        fulfillmentRequests.push({
          parentItemKey,
          deliveryItemKey: parentItemKey,
          parentItemName: item.name,
          product,
          variant,
          quantity: itemQuantity,
        });
        validatedTotal += Number(variant.price) * itemQuantity;
      } else {
        if (Number(product.stock || 0) < itemQuantity) {
          return jsonError(`No hay stock suficiente para "${item.name}".`);
        }

        fulfillmentRequests.push({
          parentItemKey,
          deliveryItemKey: parentItemKey,
          parentItemName: item.name,
          product,
          variant: null,
          quantity: itemQuantity,
        });
        validatedTotal += Number(product.price) * itemQuantity;
      }
    }

    if (Number(checkoutProfile.balance) < validatedTotal) {
      return jsonError(
        `Saldo insuficiente. Tu saldo actual es $${Number(
          checkoutProfile.balance
        ).toLocaleString()} y el total es $${validatedTotal.toLocaleString()}.`
      );
    }

    const fulfillmentProductIds = Array.from(
      new Set(fulfillmentRequests.map((requestItem) => requestItem.product.id))
    );

    const { data: assignedHistoryData, error: assignedHistoryError } =
      await supabaseAdmin
        .from("product_licenses")
        .select("product_id, license_text")
        .eq("assigned_user_id", checkoutProfile.id)
        .eq("status", "assigned")
        .in("product_id", fulfillmentProductIds);

    if (assignedHistoryError) {
      return jsonError(
        "No se pudo validar el historial de licencias del usuario."
      );
    }

    const assignedHistoryMap = new Map<string, Set<string>>();

    for (const row of (assignedHistoryData || []) as AssignedLicenseHistoryRow[]) {
      const normalizedText = normalizeLicenseText(row.license_text);
      if (!normalizedText) continue;

      if (!assignedHistoryMap.has(row.product_id)) {
        assignedHistoryMap.set(row.product_id, new Set<string>());
      }

      assignedHistoryMap.get(row.product_id)!.add(normalizedText);
    }

    const orderSelectedTextsByProduct = new Map<string, Set<string>>();
    const selectedDeliveriesByItemKey = new Map<
      string,
      SelectedLicenseDelivery[]
    >();
    const reservedLicenseIds = new Set<string>();

    const productStockDeltas = new Map<
      string,
      { original: number; decrement: number }
    >();

    const variantStockDeltas = new Map<
      string,
      { original: number; decrement: number }
    >();

    const addProductStockDecrement = (product: ProductRow, decrement: number) => {
      if (decrement <= 0) return;
      const current = productStockDeltas.get(product.id);

      if (current) {
        current.decrement += decrement;
      } else {
        productStockDeltas.set(product.id, {
          original: Number(product.stock || 0),
          decrement,
        });
      }
    };

    const addVariantStockDecrement = (variant: VariantRow, decrement: number) => {
      if (decrement <= 0) return;
      const current = variantStockDeltas.get(variant.id);

      if (current) {
        current.decrement += decrement;
      } else {
        variantStockDeltas.set(variant.id, {
          original: Number(variant.stock || 0),
          decrement,
        });
      }
    };

    for (const requestItem of fulfillmentRequests) {
      const product = requestItem.product;
      const variant = requestItem.variant;
      const avoidRepeat = Boolean(product.avoid_repeat_license);
      const usePriority = Boolean(product.use_priority_licenses);
      const fallbackToGeneral =
        product.fallback_to_general_licenses !== false;
      const previouslyAssignedTexts =
        assignedHistoryMap.get(product.id) || new Set<string>();
      const alreadySelectedTexts =
        orderSelectedTextsByProduct.get(product.id) || new Set<string>();

      const selectedLicenses = await selectLicensesForItem({
        supabaseAdmin,
        productId: product.id,
        variantId: variant?.id || null,
        quantity: requestItem.quantity,
        avoidRepeatLicense: avoidRepeat,
        usePriorityLicenses: usePriority,
        fallbackToGeneralLicenses: fallbackToGeneral,
        previouslyAssignedTexts,
        alreadySelectedTexts,
        reservedLicenseIds,
      });

      if (selectedLicenses.length < requestItem.quantity) {
        return jsonError(
          `No hay suficientes licencias de "${product.name}" para completar "${requestItem.parentItemName}" respetando la configuración actual.`
        );
      }

      const currentDeliveries =
        selectedDeliveriesByItemKey.get(requestItem.deliveryItemKey) || [];

      for (const license of selectedLicenses) {
        reservedLicenseIds.add(license.id);
        currentDeliveries.push({ license, product, variant });
      }

      selectedDeliveriesByItemKey.set(
        requestItem.deliveryItemKey,
        currentDeliveries
      );

      if (avoidRepeat) {
        const updatedSelectedTexts = new Set<string>(alreadySelectedTexts);

        for (const license of selectedLicenses) {
          updatedSelectedTexts.add(normalizeLicenseText(license.license_text));
        }

        orderSelectedTextsByProduct.set(product.id, updatedSelectedTexts);
      }

      if (variant) {
        const priorityCount = selectedLicenses.filter(
          (license) => license.variant_id === variant.id
        ).length;
        const generalCount = selectedLicenses.filter(
          (license) => license.variant_id === null
        ).length;

        addVariantStockDecrement(variant, priorityCount);
        addProductStockDecrement(product, generalCount);
      } else {
        addProductStockDecrement(product, selectedLicenses.length);
      }
    }

    const orderNumber = await getUniqueOrderNumber(supabaseAdmin);

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert([
        {
          user_id: checkoutProfile.id,
          total: validatedTotal,
          payment_method: "wallet",
          status: "paid",
          order_number: orderNumber,
        },
      ])
      .select()
      .single();

    if (orderError || !orderData) {
      return jsonError(orderError?.message || "No se pudo crear el pedido.");
    }

    const createdOrderId: string | null = orderData.id;
    let createdWalletTransactionId: string | null = null;
    let balanceDiscounted = false;
    const assignedLicenseIds: string[] = [];
    const createdAccessIds: string[] = [];
    const createdAlertIds: string[] = [];
    const updatedVariantStockIds = new Set<string>();
    const updatedProductStockIds = new Set<string>();
    const reservedComboStock = new Map<string, number>();

    const rollbackPurchase = async () => {
      for (const variantId of Array.from(updatedVariantStockIds)) {
        const restore = variantStockDeltas.get(variantId);
        if (!restore) continue;

        await supabaseAdmin
          .from("product_variants")
          .update({ stock: restore.original })
          .eq("id", variantId);
      }

      for (const productId of Array.from(updatedProductStockIds)) {
        const restore = productStockDeltas.get(productId);
        if (!restore) continue;

        await supabaseAdmin
          .from("products")
          .update({ stock: restore.original })
          .eq("id", productId);
      }

      for (const [comboProductId, quantity] of reservedComboStock.entries()) {
        await supabaseAdmin.rpc("release_combo_stock", {
          p_product_id: comboProductId,
          p_quantity: quantity,
        });
      }

      if (createdAlertIds.length > 0) {
        await supabaseAdmin.from("license_alerts").delete().in("id", createdAlertIds);
      }

      if (createdAccessIds.length > 0) {
        await supabaseAdmin.from("license_accesses").delete().in("id", createdAccessIds);
      }

      if (assignedLicenseIds.length > 0) {
        await supabaseAdmin
          .from("product_licenses")
          .update({
            status: "available",
            assigned_order_id: null,
            assigned_order_item_id: null,
            assigned_user_id: null,
            rotation_status: "normal",
          })
          .in("id", assignedLicenseIds);
      }

      if (createdWalletTransactionId) {
        await supabaseAdmin
          .from("wallet_transactions")
          .delete()
          .eq("id", createdWalletTransactionId);
      }

      if (createdOrderId) {
        await supabaseAdmin.from("orders").delete().eq("id", createdOrderId);
      }

      if (balanceDiscounted) {
        await supabaseAdmin
          .from("profiles")
          .update({ balance: Number(checkoutProfile.balance) })
          .eq("id", checkoutProfile.id);
      }
    };

    for (const [comboProductId, quantity] of comboRequestedUnits.entries()) {
      const { data: reserved, error: reserveError } = await supabaseAdmin.rpc(
        "reserve_combo_stock",
        {
          p_product_id: comboProductId,
          p_quantity: quantity,
        }
      );

      if (reserveError || reserved !== true) {
        await rollbackPurchase();
        const comboName = productsMap[comboProductId]?.name || "El combo";
        return jsonError(
          reserveError
            ? `No se pudo reservar el stock de "${comboName}". Revisa que la migración de combos esté aplicada.`
            : `"${comboName}" no tiene suficiente stock disponible.`
        );
      }

      reservedComboStock.set(comboProductId, quantity);
    }

    const newBalance = Number(checkoutProfile.balance) - validatedTotal;

    const { data: updatedProfile, error: balanceUpdateError } =
      await supabaseAdmin
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", checkoutProfile.id)
        .select("id, balance")
        .single();

    if (balanceUpdateError || !updatedProfile) {
      await rollbackPurchase();
      return jsonError("No se pudo descontar el saldo.");
    }

    balanceDiscounted = true;

    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

    const purchaseNote =
      totalItems === 1
        ? `Compra del pedido #${orderNumber}`
        : `Compra de ${totalItems} producto(s) en el pedido #${orderNumber}`;

    const { data: walletTransactionData, error: walletTransactionError } =
      await supabaseAdmin
        .from("wallet_transactions")
        .insert([
          {
            user_id: checkoutProfile.id,
            created_by: checkoutProfile.id,
            type: "debit",
            amount: validatedTotal,
            note: purchaseNote,
            description: purchaseNote,
          },
        ])
        .select("id")
        .single();

    if (walletTransactionError || !walletTransactionData) {
      await rollbackPurchase();
      return jsonError(
        walletTransactionError?.message ||
          "No se pudo registrar la transacción de compra."
      );
    }

    createdWalletTransactionId = walletTransactionData.id;

    const orderItemsByKey = new Map<string, CreatedOrderItemRow>();

    for (const item of cart) {
      const product = productsMap[item.id];
      const variant = item.variantId ? variantsMap[item.variantId] : null;
      const parentItemKey = buildItemKey(item.id, item.variantId || null);

      if (product?.product_type === "composite") {
        const comboComponents = componentsByProduct.get(product.id) || [];
        const totalComponentUnits = comboComponents.length;

        if (totalComponentUnits <= 0) {
          await rollbackPurchase();
          return jsonError(`El combo "${item.name}" no tiene componentes válidos.`);
        }

        // El precio del combo se distribuye entre las unidades de sus componentes.
        // Así el pedido queda con Netflix y Prime como líneas independientes,
        // pero la suma sigue siendo exactamente el valor comercial del combo.
        const componentUnitPrice = Number(product.price || item.price || 0) / totalComponentUnits;

        for (const component of comboComponents) {
          const childProduct = productsMap[component.child_product_id];
          const childVariant = component.child_variant_id
            ? variantsMap[component.child_variant_id]
            : null;
          const requiredQuantity = Number(item.quantity || 0);
          const deliveryItemKey = buildComboComponentKey(
            parentItemKey,
            component.child_product_id,
            component.child_variant_id || null
          );

          if (!childProduct || requiredQuantity <= 0) {
            await rollbackPurchase();
            return jsonError(`No se pudo preparar un componente de "${item.name}".`);
          }

          const { data: orderItemData, error: orderItemError } =
            await supabaseAdmin
              .from("order_items")
              .insert([
                {
                  order_id: orderData.id,
                  product_id: childProduct.id,
                  variant_id: childVariant?.id || null,
                  quantity: requiredQuantity,
                  unit_price: componentUnitPrice,
                  item_type: childVariant ? "variant" : "simple",
                  product_name: childProduct.name,
                  variant_name: childVariant?.name || null,
                },
              ])
              .select()
              .single();

          if (orderItemError || !orderItemData) {
            console.error("Error guardando componente del combo:", {
              orderId: orderData.id,
              comboProductId: product.id,
              childProductId: childProduct.id,
              childVariantId: childVariant?.id || null,
              message: orderItemError?.message || "Sin detalle de Supabase",
            });
            await rollbackPurchase();
            return jsonError("No se pudo guardar el detalle del combo.");
          }

          orderItemsByKey.set(
            deliveryItemKey,
            orderItemData as CreatedOrderItemRow
          );
        }

        continue;
      }

      const unitPrice = Number(variant?.price ?? product?.price ?? item.price);
      const { data: orderItemData, error: orderItemError } =
        await supabaseAdmin
          .from("order_items")
          .insert([
            {
              order_id: orderData.id,
              product_id: item.id,
              variant_id: item.variantId || null,
              quantity: item.quantity,
              unit_price: unitPrice,
              item_type: item.variantId ? "variant" : "simple",
              product_name: product?.name || item.name,
              variant_name: item.variantName || null,
            },
          ])
          .select()
          .single();

      if (orderItemError || !orderItemData) {
        console.error("Error guardando order_item del checkout:", {
          orderId: orderData.id,
          productId: item.id,
          variantId: item.variantId || null,
          productType: product?.product_type || null,
          message: orderItemError?.message || "Sin detalle de Supabase",
        });
        await rollbackPurchase();
        return jsonError("No se pudo guardar el detalle del pedido.");
      }

      orderItemsByKey.set(parentItemKey, orderItemData as CreatedOrderItemRow);
    }

    for (const [deliveryItemKey, deliveries] of selectedDeliveriesByItemKey.entries()) {
      const matchingOrderItem = orderItemsByKey.get(deliveryItemKey);
      const firstDelivery = deliveries[0];
      const deliveryLabel = firstDelivery?.variant?.name
        ? `${firstDelivery.product.name} - ${firstDelivery.variant.name}`
        : firstDelivery?.product.name || "producto";

      if (!matchingOrderItem) {
        await rollbackPurchase();
        return jsonError(`No se pudo completar la entrega de "${deliveryLabel}".`);
      }

      for (const delivery of deliveries) {
        const { license, product, variant } = delivery;
        const { data: assignedRow, error: assignError } = await supabaseAdmin
          .from("product_licenses")
          .update({
            status: "assigned",
            assigned_order_id: orderData.id,
            assigned_order_item_id: matchingOrderItem.id,
            assigned_user_id: checkoutProfile.id,
          })
          .eq("id", license.id)
          .eq("status", "available")
          .select("id")
          .maybeSingle();

        if (assignError || !assignedRow) {
          await rollbackPurchase();
          return jsonError(`No se pudo completar la entrega de "${deliveryLabel}".`);
        }

        assignedLicenseIds.push(license.id);

        const accessDurationMonths = resolveAccessDurationMonths({
          product,
          variant,
        });

        if (
          shouldTrackLicenseAccess({
            product,
            accessDurationMonths,
            license,
          })
        ) {
          const startsAt = new Date();
          const expiresAt = addMonths(startsAt, accessDurationMonths);

          const { data: accessData, error: accessError } = await supabaseAdmin
            .from("license_accesses")
            .insert([
              {
                license_id: license.id,
                order_id: orderData.id,
                order_item_id: matchingOrderItem.id,
                user_id: checkoutProfile.id,
                product_id: product.id,
                variant_id: variant?.id || null,
                starts_at: startsAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                status: "active",
                requires_rotation: shouldCreateBillingRotationAlert({
                  product,
                  accessDurationMonths,
                  license,
                }),
              },
            ])
            .select("id")
            .single();

          if (accessError || !accessData) {
            await rollbackPurchase();
            return jsonError(
              `No se pudo crear el vencimiento de "${product.name}".`
            );
          }

          createdAccessIds.push(accessData.id);

          const productLabel = variant?.name
            ? `${product.name} - ${variant.name}`
            : product.name;

          const access: AccessRow = {
            id: accessData.id,
            license_id: license.id,
            order_id: orderData.id,
            order_item_id: matchingOrderItem.id,
            user_id: checkoutProfile.id,
            product_id: product.id,
            variant_id: variant?.id || null,
            starts_at: startsAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            status: "active",
          };

          if (
            shouldCreateBillingRotationAlert({
              product,
              accessDurationMonths,
              license,
            })
          ) {
            try {
              const alertId = await createRotationAlertIfMissing({
                supabaseAdmin,
                input: {
                  license,
                  access,
                  productLabel,
                  customerEmail: checkoutProfile.email,
                  reason: "billing_shorter_than_license",
                },
              });

              if (alertId) createdAlertIds.push(alertId);
            } catch {
              await rollbackPurchase();
              return jsonError(`No se pudo crear la alerta de "${product.name}".`);
            }
          }

          try {
            const sharedAlertIds = await ensureSharedDurationAlertsForLicenseText({
              supabaseAdmin,
              productId: product.id,
              licenseText: license.license_text,
            });

            createdAlertIds.push(...sharedAlertIds);
          } catch {
            await rollbackPurchase();
            return jsonError(
              `No se pudieron revisar alertas compartidas de "${product.name}".`
            );
          }
        }
      }
    }

    for (const [variantId, stockInfo] of variantStockDeltas.entries()) {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .update({ stock: stockInfo.original - stockInfo.decrement })
        .eq("id", variantId);

      if (error) {
        await rollbackPurchase();
        return jsonError("No se pudo actualizar el stock de una variante.");
      }

      updatedVariantStockIds.add(variantId);
    }

    for (const [productId, stockInfo] of productStockDeltas.entries()) {
      const { error } = await supabaseAdmin
        .from("products")
        .update({ stock: stockInfo.original - stockInfo.decrement })
        .eq("id", productId);

      if (error) {
        await rollbackPurchase();
        return jsonError("No se pudo actualizar el stock de un producto.");
      }

      updatedProductStockIds.add(productId);
    }

    const receiptItems = Array.from(orderItemsByKey.entries()).map(
      ([deliveryItemKey, matchingOrderItem]) => {
        const product = productsMap[matchingOrderItem.product_id];
        const selectedDeliveries =
          selectedDeliveriesByItemKey.get(deliveryItemKey) || [];

        return {
          id: matchingOrderItem.id,
          quantity: Number(matchingOrderItem.quantity || 0),
          price: Number(matchingOrderItem.unit_price || 0),
          product_id: matchingOrderItem.product_id,
          product_name:
            matchingOrderItem.product_name || product?.name || "Producto",
          variant_name: matchingOrderItem.variant_name || null,
          product_description: product?.description || null,
          product_category: product?.category || null,
          licenses: selectedDeliveries.map(({ license }) => ({
            id: license.id,
            license_text: license.license_text,
          })),
        };
      }
    );

    return NextResponse.json({
      ok: true,
      orderId: orderData.id,
      orderNumber,
      redirectTo: "/account/orders",
      receipt: {
        id: orderData.id,
        order_number: orderData.order_number,
        total: Number(orderData.total || 0),
        status: orderData.status || "paid",
        created_at: orderData.created_at,
        items: receiptItems,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado al procesar la compra.",
      500
    );
  }
}