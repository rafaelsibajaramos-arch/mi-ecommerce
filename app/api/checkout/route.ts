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

// Genera un número aleatorio base para intentar crear un pedido.
const generateRandomOrderNumber = () => {
  return Math.floor(10000 + Math.random() * 90000);
};

// Normaliza el texto de una licencia para compararlo sin ruido.
const normalizeLicenseText = (value: string) => value.trim();

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

function resolveBillingDurationDays(license: LicenseRow) {
  const days = Number(license.billing_duration_days || 0);

  if (days > 0) return days;

  const months = Number(license.billing_duration_months || 0);

  if (months > 0) return months * 30;

  return 30;
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

// Determina si la compra debe crear una alerta futura de rotacion.
function shouldCreateRotationAlert({
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

  const billingDurationDays = resolveBillingDurationDays(license);
  const accessDurationDays = accessDurationMonths * 30;

  return billingDurationDays > 0 && accessDurationDays < billingDurationDays;
}

// Crea una clave única por producto y variante para indexar datos del carrito.
const buildItemKey = (productId: string, variantId?: string | null) =>
  `${productId}__${variantId ?? "base"}`;

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
    .select("id, product_id, variant_id, license_text, status, is_priority, billing_duration_days, billing_duration_months, billing_ends_at, requires_rotation_alert, license_mode, max_active_users")
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

  return (data as LicenseRow[]) || [];
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
      if (selectedIds.has(license.id)) continue;

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

    const productIds = Array.from(new Set(cart.map((item) => item.id)));
    const variantIds = Array.from(
      new Set(cart.map((item) => item.variantId).filter(Boolean) as string[])
    );

    const [
      { data: productsData, error: productsError },
      { data: variantsData, error: variantsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select(
          "id, name, description, category, price, stock, is_active, product_type, avoid_repeat_license, use_priority_licenses, fallback_to_general_licenses, enable_license_alerts, access_duration_months, default_license_billing_months, default_license_requires_rotation_alert, default_license_mode, default_max_active_users"
        )
        .in("id", productIds),
      variantIds.length
        ? supabaseAdmin
            .from("product_variants")
            .select("id, product_id, name, price, stock, is_active, access_duration_months, default_license_billing_months")
            .in("id", variantIds)
        : Promise.resolve({ data: [] as VariantRow[], error: null }),
    ]);

    if (productsError) {
      return jsonError("No se pudieron validar los productos.");
    }

    if (variantsError) {
      return jsonError("No se pudieron validar las variantes.");
    }

    const productsMap = Object.fromEntries(
      ((productsData as ProductRow[]) || []).map((p) => [p.id, p])
    );

    const variantsMap = Object.fromEntries(
      ((variantsData as VariantRow[]) || []).map((v) => [v.id, v])
    );

    let validatedTotal = 0;

    for (const item of cart) {
      if (!item?.id || !item?.name || Number(item.quantity) <= 0) {
        return jsonError("Hay un producto inválido en el carrito.");
      }

      const product = productsMap[item.id];

      if (!product || !product.is_active) {
        return jsonError(`El producto "${item.name}" ya no está disponible.`);
      }

      if (item.variantId) {
        const variant = variantsMap[item.variantId];

        if (!variant || !variant.is_active) {
          return jsonError(
            `La variante de "${item.name}" ya no está disponible.`
          );
        }

        const fallbackEnabled =
          product.fallback_to_general_licenses !== false;

        const effectiveStock =
          Number(variant.stock) +
          (fallbackEnabled ? Number(product.stock) : 0);

        if (effectiveStock < item.quantity) {
          return jsonError(`No hay stock suficiente para "${item.name}".`);
        }

        validatedTotal += Number(variant.price) * item.quantity;
      } else {
        if (Number(product.stock) < item.quantity) {
          return jsonError(`No hay stock suficiente para "${item.name}".`);
        }

        validatedTotal += Number(product.price) * item.quantity;
      }
    }

    if (Number(checkoutProfile.balance) < validatedTotal) {
      return jsonError(
        `Saldo insuficiente. Tu saldo actual es $${Number(
          checkoutProfile.balance
        ).toLocaleString()} y el total es $${validatedTotal.toLocaleString()}.`
      );
    }

    const { data: assignedHistoryData, error: assignedHistoryError } =
      await supabaseAdmin
        .from("product_licenses")
        .select("product_id, license_text")
        .eq("assigned_user_id", checkoutProfile.id)
        .eq("status", "assigned")
        .in("product_id", productIds);

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
    const selectedLicensesByItemKey = new Map<string, LicenseRow[]>();

    const productStockDeltas = new Map<
      string,
      { original: number; decrement: number }
    >();

    const variantStockDeltas = new Map<
      string,
      { original: number; decrement: number }
    >();

    for (const item of cart) {
      const product = productsMap[item.id];
      const variant = item.variantId ? variantsMap[item.variantId] : null;
      const itemKey = buildItemKey(item.id, item.variantId || null);

      if (!product) {
        return jsonError(`No se pudo preparar la compra de "${item.name}".`);
      }

      const avoidRepeat = Boolean(product.avoid_repeat_license);
      const usePriority = Boolean(product.use_priority_licenses);
      const fallbackToGeneral =
        product.fallback_to_general_licenses !== false;

      const previouslyAssignedTexts =
        assignedHistoryMap.get(item.id) || new Set<string>();

      const alreadySelectedTexts =
        orderSelectedTextsByProduct.get(item.id) || new Set<string>();

      const selectedLicenses = await selectLicensesForItem({
        supabaseAdmin,
        productId: item.id,
        variantId: item.variantId || null,
        quantity: item.quantity,
        avoidRepeatLicense: avoidRepeat,
        usePriorityLicenses: usePriority,
        fallbackToGeneralLicenses: fallbackToGeneral,
        previouslyAssignedTexts,
        alreadySelectedTexts,
      });

      if (selectedLicenses.length < item.quantity) {
        return jsonError(
          `No hay suficientes licencias disponibles para "${item.name}" con la configuración actual.`
        );
      }

      selectedLicensesByItemKey.set(itemKey, selectedLicenses);

      if (avoidRepeat) {
        const updatedSelectedTexts = new Set<string>(alreadySelectedTexts);

        for (const license of selectedLicenses) {
          updatedSelectedTexts.add(normalizeLicenseText(license.license_text));
        }

        orderSelectedTextsByProduct.set(item.id, updatedSelectedTexts);
      }

      if (item.variantId && variant) {
        const priorityCount = selectedLicenses.filter(
          (license) => license.variant_id === item.variantId
        ).length;

        const generalCount = selectedLicenses.filter(
          (license) => license.variant_id === null
        ).length;

        if (priorityCount > 0) {
          const currentVariantDelta = variantStockDeltas.get(variant.id);
          if (currentVariantDelta) {
            currentVariantDelta.decrement += priorityCount;
          } else {
            variantStockDeltas.set(variant.id, {
              original: Number(variant.stock),
              decrement: priorityCount,
            });
          }
        }

        if (generalCount > 0) {
          const currentProductDelta = productStockDeltas.get(product.id);
          if (currentProductDelta) {
            currentProductDelta.decrement += generalCount;
          } else {
            productStockDeltas.set(product.id, {
              original: Number(product.stock),
              decrement: generalCount,
            });
          }
        }
      } else {
        const currentProductDelta = productStockDeltas.get(product.id);

        if (currentProductDelta) {
          currentProductDelta.decrement += selectedLicenses.length;
        } else {
          productStockDeltas.set(product.id, {
            original: Number(product.stock),
            decrement: selectedLicenses.length,
          });
        }
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

    const newBalance = Number(checkoutProfile.balance) - validatedTotal;

    const { data: updatedProfile, error: balanceUpdateError } =
      await supabaseAdmin
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", checkoutProfile.id)
        .select("id, balance")
        .single();

    if (balanceUpdateError || !updatedProfile) {
      await supabaseAdmin.from("orders").delete().eq("id", orderData.id);
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
        await rollbackPurchase();
        return jsonError("No se pudo guardar el detalle del pedido.");
      }

      const createdItem = orderItemData as CreatedOrderItemRow;
      orderItemsByKey.set(
        buildItemKey(item.id, item.variantId || null),
        createdItem
      );
    }

    for (const item of cart) {
      const itemKey = buildItemKey(item.id, item.variantId || null);
      const matchingOrderItem = orderItemsByKey.get(itemKey);
      const selectedLicenses = selectedLicensesByItemKey.get(itemKey) || [];

      if (!matchingOrderItem) {
        await rollbackPurchase();
        return jsonError(`No se pudo completar la entrega de "${item.name}".`);
      }

      for (const license of selectedLicenses) {
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
          return jsonError(`No se pudo completar la entrega de "${item.name}".`);
        }

        assignedLicenseIds.push(license.id);

        const product = productsMap[item.id];
        const variant = item.variantId ? variantsMap[item.variantId] : null;

        if (!product) {
          await rollbackPurchase();
          return jsonError(`No se pudo preparar la alerta de "${item.name}".`);
        }

        const accessDurationMonths = resolveAccessDurationMonths({
          product,
          variant,
        });

        if (
          shouldCreateRotationAlert({
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
                product_id: item.id,
                variant_id: item.variantId || null,
                starts_at: startsAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                status: "active",
                requires_rotation: true,
              },
            ])
            .select("id")
            .single();

          if (accessError || !accessData) {
            await rollbackPurchase();
            return jsonError(
              `No se pudo crear el vencimiento de "${item.name}".`
            );
          }

          createdAccessIds.push(accessData.id);

          const productLabel = variant?.name
            ? `${product.name} - ${variant.name}`
            : product.name;

          const billingDurationDays = resolveBillingDurationDays(license);
          const message = `Cambiar contraseña de ${productLabel}. El cliente compro ${accessDurationMonths} mes(es), pero la licencia esta facturada por ${billingDurationDays} dia(s).`;

          const { data: alertData, error: alertError } = await supabaseAdmin
            .from("license_alerts")
            .insert([
              {
                license_id: license.id,
                access_id: accessData.id,
                order_id: orderData.id,
                order_item_id: matchingOrderItem.id,
                user_id: checkoutProfile.id,
                product_id: item.id,
                variant_id: item.variantId || null,
                task_type: "rotate_password",
                due_at: expiresAt.toISOString(),
                status: "pending",
                priority: "normal",
                message,
              },
            ])
            .select("id")
            .single();

          if (alertError || !alertData) {
            await rollbackPurchase();
            return jsonError(`No se pudo crear la alerta de "${item.name}".`);
          }

          createdAlertIds.push(alertData.id);
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

    const receiptItems = cart.map((item) => {
      const itemKey = buildItemKey(item.id, item.variantId || null);
      const matchingOrderItem = orderItemsByKey.get(itemKey);
      const product = productsMap[item.id];
      const selectedLicenses = selectedLicensesByItemKey.get(itemKey) || [];

      return {
        id: matchingOrderItem?.id || itemKey,
        quantity: Number(item.quantity || 0),
        price: Number(matchingOrderItem?.unit_price ?? item.price ?? 0),
        product_id: item.id,
        product_name: matchingOrderItem?.product_name || product?.name || item.name,
        variant_name:
          matchingOrderItem?.variant_name || item.variantName || null,
        product_description: product?.description || null,
        product_category: product?.category || null,
        licenses: selectedLicenses.map((license) => ({
          id: license.id,
          license_text: license.license_text,
        })),
      };
    });

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