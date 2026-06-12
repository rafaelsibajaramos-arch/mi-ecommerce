import type { SupabaseClient } from "@supabase/supabase-js";
import { creditWalletTopup, getWalletTopupById, type WalletTopupRow } from "./walletTopups";

export type BankPaymentNotificationRow = {
  id: string;
  provider: string | null;
  sender_email: string | null;
  subject: string | null;
  transaction_reference: string;
  amount: number;
  currency: string | null;
  payer_origin: string;
  normalized_payer_origin: string;
  paid_at: string | null;
  raw_body: string | null;
  is_used: boolean | null;
  matched_topup_id: string | null;
  created_at?: string | null;
};

export function normalizePaymentOrigin(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z\s]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Verifica si todas las palabras del input del usuario están contenidas
 * en el nombre normalizado que llegó del banco.
 * Ej: "rafael sibaja" coincide con "RAFAEL ALBERTO SIBAJA RAMOS"
 */
function payerNamesMatch(userInput: string, bankValue: string): boolean {
  const normalizeForMatch = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^0-9A-Za-z\s]/g, "")
      .trim()
      .toUpperCase();

  const inputWords = normalizeForMatch(userInput)
    .split(/\s+/)
    .filter((w) => w.length > 1); // ignorar letras sueltas como "A"

  const bankNormalized = normalizeForMatch(bankValue);

  if (inputWords.length === 0) return false;

  // Todas las palabras del input deben aparecer en el nombre del banco
  return inputWords.every((word) => bankNormalized.includes(word));
}

export function buildBankTopupReference(userId: string) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BREB-${userId.slice(0, 8).toUpperCase()}-${Date.now()}-${random}`;
}

export async function findUnusedBankPaymentForTopup(
  supabaseAdmin: SupabaseClient,
  topup: WalletTopupRow
) {
  const userInput = String(topup.payer_origin || "").trim();

  if (!userInput) return null;

  // Traemos todos los pagos del mismo monto sin usar, sin filtrar por nombre exacto
  const { data, error } = await supabaseAdmin
    .from("bank_payment_notifications")
    .select(
      "id, provider, sender_email, subject, transaction_reference, amount, currency, payer_origin, normalized_payer_origin, paid_at, raw_body, is_used, matched_topup_id, created_at"
    )
    .eq("provider", "BREB_LLAVES")
    .eq("amount", Number(topup.amount || 0))
    .eq("is_used", false)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  // Filtramos en JS con coincidencia parcial de palabras
  const match = (data as BankPaymentNotificationRow[]).find((payment) =>
    payerNamesMatch(userInput, payment.payer_origin)
  );

  return match || null;
}

export async function approveTopupWithBankPayment({
  supabaseAdmin,
  topupId,
  bankPaymentId,
  approvedBy,
  manualNote,
}: {
  supabaseAdmin: SupabaseClient;
  topupId: string;
  bankPaymentId?: string | null;
  approvedBy?: string | null;
  manualNote?: string | null;
}) {
  const topup = await getWalletTopupById(supabaseAdmin, topupId);

  if (!topup) throw new Error("No se encontró la recarga.");

  const status = String(topup.status || "PENDING").toUpperCase();

  if (status === "APPROVED") return topup;
  if (status !== "PENDING") throw new Error("La recarga no está pendiente.");

  const now = new Date().toISOString();
  let matchedBankPaymentId = bankPaymentId || null;
  let matchedBankPaymentReference: string | null = null;

  if (matchedBankPaymentId) {
    const { data: lockedPayment, error: lockError } = await supabaseAdmin
      .from("bank_payment_notifications")
      .update({
        is_used: true,
        matched_topup_id: topup.id,
        used_at: now,
      })
      .eq("id", matchedBankPaymentId)
      .eq("is_used", false)
      .select("id, transaction_reference")
      .maybeSingle();

    if (lockError) throw new Error(lockError.message);
    if (!lockedPayment) throw new Error("Ese pago bancario ya fue usado por otra recarga.");

    matchedBankPaymentReference = String(lockedPayment.transaction_reference || "");
  }

  const patch: Record<string, unknown> = {
    provider: "BREB_LLAVES",
    status: "APPROVED",
    approved_at: topup.approved_at || now,
    rejected_at: null,
    error_message: null,
    matched_bank_payment_id: matchedBankPaymentId,
    matched_bank_reference: matchedBankPaymentReference,
    approved_by: approvedBy || null,
    admin_note: manualNote || topup.admin_note || null,
    updated_at: now,
  };

  const { data: updatedTopup, error: updateError } = await supabaseAdmin
    .from("wallet_topups")
    .update(patch)
    .eq("id", topup.id)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  await creditWalletTopup(supabaseAdmin, topup.id);

  return (updatedTopup as WalletTopupRow) || topup;
}

export async function tryAutoApproveBankTopup(
  supabaseAdmin: SupabaseClient,
  topupId: string
) {
  const topup = await getWalletTopupById(supabaseAdmin, topupId);
  if (!topup) throw new Error("No se encontró la recarga.");

  const bankPayment = await findUnusedBankPaymentForTopup(supabaseAdmin, topup);

  if (!bankPayment) return topup;

  return approveTopupWithBankPayment({
    supabaseAdmin,
    topupId: topup.id,
    bankPaymentId: bankPayment.id,
  });
}