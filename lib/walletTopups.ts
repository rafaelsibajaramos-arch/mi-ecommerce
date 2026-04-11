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

export function normalizeTopupStatus(status: string | null | undefined) {
  return String(status || "PENDING").trim().toUpperCase();
}

export async function getWalletTopupByReference(
  supabaseAdmin: SupabaseClient,
  reference: string
) {
  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .select(
      "id, user_id, reference, amount, amount_in_cents, currency, provider, status, wompi_transaction_id, wompi_status, wompi_payment_method_type, error_message, approved_at, rejected_at, credited_at, created_at, updated_at"
    )
    .eq("reference", reference)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

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
  }

  if (
    normalizedStatus === "DECLINED" ||
    normalizedStatus === "VOIDED" ||
    normalizedStatus === "ERROR"
  ) {
    patch.rejected_at = topup.rejected_at || now;
  }

  const { data, error } = await supabaseAdmin
    .from("wallet_topups")
    .update(patch)
    .eq("id", topup.id)
    .select(
      "id, user_id, reference, amount, amount_in_cents, currency, provider, status, wompi_transaction_id, wompi_status, wompi_payment_method_type, error_message, approved_at, rejected_at, credited_at, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as WalletTopupRow;
}

export async function creditWalletTopup(
  supabaseAdmin: SupabaseClient,
  topupId: string
) {
  const { error } = await supabaseAdmin.rpc("credit_wallet_topup", {
    p_topup_id: topupId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
