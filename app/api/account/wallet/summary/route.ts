import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransactionRow = {
  id: string;
  type: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
};

type FilterType = "all" | "credit" | "debit";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function transactionKind(tx: TransactionRow): "credit" | "debit" {
  const txType = String(tx.type || "").toLowerCase().trim();
  const note = String(tx.note || "").toLowerCase().trim();

  if (
    txType === "credit" ||
    txType.includes("credito") ||
    txType.includes("crédito") ||
    txType.includes("deposit") ||
    txType.includes("depósito") ||
    txType.includes("recarga")
  ) {
    return "credit";
  }

  if (
    note.includes("compra") ||
    note.includes("pedido") ||
    txType === "purchase" ||
    txType === "order" ||
    txType === "debit" ||
    txType.includes("debito") ||
    txType.includes("débito")
  ) {
    return "debit";
  }

  return "debit";
}

function startIso(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T00:00:00.000-05:00`).toISOString();
}

function endIso(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T23:59:59.999-05:00`).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const token = bearer(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
    }

    const supabase = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const filter = (params.get("filter") || "all") as FilterType;
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(1, Math.min(25, Number(params.get("pageSize") || 8)));
    const fromIso = startIso(from);
    const toIso = endIso(to);

    if (!fromIso || !toIso || from > to) {
      return NextResponse.json({ ok: false, error: "El rango de fechas no es válido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, type, amount, note, created_at")
      .eq("user_id", user.id)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(1500);

    if (error) throw new Error(error.message);

    const rows = (data || []) as TransactionRow[];
    let sales = 0;
    let credits = 0;
    let creditCount = 0;

    rows.forEach((tx) => {
      const amount = Math.abs(Number(tx.amount || 0));
      if (transactionKind(tx) === "credit") {
        credits += amount;
        creditCount += 1;
      } else {
        sales += amount;
      }
    });

    const filtered = filter === "all" ? rows : rows.filter((tx) => transactionKind(tx) === filter);
    const total = filtered.length;
    const start = (page - 1) * pageSize;

    return NextResponse.json(
      {
        ok: true,
        transactions: filtered.slice(start, start + pageSize),
        totals: {
          sales,
          credits,
          creditCount,
          transactionCount: rows.length,
        },
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudo cargar la billetera." },
      { status: 500 }
    );
  }
}
