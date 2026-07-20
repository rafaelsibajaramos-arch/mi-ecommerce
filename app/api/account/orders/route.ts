import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  order_number: number | null;
  user_id: string;
  total: number | null;
  status: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number | null;
  unit_price: number | null;
  product_name: string | null;
  variant_name: string | null;
};

type LicenseRow = {
  id: string;
  product_id: string;
  license_text: string;
  assigned_order_id: string | null;
  assigned_order_item_id: string | null;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function startIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000-05:00`).toISOString()
    : null;
}

function endIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999-05:00`).toISOString()
    : null;
}

export async function GET(request: NextRequest) {
  try {
    const token = bearer(request);
    if (!token) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });

    const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(1, Math.min(20, Number(params.get("pageSize") || 10)));
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const fromIso = from ? startIso(from) : null;
    const toIso = to ? endIso(to) : null;
    const includeSummary = params.get("includeSummary") !== "false";
    const offset = (page - 1) * pageSize;

    let pageQuery = supabase
      .from("orders")
      .select("id, order_number, user_id, total, status, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .eq("is_reverted", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    let totalsQuery = includeSummary
      ? supabase
          .from("orders")
          .select("total")
          .eq("user_id", user.id)
          .eq("is_reverted", false)
          .limit(1500)
      : null;

    if (fromIso) {
      pageQuery = pageQuery.gte("created_at", fromIso);
      if (totalsQuery) totalsQuery = totalsQuery.gte("created_at", fromIso);
    }
    if (toIso) {
      pageQuery = pageQuery.lte("created_at", toIso);
      if (totalsQuery) totalsQuery = totalsQuery.lte("created_at", toIso);
    }

    const [pageResult, totalsResult] = await Promise.all([
      pageQuery,
      totalsQuery || Promise.resolve({ data: null, error: null }),
    ]);
    if (pageResult.error) throw new Error(pageResult.error.message);
    if (totalsResult.error) throw new Error(totalsResult.error.message);

    const orders = (pageResult.data || []) as OrderRow[];
    const orderIds = orders.map((order) => order.id);
    let items: ItemRow[] = [];
    let licenses: LicenseRow[] = [];
    const productMap = new Map<string, { name: string; description: string | null; category: string | null }>();

    if (orderIds.length > 0) {
      const [itemsResult, licensesResult] = await Promise.all([
        supabase
          .from("order_items")
          .select("id, order_id, product_id, quantity, unit_price, product_name, variant_name")
          .in("order_id", orderIds),
        supabase
          .from("product_licenses")
          .select("id, product_id, license_text, assigned_order_id, assigned_order_item_id")
          .in("assigned_order_id", orderIds)
          .eq("assigned_user_id", user.id)
          .eq("status", "assigned"),
      ]);

      if (itemsResult.error) throw new Error(itemsResult.error.message);
      if (licensesResult.error) throw new Error(licensesResult.error.message);
      items = (itemsResult.data || []) as ItemRow[];
      licenses = (licensesResult.data || []) as LicenseRow[];

      const productIds = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean)));
      if (productIds.length > 0) {
        const productsResult = await supabase
          .from("products")
          .select("id, name, description, category")
          .in("id", productIds);
        if (!productsResult.error) {
          (productsResult.data || []).forEach((product) => productMap.set(String(product.id), {
            name: String(product.name || "Producto"),
            description: product.description ? String(product.description) : null,
            category: product.category ? String(product.category) : null,
          }));
        }
      }
    }

    const resultOrders = orders.map((order) => ({
      id: order.id,
      order_number: order.order_number,
      total: Number(order.total || 0),
      status: order.status || "completed",
      created_at: order.created_at,
      items: items
        .filter((item) => item.order_id === order.id)
        .map((item) => {
          const product = productMap.get(item.product_id);
          return {
            id: item.id,
            quantity: Number(item.quantity || 0),
            price: Number(item.unit_price || 0),
            product_id: item.product_id,
            product_name: item.product_name || product?.name || "Producto",
            variant_name: item.variant_name || null,
            product_description: product?.description || null,
            product_category: product?.category || null,
            licenses: licenses
              .filter((license) =>
                license.assigned_order_item_id
                  ? license.assigned_order_item_id === item.id
                  : license.assigned_order_id === order.id && license.product_id === item.product_id
              )
              .map((license) => ({ id: license.id, license_text: license.license_text })),
          };
        }),
    }));

    const total = Number(pageResult.count || 0);
    const invested = includeSummary
      ? (totalsResult.data || []).reduce(
          (sum, row) => sum + Number((row as { total?: number | null }).total || 0),
          0
        )
      : null;

    return NextResponse.json(
      {
        ok: true,
        orders: resultOrders,
        summary: { totalOrders: total, totalInvested: invested },
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudieron cargar los pedidos." },
      { status: 500 }
    );
  }
}
