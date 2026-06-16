import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type TopupRow = {
  id: string;
  user_id: string | null;
  reference: string | null;
  amount: number | null;
  provider: string | null;
  status: string | null;
  payer_origin: string | null;
  destination_account: string | null;
  receipt_url: string | null;
  matched_bank_payment_id: string | null;
  matched_bank_reference: string | null;
  admin_note: string | null;
  error_message: string | null;
  created_at: string | null;
  approved_at: string | null;
  credited_at: string | null;
  executed_at: string | null;
  delay_seconds: number | null;
  rejected_at: string | null;
  expired_at: string | null;
  expiration_reason: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

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
  "raw_body",
  "is_used",
  "matched_topup_id",
  "used_at",
  "created_at",
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

function isBrebTopup(row: AnyRow) {
  const status = String(row.status || "").trim().toUpperCase();
  if (status === "VOIDED" || row.voided_at) return false;

  const provider = String(row.provider || "").trim().toUpperCase();
  const reference = String(row.reference || "").trim().toUpperCase();

  return (
    provider === "BREB_LLAVES" ||
    provider === "BREB" ||
    reference.startsWith("BREB-") ||
    Boolean(row.payer_origin) ||
    Boolean(row.normalized_payer_origin) ||
    Boolean(row.matched_bank_payment_id)
  );
}

function normalizeTopup(row: AnyRow): TopupRow {
  return {
    id: String(row.id || ""),
    user_id: textValue(row, "user_id"),
    reference: textValue(row, "reference"),
    amount: numberValue(row, "amount"),
    provider: textValue(row, "provider"),
    status: textValue(row, "status"),
    payer_origin: textValue(row, "payer_origin"),
    destination_account: textValue(row, "destination_account"),
    receipt_url: textValue(row, "receipt_url"),
    matched_bank_payment_id: textValue(row, "matched_bank_payment_id"),
    matched_bank_reference: textValue(row, "matched_bank_reference"),
    admin_note: textValue(row, "admin_note"),
    error_message: textValue(row, "error_message"),
    created_at: textValue(row, "created_at"),
    approved_at: textValue(row, "approved_at"),
    credited_at: textValue(row, "credited_at"),
    executed_at: textValue(row, "executed_at"),
    delay_seconds: numberValue(row, "delay_seconds"),
    rejected_at: textValue(row, "rejected_at"),
    expired_at: textValue(row, "expired_at"),
    expiration_reason: textValue(row, "expiration_reason"),
    voided_at: textValue(row, "voided_at"),
    void_reason: textValue(row, "void_reason"),
  };
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
    raw_body: textValue(row, "raw_body"),
    is_used: boolValue(row, "is_used") ?? false,
    matched_topup_id: textValue(row, "matched_topup_id"),
    used_at: textValue(row, "used_at"),
    created_at: textValue(row, "created_at"),
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
    .limit(1000);

  if (error) {
    throw new Error(`No se pudieron cargar los pagos del banco: ${error.message}`);
  }

  return ((((data || []) as unknown) as AnyRow[]).map(normalizeBankPayment).sort(sortByNewest).slice(0, 500));
}

async function loadTopups(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, partialErrors: string[]) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    partialErrors.push(`wallet_topups: ${error.message}`);
    return [] as Array<TopupRow & { email: string; full_name: string | null }>;
  }

  const rawTopups = ((((data || []) as unknown) as AnyRow[]).filter(isBrebTopup).map(normalizeTopup));
  const userIds = Array.from(new Set(rawTopups.map((topup) => topup.user_id).filter(Boolean))) as string[];
  let profilesData: ProfileRow[] = [];

  if (userIds.length > 0) {
    const profilesRes = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profilesRes.error) {
      partialErrors.push(`profiles: ${profilesRes.error.message}`);
    } else {
      profilesData = (profilesRes.data as ProfileRow[]) || [];
    }
  }

  const profileMap = new Map<string, ProfileRow>();
  profilesData.forEach((profile) => profileMap.set(profile.id, profile));

  return rawTopups.map((topup) => {
    const profile = topup.user_id ? profileMap.get(topup.user_id) : null;

    return {
      ...topup,
      email: profile?.email || "Sin correo",
      full_name: profile?.full_name || null,
    };
  });
}

async function loadAlerts(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, partialErrors: string[]) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topup_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

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

    const bankPayments = await loadBankPayments(supabaseAdmin);
    const [topups, alerts] = await Promise.all([
      loadTopups(supabaseAdmin, partialErrors),
      loadAlerts(supabaseAdmin, partialErrors),
    ]);

    return jsonOk({
      topups,
      alerts,
      bankPayments,
      partialErrors,
      counts: {
        topups: topups.length,
        alerts: alerts.length,
        bankPayments: bankPayments.length,
        availableBankPayments: bankPayments.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 500;
    return jsonError(message, status);
  }
}
