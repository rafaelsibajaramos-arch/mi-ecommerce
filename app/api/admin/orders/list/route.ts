import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const PAGE_LIMIT = 1000;

// Ajusta este número si tu proyecto tiene pedidos con muchísimos items/licencias.
const ID_CHUNK_SIZE = 80;

type CallerProfile = {
  id: string;
  role: string | null;
};

type OrderRow = {
  id: string;
  order_number: number | null;
  user_id: string;
  total: number | null;
  status: string | null;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number | null;
  unit_price: number | null;
  product_name: string | null;
  variant_name: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
};

type LicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  license_text: string;
  status: string;
  assigned_order_id: string | null;
  assigned_order_item_id: string | null;
  assigned_user_id: string | null;
};

type CustomerProfileRow = {
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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

async function fetchAllRows<T>({
  queryBuilder,
}: {
  queryBuilder: (from: number, to: number) => Promise<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
}) {
  const results: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_LIMIT - 1;
    const { data, error } = await queryBuilder(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = data || [];
    results.push(...page);

    if (page.length < PAGE_LIMIT) {
      break;
    }

    from += PAGE_LIMIT;
  }

  return results;
}

async function fetchAllRowsInChunks<T>({
  ids,
  chunkSize,
  queryBuilder,
}: {
  ids: string[];
  chunkSize: number;
  queryBuilder: (chunk: string[], from: number, to: number) => Promise<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
}) {
  const results: T[] = [];

  for (const chunk of chunkArray(ids, chunkSize)) {
    const chunkRows = await fetchAllRows<T>({
      queryBuilder: (from, to) => queryBuilder(chunk, from, to),
    });

    results.push(...chunkRows);
  }

  return results;
}

export async function GET(request: NextRequest) {
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
      return jsonError("No tienes permisos para ver pedidos.", 403);
    }

    // IMPORTANTE:
    // Supabase suele devolver máximo 1000 registros por consulta.
    // Por eso aquí los pedidos se traen por páginas usando .range().
    const rawOrders = await fetchAllRows<OrderRow>({
      queryBuilder: async (from, to) => {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id, order_number, user_id, total, status, created_at")
          .order("created_at", { ascending: false })
          .range(from, to);

        return {
          data: (data as OrderRow[]) || [],
          error: error ? { message: error.message } : null,
        };
      },
    });

    if (rawOrders.length === 0) {
      return NextResponse.json({
        ok: true,
        orders: [],
        stats: {
          totalOrders: 0,
          totalRevenue: 0,
          totalLicenses: 0,
        },
      });
    }

    const orderIds = rawOrders.map((order) => order.id);
    const userIds = Array.from(
      new Set(rawOrders.map((order) => order.user_id).filter(Boolean))
    );

    const profilesData = await fetchAllRowsInChunks<CustomerProfileRow>({
      ids: userIds,
      chunkSize: 100,
      queryBuilder: async (chunk, from, to) => {
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", chunk)
          .range(from, to);

        return {
          data: (data as CustomerProfileRow[]) || [],
          error: error ? { message: error.message } : null,
        };
      },
    });

    const rawItems = await fetchAllRowsInChunks<OrderItemRow>({
      ids: orderIds,
      chunkSize: ID_CHUNK_SIZE,
      queryBuilder: async (chunk, from, to) => {
        const { data, error } = await supabaseAdmin
          .from("order_items")
          .select(
            "id, order_id, product_id, quantity, unit_price, product_name, variant_name"
          )
          .in("order_id", chunk)
          .range(from, to);

        return {
          data: (data as OrderItemRow[]) || [],
          error: error ? { message: error.message } : null,
        };
      },
    });

    const productIds = Array.from(
      new Set(rawItems.map((item) => item.product_id).filter(Boolean))
    );

    const productsMap = new Map<string, ProductRow>();

    if (productIds.length > 0) {
      const productsData = await fetchAllRowsInChunks<ProductRow>({
        ids: productIds,
        chunkSize: 100,
        queryBuilder: async (chunk, from, to) => {
          const { data, error } = await supabaseAdmin
            .from("products")
            .select("id, name, description, category")
            .in("id", chunk)
            .range(from, to);

          return {
            data: (data as ProductRow[]) || [],
            error: error ? { message: error.message } : null,
          };
        },
      });

      productsData.forEach((product) => {
        productsMap.set(product.id, product);
      });
    }

    const rawLicenses = await fetchAllRowsInChunks<LicenseRow>({
      ids: orderIds,
      chunkSize: ID_CHUNK_SIZE,
      queryBuilder: async (chunk, from, to) => {
        const { data, error } = await supabaseAdmin
          .from("product_licenses")
          .select(
            "id, product_id, variant_id, license_text, status, assigned_order_id, assigned_order_item_id, assigned_user_id"
          )
          .in("assigned_order_id", chunk)
          .in("status", ["assigned", "disabled"])
          .range(from, to);

        return {
          data: (data as LicenseRow[]) || [],
          error: error ? { message: error.message } : null,
        };
      },
    });

    const profilesMap = new Map<string, CustomerProfileRow>();

    profilesData.forEach((profile) => {
      profilesMap.set(profile.id, profile);
    });

    const itemsByOrderId = new Map<string, OrderItemRow[]>();
    rawItems.forEach((item) => {
      const current = itemsByOrderId.get(item.order_id) || [];
      current.push(item);
      itemsByOrderId.set(item.order_id, current);
    });

    const licensesByOrderId = new Map<string, LicenseRow[]>();
    rawLicenses.forEach((license) => {
      if (!license.assigned_order_id) return;

      const current = licensesByOrderId.get(license.assigned_order_id) || [];
      current.push(license);
      licensesByOrderId.set(license.assigned_order_id, current);
    });

    const mergedOrders = rawOrders.map((order) => {
      const customer = profilesMap.get(order.user_id);
      const orderItems = itemsByOrderId.get(order.id) || [];
      const orderLicenses = licensesByOrderId.get(order.id) || [];

      const items = orderItems.map((item) => {
        const product = productsMap.get(item.product_id);

        const itemLicenses = orderLicenses.filter((license) => {
          if (license.assigned_order_item_id) {
            return license.assigned_order_item_id === item.id;
          }

          return license.product_id === item.product_id;
        });

        return {
          id: item.id,
          quantity: Number(item.quantity || 0),
          price: Number(item.unit_price || 0),
          product_id: item.product_id,
          product_name: item.product_name || product?.name || "Producto",
          variant_name: item.variant_name || null,
          product_description: product?.description || null,
          product_category: product?.category || null,
          licenses: itemLicenses.map((license) => ({
            id: license.id,
            license_text: license.license_text,
          })),
        };
      });

      return {
        id: order.id,
        order_number: order.order_number,
        total: Number(order.total || 0),
        status: order.status || "completed",
        created_at: order.created_at,
        customer_email: customer?.email || "Sin correo",
        customer_full_name: customer?.full_name || "Sin nombre",
        items,
      };
    });

    return NextResponse.json({
      ok: true,
      orders: mergedOrders,
      stats: {
        totalOrders: mergedOrders.length,
        totalRevenue: mergedOrders.reduce(
          (sum, order) => sum + Number(order.total || 0),
          0
        ),
        totalLicenses: mergedOrders.reduce((sum, order) => {
          return (
            sum +
            order.items.reduce(
              (itemAcc: number, item: { licenses: Array<unknown> }) =>
                itemAcc + item.licenses.length,
              0
            )
          );
        }, 0),
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      500
    );
  }
}
