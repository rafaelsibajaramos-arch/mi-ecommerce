import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  order_number: number | null;
  user_id: string;
  total: number | null;
  status: string | null;
  created_at: string;
  is_reverted: boolean | null;
  reverted_at: string | null;
  reverted_by: string | null;
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

function tokenFrom(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

async function requireAdmin(request: NextRequest) {
  const token = tokenFrom(request);
  if (!token) throw new Error("UNAUTHORIZED");

  const authClient = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");

  const profile = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "admin") throw new Error("FORBIDDEN");
  return admin;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudieron cargar los pedidos.";
  if (message === "UNAUTHORIZED") return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  if (message === "FORBIDDEN") return NextResponse.json({ ok: false, error: "No tienes permisos." }, { status: 403 });
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(1, Math.min(25, Number(params.get("pageSize") || 10)));
    const status = (params.get("status") || "ACTIVE").toUpperCase();
    const search = (params.get("search") || "").trim();
    const includeStats = params.get("includeStats") !== "false";
    const offset = (page - 1) * pageSize;

    let userIds: string[] = [];
    if (search && !/^\d+$/.test(search)) {
      const clean = search.replace(/[%(),]/g, "").slice(0, 80);
      const profileResult = await admin
        .from("profiles")
        .select("id")
        .or(`email.ilike.%${clean}%,full_name.ilike.%${clean}%`)
        .limit(100);
      if (!profileResult.error) userIds = (profileResult.data || []).map((row) => String(row.id));
    }

    let query = admin
      .from("orders")
      .select("id, order_number, user_id, total, status, created_at, is_reverted, reverted_at, reverted_by", { count: "exact" })
      .order("created_at", { ascending: false });

    let statsQuery = admin
      .from("orders")
      .select("total, is_reverted")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (status === "ACTIVE") {
      query = query.eq("is_reverted", false);
      statsQuery = statsQuery.eq("is_reverted", false);
    } else if (status === "REVERTED") {
      query = query.eq("is_reverted", true);
      statsQuery = statsQuery.eq("is_reverted", true);
    }

    if (search) {
      const orFilters: string[] = [];
      if (/^\d+$/.test(search)) orFilters.push(`order_number.eq.${Number(search)}`);
      if (userIds.length > 0) orFilters.push(`user_id.in.(${userIds.join(",")})`);

      if (orFilters.length === 0) {
        return NextResponse.json({
          ok: true,
          orders: [],
          stats: { totalOrders: 0, totalRevenue: 0, totalLicenses: 0 },
          pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
        });
      }

      query = query.or(orFilters.join(","));
      statsQuery = statsQuery.or(orFilters.join(","));
    }

    const [ordersResult, statsResult] = await Promise.all([
      query.range(offset, offset + pageSize - 1),
      includeStats ? statsQuery : Promise.resolve({ data: null, error: null }),
    ]);

    if (ordersResult.error) throw new Error(ordersResult.error.message);
    if (statsResult.error) throw new Error(statsResult.error.message);

    const orders = (ordersResult.data || []) as OrderRow[];
    const orderIds = orders.map((order) => order.id);
    const userIdsOnPage = Array.from(new Set(orders.map((order) => order.user_id)));

    const [profilesResult, itemsResult, licensesResult, reversalsResult] = await Promise.all([
      userIdsOnPage.length
        ? admin.from("profiles").select("id, email, full_name").in("id", userIdsOnPage)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? admin.from("order_items").select("id, order_id, product_id, quantity, unit_price, product_name, variant_name").in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? admin
            .from("product_licenses")
            .select("id, product_id, license_text, assigned_order_id, assigned_order_item_id")
            .in("assigned_order_id", orderIds)
            .in("status", ["assigned", "disabled"])
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? admin.from("order_reversals").select("order_id, released_license_ids").in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    if (licensesResult.error) throw new Error(licensesResult.error.message);

    const profiles = new Map(
      (profilesResult.data || []).map((row) => [String(row.id), {
        email: String(row.email || "Sin correo"),
        fullName: String(row.full_name || "Sin nombre"),
      }])
    );
    const items = (itemsResult.data || []) as ItemRow[];
    const licenses = (licensesResult.data || []) as LicenseRow[];
    const reversals = new Map(
      (reversalsResult.data || []).map((row) => [String(row.order_id), Array.isArray(row.released_license_ids) ? row.released_license_ids.length : 0])
    );

    const merged = orders.map((order) => {
      const customer = profiles.get(order.user_id);
      const orderItems = items.filter((item) => item.order_id === order.id);
      const orderLicenses = licenses.filter((license) => license.assigned_order_id === order.id);

      return {
        id: order.id,
        order_number: order.order_number,
        total: Number(order.total || 0),
        status: order.is_reverted ? "reverted" : order.status || "completed",
        created_at: order.created_at,
        is_reverted: Boolean(order.is_reverted),
        reverted_at: order.reverted_at,
        reverted_by: order.reverted_by,
        released_license_count: Number(reversals.get(order.id) || 0),
        customer_email: customer?.email || "Sin correo",
        customer_full_name: customer?.fullName || "Sin nombre",
        items: orderItems.map((item) => ({
          id: item.id,
          quantity: Number(item.quantity || 0),
          price: Number(item.unit_price || 0),
          product_id: item.product_id,
          product_name: item.product_name || "Producto",
          variant_name: item.variant_name || null,
          product_description: null,
          product_category: null,
          licenses: orderLicenses
            .filter((license) =>
              license.assigned_order_item_id
                ? license.assigned_order_item_id === item.id
                : license.product_id === item.product_id
            )
            .map((license) => ({ id: license.id, license_text: license.license_text })),
        })),
      };
    });

    const total = Number(ordersResult.count || 0);
    const revenue = includeStats
      ? (statsResult.data || []).reduce((sum, row) => sum + Number((row as { total?: number | null }).total || 0), 0)
      : null;
    const pageLicenses = merged.reduce(
      (sum, order) => sum + (order.is_reverted ? order.released_license_count : order.items.reduce((itemSum, item) => itemSum + item.licenses.length, 0)),
      0
    );

    return NextResponse.json(
      {
        ok: true,
        orders: merged,
        stats: { totalOrders: total, totalRevenue: revenue, totalLicenses: pageLicenses },
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
