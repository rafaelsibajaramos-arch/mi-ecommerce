import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

type BankPaymentRow = {
  id: string;
  provider: string | null;
  sender_email: string | null;
  subject: string | null;
  transaction_reference: string | null;
  amount: number | null;
  currency: string | null;
  payer_origin: string | null;
  normalized_payer_origin: string | null;
  paid_at: string | null;
  raw_body: string | null;
  is_used: boolean | null;
  matched_topup_id: string | null;
  used_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const BANK_PAYMENT_SELECT = [
  "id",
  "provider",
  "sender_email",
  "subject",
  "transaction_reference",
  "amount",
  "currency",
  "payer_origin",
  "normalized_payer_origin",
  "paid_at",
  "is_used",
  "matched_topup_id",
  "used_at",
  "created_at",
  "updated_at",
].join(", ");

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function jsonOk(payload: Record<string, unknown>) {
  return NextResponse.json(
    { ok: true, ...payload },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Falta la variable de entorno ${name}`);
  return value.trim();
}

function createSupabaseUserClientFromToken(token: string) {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function requireAdmin(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) throw new Error("No autorizado: la pantalla no envió token de sesión al API.");

  const supabaseAuth = createSupabaseUserClientFromToken(token);
  const supabaseAdmin = createSupabaseAdmin();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    throw new Error(`Sesión inválida: ${authError?.message || "no se encontró usuario"}.`);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`No se pudo validar el administrador: ${profileError.message}`);
  }

  if (!profile || String((profile as { role?: string | null }).role || "") !== "admin") {
    throw new Error("No tienes permisos de administrador en la tabla profiles.");
  }

  return { supabaseAdmin };
}

function textValue(row: AnyRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function boolValue(row: AnyRow, key: string) {
  const value = row[key];
  return typeof value === "boolean" ? value : null;
}

function numberValue(row: AnyRow, key: string) {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalizeBankPayment(row: AnyRow): BankPaymentRow {
  return {
    id: String(row.id || ""),
    provider: textValue(row, "provider"),
    sender_email: textValue(row, "sender_email"),
    subject: textValue(row, "subject"),
    transaction_reference: textValue(row, "transaction_reference"),
    amount: numberValue(row, "amount"),
    currency: textValue(row, "currency"),
    payer_origin: textValue(row, "payer_origin"),
    normalized_payer_origin: textValue(row, "normalized_payer_origin"),
    paid_at: textValue(row, "paid_at"),
    raw_body: null,
    is_used: boolValue(row, "is_used") ?? false,
    matched_topup_id: textValue(row, "matched_topup_id"),
    used_at: textValue(row, "used_at"),
    created_at: textValue(row, "created_at"),
    updated_at: textValue(row, "updated_at"),
  };
}

function sortByNewest(a: { paid_at?: string | null; created_at?: string | null }, b: { paid_at?: string | null; created_at?: string | null }) {
  const aDate = new Date(a.paid_at || a.created_at || 0).getTime();
  const bDate = new Date(b.paid_at || b.created_at || 0).getTime();
  return bDate - aDate;
}

async function loadBankPayments(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
  const { data, error } = await supabaseAdmin
    .from("bank_payment_notifications")
    .select(BANK_PAYMENT_SELECT)
    .eq("is_used", false)
    .is("matched_topup_id", null)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    throw new Error(`No se pudieron cargar los pagos del banco: ${error.message}`);
  }

  return ((((data || []) as unknown) as AnyRow[]).map(normalizeBankPayment).sort(sortByNewest).slice(0, 150));
}


function getBogotaTodayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  const start = new Date(`${date}T00:00:00.000-05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    date,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

async function loadBankHistoryToday(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
  const range = getBogotaTodayRange();
  const { data, error } = await supabaseAdmin
    .from("bank_payment_notifications")
    .select(BANK_PAYMENT_SELECT)
    .gte("created_at", range.startIso)
    .lt("created_at", range.endIso)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`No se pudo cargar el historial del banco de hoy: ${error.message}`);
  }

  return {
    date: range.date,
    rows: ((((data || []) as unknown) as AnyRow[]).map(normalizeBankPayment).sort(sortByNewest)),
  };
}

async function loadAlerts(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, partialErrors: string[]) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topup_alerts")
    .select("id, topup_id, reference, amount, provider, requested_at, executed_at, delay_seconds, customer_name, customer_email, executed_by, reason, message, status, reviewed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    partialErrors.push(`wallet_topup_alerts: ${error.message}`);
    return [];
  }

  return data || [];
}

export async function GET(request: NextRequest) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const partialErrors: string[] = [];

    const [bankPayments, bankHistoryToday, alerts] = await Promise.all([
      loadBankPayments(supabaseAdmin),
      loadBankHistoryToday(supabaseAdmin),
      loadAlerts(supabaseAdmin, partialErrors),
    ]);

    return jsonOk({
      alerts,
      bankPayments,
      bankHistoryToday: bankHistoryToday.rows,
      bankHistoryDate: bankHistoryToday.date,
      partialErrors,
      counts: {
        alerts: alerts.length,
        bankPayments: bankPayments.length,
        availableBankPayments: bankPayments.length,
        bankHistoryToday: bankHistoryToday.rows.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 500;
    return jsonError(message, status);
  }
}
