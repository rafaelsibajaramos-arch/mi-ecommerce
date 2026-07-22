import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoryMode = "MONTH" | "DAY" | "ALL" | "RANGE";
type AnyRow = Record<string, unknown>;

type HistoryRow = {
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
  promotion_id: string | null;
  promotion_name: string | null;
  promotion_bonus_type: string | null;
  promotion_bonus_value: number | null;
  promotion_bonus_amount: number | null;
  promotion_total_amount: number | null;
  promotion_applied_at: string | null;
  email: string;
  full_name: string | null;
};

const TOPUP_SELECT = [
  "id",
  "user_id",
  "reference",
  "amount",
  "provider",
  "status",
  "payer_origin",
  "destination_account",
  "receipt_url",
  "matched_bank_payment_id",
  "matched_bank_reference",
  "admin_note",
  "error_message",
  "created_at",
  "approved_at",
  "credited_at",
  "executed_at",
  "delay_seconds",
  "rejected_at",
  "expired_at",
  "expiration_reason",
  "voided_at",
  "void_reason",
  "promotion_id",
  "promotion_name",
  "promotion_bonus_type",
  "promotion_bonus_value",
  "promotion_bonus_amount",
  "promotion_total_amount",
  "promotion_applied_at",
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

  if (profileError) throw new Error(`No se pudo validar el administrador: ${profileError.message}`);
  if (!profile || String((profile as { role?: string | null }).role || "") !== "admin") {
    throw new Error("No tienes permisos de administrador en la tabla profiles.");
  }

  return supabaseAdmin;
}

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getBogotaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    isoDate: `${values.year}-${values.month}-${values.day}`,
  };
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00-05:00`).getTime());
}

function startOfBogotaDay(dateInput: string) {
  return new Date(`${dateInput}T00:00:00.000-05:00`);
}

function nextBogotaDay(dateInput: string) {
  return new Date(startOfBogotaDay(dateInput).getTime() + 24 * 60 * 60 * 1000);
}

function resolvePeriod(mode: HistoryMode, requestedDay: string, requestedFrom: string, requestedTo: string) {
  const now = getBogotaDateParts();

  if (mode === "ALL") {
    return {
      fromIso: null as string | null,
      toIso: null as string | null,
      selectedDay: now.isoDate,
      label: "Histórico total",
    };
  }

  if (mode === "DAY") {
    const selectedDay = isValidDateInput(requestedDay) ? requestedDay : now.isoDate;
    return {
      fromIso: startOfBogotaDay(selectedDay).toISOString(),
      toIso: nextBogotaDay(selectedDay).toISOString(),
      selectedDay,
      label: `Día ${selectedDay}`,
    };
  }

  if (mode === "RANGE") {
    const validFrom = isValidDateInput(requestedFrom) ? requestedFrom : "";
    const validTo = isValidDateInput(requestedTo) ? requestedTo : "";

    if (!validFrom && !validTo) {
      return {
        fromIso: null as string | null,
        toIso: null as string | null,
        selectedDay: now.isoDate,
        label: "Histórico total",
      };
    }

    return {
      fromIso: validFrom ? startOfBogotaDay(validFrom).toISOString() : null,
      toIso: validTo ? nextBogotaDay(validTo).toISOString() : null,
      selectedDay: validTo || validFrom || now.isoDate,
      label:
        validFrom && validTo
          ? validFrom === validTo
            ? `Día ${validFrom}`
            : `Del ${validFrom} al ${validTo}`
          : validFrom
            ? `Desde ${validFrom}`
            : `Hasta ${validTo}`,
    };
  }

  const firstDay = `${now.year}-${now.month}-01`;
  return {
    fromIso: startOfBogotaDay(firstDay).toISOString(),
    toIso: nextBogotaDay(now.isoDate).toISOString(),
    selectedDay: now.isoDate,
    label: `Mes actual: del ${firstDay} al ${now.isoDate}`,
  };
}

function textValue(row: AnyRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function numberValue(row: AnyRow, key: string) {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalizeHistoryRow(row: AnyRow, profiles: Map<string, { email: string | null; full_name: string | null }>): HistoryRow {
  const userId = textValue(row, "user_id");
  const profile = userId ? profiles.get(userId) : null;

  return {
    id: String(row.id || ""),
    user_id: userId,
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
    promotion_id: textValue(row, "promotion_id"),
    promotion_name: textValue(row, "promotion_name"),
    promotion_bonus_type: textValue(row, "promotion_bonus_type"),
    promotion_bonus_value: numberValue(row, "promotion_bonus_value"),
    promotion_bonus_amount: numberValue(row, "promotion_bonus_amount"),
    promotion_total_amount: numberValue(row, "promotion_total_amount"),
    promotion_applied_at: textValue(row, "promotion_applied_at"),
    email: profile?.email || "Sin correo",
    full_name: profile?.full_name || null,
  };
}

function sanitizeSearch(value: string) {
  return value.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function applyAutomaticTopupFilter(query: any) {
  return query
    .is("voided_at", null)
    .neq("status", "VOIDED")
    .or(
      "provider.ilike.BREB%,reference.ilike.BREB-%,payer_origin.not.is.null,normalized_payer_origin.not.is.null,matched_bank_payment_id.not.is.null"
    );
}

function applyPeriodFilter(query: any, period: { fromIso: string | null; toIso: string | null }) {
  let next = query;
  if (period.fromIso) next = next.gte("created_at", period.fromIso);
  if (period.toIso) next = next.lt("created_at", period.toIso);
  return next;
}

function applyStatusFilter(query: any, status: string) {
  const normalized = status.trim().toUpperCase();
  if (!normalized || normalized === "ALL") return query;
  return query.eq("status", normalized);
}

function applySearchFilter(query: any, search: string, profileIds: string[]) {
  const term = sanitizeSearch(search);
  if (!term) return query;

  const clauses = [
    `reference.ilike.%${term}%`,
    `payer_origin.ilike.%${term}%`,
    `matched_bank_reference.ilike.%${term}%`,
  ];

  if (profileIds.length > 0) clauses.push(`user_id.in.(${profileIds.join(",")})`);
  return query.or(clauses.join(","));
}

async function findMatchingProfileIds(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, search: string) {
  const term = sanitizeSearch(search);
  if (!term) return [] as string[];

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
    .limit(250);

  if (error) return [] as string[];
  return ((data || []) as Array<{ id?: string | null }>).map((row) => String(row.id || "")).filter(Boolean);
}

function createBaseQuery(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  select: string,
  options?: { count?: "exact"; head?: boolean }
) {
  return applyAutomaticTopupFilter(supabaseAdmin.from("wallet_topups").select(select, options));
}

async function countRows(query: any) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function sumApprovedAmounts(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  period: { fromIso: string | null; toIso: string | null }
) {
  let aggregateQuery = createBaseQuery(supabaseAdmin, "amount.sum()")
    .eq("status", "APPROVED");
  aggregateQuery = applyPeriodFilter(aggregateQuery, period);

  const aggregateResult = await aggregateQuery.maybeSingle();
  if (!aggregateResult.error && aggregateResult.data) {
    const aggregateRow = aggregateResult.data as unknown as AnyRow;
    const sum = Number(aggregateRow.sum || 0);
    if (Number.isFinite(sum)) return sum;
  }

  let total = 0;
  let offset = 0;
  const chunkSize = 1000;

  while (offset < 100_000) {
    let chunkQuery = createBaseQuery(supabaseAdmin, "amount")
      .eq("status", "APPROVED")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunkSize - 1);
    chunkQuery = applyPeriodFilter(chunkQuery, period);

    const { data, error } = await chunkQuery;
    if (error) throw new Error(error.message);

    const rows = (data || []) as AnyRow[];
    total += rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (rows.length < chunkSize) break;
    offset += chunkSize;
  }

  return total;
}

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = await requireAdmin(request);
    const params = request.nextUrl.searchParams;

    const rawMode = String(params.get("mode") || "ALL").toUpperCase();
    const mode: HistoryMode =
      rawMode === "DAY" || rawMode === "MONTH" || rawMode === "RANGE" ? rawMode : "ALL";
    const page = clampInteger(params.get("page"), 1, 1, 1_000_000);
    const pageSize = clampInteger(params.get("pageSize"), 10, 5, 50);
    const status = String(params.get("status") || "ALL").trim().toUpperCase().slice(0, 30);
    const search = String(params.get("search") || "").trim().slice(0, 120);
    const period = resolvePeriod(
      mode,
      String(params.get("day") || "").trim(),
      String(params.get("from") || "").trim(),
      String(params.get("to") || "").trim()
    );
    const profileIds = await findMatchingProfileIds(supabaseAdmin, search);

    let pageQuery = createBaseQuery(supabaseAdmin, TOPUP_SELECT);
    pageQuery = applyPeriodFilter(pageQuery, period);
    pageQuery = applyStatusFilter(pageQuery, status);
    pageQuery = applySearchFilter(pageQuery, search, profileIds);
    pageQuery = pageQuery
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    let filteredCountQuery = createBaseQuery(supabaseAdmin, "id", { count: "exact", head: true });
    filteredCountQuery = applyPeriodFilter(filteredCountQuery, period);
    filteredCountQuery = applyStatusFilter(filteredCountQuery, status);
    filteredCountQuery = applySearchFilter(filteredCountQuery, search, profileIds);

    let periodCountQuery = createBaseQuery(supabaseAdmin, "id", { count: "exact", head: true });
    periodCountQuery = applyPeriodFilter(periodCountQuery, period);

    let approvedCountQuery = createBaseQuery(supabaseAdmin, "id", { count: "exact", head: true }).eq("status", "APPROVED");
    approvedCountQuery = applyPeriodFilter(approvedCountQuery, period);

    let pendingCountQuery = createBaseQuery(supabaseAdmin, "id", { count: "exact", head: true }).eq("status", "PENDING");
    pendingCountQuery = applyPeriodFilter(pendingCountQuery, period);

    const [pageResult, filteredCount, periodTotalCount, approvedCount, pendingCount, totalApprovedAmount] =
      await Promise.all([
        pageQuery,
        countRows(filteredCountQuery),
        countRows(periodCountQuery),
        countRows(approvedCountQuery),
        countRows(pendingCountQuery),
        sumApprovedAmounts(supabaseAdmin, period),
      ]);

    if (pageResult.error) throw new Error(pageResult.error.message);

    const rawRows = ((pageResult.data || []) as unknown) as AnyRow[];
    const userIds = Array.from(
      new Set(rawRows.map((row) => textValue(row, "user_id")).filter((value): value is string => Boolean(value)))
    );

    const profiles = new Map<string, { email: string | null; full_name: string | null }>();
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profilesError) throw new Error(profilesError.message);
      for (const row of (profileRows || []) as Array<{ id?: string | null; email?: string | null; full_name?: string | null }>) {
        const id = String(row.id || "");
        if (id) profiles.set(id, { email: row.email || null, full_name: row.full_name || null });
      }
    }

    return jsonOk({
      rows: rawRows.map((row) => normalizeHistoryRow(row, profiles)),
      filteredCount,
      periodTotalCount,
      approvedCount,
      pendingCount,
      totalApprovedAmount,
      page,
      pageSize,
      mode,
      selectedDay: period.selectedDay,
      periodLabel: period.label,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 500;
    return jsonError(`No se pudo cargar el histórico: ${message}`, status);
  }
}
