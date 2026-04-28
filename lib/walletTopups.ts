import type { SupabaseClient } from "@supabase/supabase-js";
import type { WompiTransactionSummary } from "./wompi";

export type WalletTopupRow = {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  amount_in_cents: number;
  currency: string;
  provider: string | null;
  status: string | null;
  wompi_transaction_id: string | null;
  wompi_status: string | null;
  wompi_payment_method_type: string | null;
  error_message: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  credited_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SELECT_TOPUP =
  "id, user_id, reference, amount, amount_in_cents, currency, provider, status, wompi_transaction_id, wompi_status, wompi_payment_method_type, error_message, approved_at, rejected_at, credited_at, created_at, updated_at";

export function normalizeTopupStatus(status: string | null | undefined) {
  return String(status || "PENDING").trim().toUpperCase();
}

export function assertWompiTransactionMatchesTopup({
  topup,
  transaction,
}: {
  topup: WalletTopupRow;
  transaction: WompiTransactionSummary;
}) {
  if (transaction.reference !== topup.reference) {
    throw new Error("La referencia de Wompi no coincide con la recarga.");
  }

  if (Number(transaction.amount_in_cents) !== Number(topup.amount_in_cents)) {
    throw new Error("El valor pagado en Wompi no coincide con la recarga.");
  }

  if (String(transaction.currency).toUpperCase() !== String(topup.currency).toUpperCase()) {
    throw new Error("La moneda de Wompi no coincide con la recarga.");
  }
}

export async function getWalletTopupByReference(
  supabaseAdmin: SupabaseClient,
  reference: string
) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .select(SELECT_TOPUP)
    .eq("reference", reference)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as WalletTopupRow | null) || null;
}

export async function getWalletTopupById(
  supabaseAdmin: SupabaseClient,
  topupId: string
) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .select(SELECT_TOPUP)
    .eq("id", topupId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as WalletTopupRow | null) || null;
}

export async function upsertTopupTransactionState({
  supabaseAdmin,
  topup,
  transaction,
}: {
  supabaseAdmin: SupabaseClient;
  topup: WalletTopupRow;
  transaction: WompiTransactionSummary;
}) {
  assertWompiTransactionMatchesTopup({ topup, transaction });

  const normalizedStatus = normalizeTopupStatus(transaction.status);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    wompi_transaction_id: transaction.id,
    wompi_status: normalizedStatus,
    wompi_payment_method_type: transaction.payment_method_type,
    status: normalizedStatus,
    error_message: transaction.status_message || null,
    updated_at: now,
  };

  if (normalizedStatus === "APPROVED") {
    patch.approved_at = topup.approved_at || now;
    patch.rejected_at = null;
  }

  if (["DECLINED", "VOIDED", "ERROR"].includes(normalizedStatus)) {
    patch.rejected_at = topup.rejected_at || now;
  }

  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .update(patch)
    .eq("id", topup.id)
    .select(SELECT_TOPUP)
    .single();

  if (error) throw new Error(error.message);

  return data as WalletTopupRow;
}

async function ensureWalletTransactionForTopup(
  supabaseAdmin: SupabaseClient,
  topup: WalletTopupRow
) {
  if (!topup?.id || !topup.user_id || !topup.reference) return;

  const referenceText = `%${topup.reference}%`;

  const { data: existingRows, error: findError } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id")
    .eq("user_id", topup.user_id)
    .eq("type", "credit")
    .eq("amount", Number(topup.amount || 0))
    .or(`description.ilike.${referenceText},note.ilike.${referenceText}`)
    .limit(1);

  if (findError) throw new Error(findError.message);

  if (existingRows && existingRows.length > 0) return;

  const label = `Recarga automática Wompi (${topup.reference})`;

  const { error: insertError } = await supabaseAdmin
    .from("wallet_transactions")
    .insert({
      user_id: topup.user_id,
      type: "credit",
      amount: Number(topup.amount || 0),
      note: label,
      description: label,
    });

  if (insertError) throw new Error(insertError.message);
}

export async function creditWalletTopup(
  supabaseAdmin: SupabaseClient,
  topupId: string
) {
  const { error } = await supabaseAdmin.rpc("credit_wallet_topup", {
    p_topup_id: topupId,
  });

  if (error) throw new Error(error.message);

  const creditedTopup = await getWalletTopupById(supabaseAdmin, topupId);

  if (creditedTopup && normalizeTopupStatus(creditedTopup.status) === "APPROVED") {
    await ensureWalletTransactionForTopup(supabaseAdmin, creditedTopup);
  }
}
