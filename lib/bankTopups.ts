import type { SupabaseClient } from "@supabase/supabase-js";
import { creditWalletTopup, getWalletTopupById, type WalletTopupRow } from "./walletTopups";
import { buildPromotionTopupPatch, findActiveTopupPromotion } from "./topupPromotions";

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

const NAME_PARTICLES_TO_IGNORE = new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "LOS",
  "Y",
  "E",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "VAN",
  "VON",
]);

function normalizeNameForMatch(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function uniqueNameTokens(value: string) {
  const seen = new Set<string>();

  return normalizeNameForMatch(value)
    .split(" ")
    .filter((word) => word.length > 1 && !NAME_PARTICLES_TO_IGNORE.has(word))
    .filter((word) => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    });
}

function areAllTokensContained(shorterNameTokens: string[], longerNameTokens: string[]) {
  const longerNameTokenSet = new Set(longerNameTokens);
  return shorterNameTokens.every((word) => longerNameTokenSet.has(word));
}

/**
 * Verifica si el nombre escrito por el cliente y el nombre reportado por el banco
 * parecen pertenecer a la misma persona, incluso cuando uno viene más completo que el otro.
 *
 * Ejemplos válidos:
 * - "Iris Lua" coincide con "Iris Daniela Lua Arroyo".
 * - "Iris Daniela Lua Arroyo" coincide con "Iris Lua".
 * - "María de la Cruz" coincide con "Maria Cruz".
 *
 * Para evitar aprobaciones inseguras, no se aprueban coincidencias automáticas con
 * una sola palabra suelta, salvo que el nombre compacto sea exactamente igual.
 */
export function payerNamesMatch(userInput: string, bankValue: string): boolean {
  const normalizedUser = normalizeNameForMatch(userInput);
  const normalizedBank = normalizeNameForMatch(bankValue);

  if (!normalizedUser || !normalizedBank) return false;

  const compactUser = normalizedUser.replace(/\s/g, "");
  const compactBank = normalizedBank.replace(/\s/g, "");

  if (compactUser && compactUser === compactBank) return true;

  const userTokens = uniqueNameTokens(userInput);
  const bankTokens = uniqueNameTokens(bankValue);

  if (userTokens.length === 0 || bankTokens.length === 0) return false;

  const [shorterNameTokens, longerNameTokens] =
    userTokens.length <= bankTokens.length ? [userTokens, bankTokens] : [bankTokens, userTokens];

  if (shorterNameTokens.length < 2) return false;

  return areAllTokensContained(shorterNameTokens, longerNameTokens);
}

export function buildBankTopupReference(userId: string) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BREB-${userId.slice(0, 8).toUpperCase()}-${Date.now()}-${random}`;
}

function calculateDelaySeconds(requestedAt: string | null | undefined, executedAt: string) {
  if (!requestedAt) return 0;

  const requestedMs = new Date(requestedAt).getTime();
  const executedMs = new Date(executedAt).getTime();

  if (!Number.isFinite(requestedMs) || !Number.isFinite(executedMs)) return 0;

  return Math.max(0, Math.round((executedMs - requestedMs) / 1000));
}

async function saveTopupExecutionTelemetry({
  supabaseAdmin,
  topupId,
  executedAt,
  delaySeconds,
}: {
  supabaseAdmin: SupabaseClient;
  topupId: string;
  executedAt: string;
  delaySeconds: number;
}) {
  const { error } = await supabaseAdmin
    .from("wallet_topups")
    .update({
      executed_at: executedAt,
      delay_seconds: delaySeconds,
      updated_at: executedAt,
    })
    .eq("id", topupId);

  if (error) {
    // Si la BD aún no tiene estas columnas, no bloqueamos la aprobación.
    console.warn("No se pudo guardar telemetría de recarga:", error.message);
  }
}

async function createDelayedTopupAlertIfNeeded({
  supabaseAdmin,
  topup,
  executedAt,
  delaySeconds,
  executedBy,
}: {
  supabaseAdmin: SupabaseClient;
  topup: WalletTopupRow;
  executedAt: string;
  delaySeconds: number;
  executedBy?: string | null;
}) {
  if (delaySeconds <= 300) return;

  const { data: existingAlert, error: existingError } = await supabaseAdmin
    .from("wallet_topup_alerts")
    .select("id")
    .eq("topup_id", topup.id)
    .maybeSingle();

  if (existingError) {
    console.warn("No se pudo verificar alerta de recarga:", existingError.message);
    return;
  }

  if (existingAlert) return;

  let customerName: string | null = null;
  let customerEmail: string | null = null;

  if (topup.user_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", topup.user_id)
      .maybeSingle();

    customerName = String((profile as { full_name?: string | null } | null)?.full_name || topup.payer_origin || "");
    customerEmail = String((profile as { email?: string | null } | null)?.email || "");
  }

  const message = [
    "Recarga automática aprobada con demora mayor a 5 minutos.",
    `Referencia: ${topup.reference}`,
    `Monto: ${Number(topup.amount || 0).toLocaleString("es-CO")}`,
    `Solicitada: ${topup.created_at || "sin fecha"}`,
    `Aprobada: ${executedAt}`,
    `Demora: ${Math.round(delaySeconds / 60)} minuto(s).`,
    "Revisar si soporte ya había hecho una recarga manual para evitar doble abono.",
  ].join("\n");

  const { error } = await supabaseAdmin.from("wallet_topup_alerts").insert({
    topup_id: topup.id,
    reference: topup.reference,
    amount: Number(topup.amount || 0),
    provider: topup.provider || "BREB_LLAVES",
    requested_at: topup.created_at || null,
    executed_at: executedAt,
    delay_seconds: delaySeconds,
    customer_name: customerName || topup.payer_origin || null,
    customer_email: customerEmail || null,
    executed_by: executedBy || null,
    reason: "DELAYED_AUTO_APPROVAL",
    message,
    status: "OPEN",
  });

  if (error) {
    console.warn("No se pudo crear alerta de recarga:", error.message);
  }
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
.select("id, payer_origin")
    .eq("provider", "BREB_LLAVES")
    .eq("amount", Number(topup.amount || 0))
    .eq("is_used", false)
    .is("matched_topup_id", null)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  // Filtramos en JS con coincidencia parcial de palabras
  const match = (data as Array<{ id: string; payer_origin: string }>).find((payment) =>
    payerNamesMatch(userInput, payment.payer_origin)
  );

  return match || null;
}

async function reserveBankPayment({
  supabaseAdmin,
  bankPaymentId,
  topupId,
  reservedAt,
}: {
  supabaseAdmin: SupabaseClient;
  bankPaymentId: string;
  topupId: string;
  reservedAt: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("bank_payment_notifications")
    .update({
      matched_topup_id: topupId,
      used_at: null,
      updated_at: reservedAt,
    })
    .eq("id", bankPaymentId)
    .eq("is_used", false)
    .is("matched_topup_id", null)
    .select("id, transaction_reference, paid_at, created_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ese pago bancario ya fue tomado por otra recarga.");

  return data as {
    id: string;
    transaction_reference: string | null;
    paid_at: string | null;
    created_at: string | null;
  };
}

async function finalizeBankPayment({
  supabaseAdmin,
  bankPaymentId,
  topupId,
  usedAt,
}: {
  supabaseAdmin: SupabaseClient;
  bankPaymentId: string;
  topupId: string;
  usedAt: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("bank_payment_notifications")
    .update({
      is_used: true,
      matched_topup_id: topupId,
      used_at: usedAt,
      updated_at: usedAt,
    })
    .eq("id", bankPaymentId)
    .eq("is_used", false)
    .eq("matched_topup_id", topupId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("bank_payment_notifications")
      .select("id, is_used, matched_topup_id")
      .eq("id", bankPaymentId)
      .maybeSingle();

    if (currentError) throw new Error(currentError.message);
    if (current?.is_used && current?.matched_topup_id === topupId) return;
    throw new Error("No se pudo finalizar el uso del pago bancario.");
  }
}

async function releaseBankPaymentReservation({
  supabaseAdmin,
  bankPaymentId,
  topupId,
  releasedAt,
}: {
  supabaseAdmin: SupabaseClient;
  bankPaymentId: string;
  topupId: string;
  releasedAt: string;
}) {
  const { error } = await supabaseAdmin
    .from("bank_payment_notifications")
    .update({
      is_used: false,
      matched_topup_id: null,
      used_at: null,
      updated_at: releasedAt,
    })
    .eq("id", bankPaymentId)
    .eq("is_used", false)
    .eq("matched_topup_id", topupId);

  if (error) {
    console.error("No se pudo liberar la reserva del pago bancario:", error.message);
  }
}

async function restoreTopupAfterFailedCredit({
  supabaseAdmin,
  topup,
  failedAt,
  errorMessage,
}: {
  supabaseAdmin: SupabaseClient;
  topup: WalletTopupRow;
  failedAt: string;
  errorMessage: string;
}) {
  const { error } = await supabaseAdmin
    .from("wallet_topups")
    .update({
      status: "PENDING",
      approved_at: topup.approved_at || null,
      rejected_at: topup.rejected_at || null,
      credited_at: topup.credited_at || null,
      matched_bank_payment_id: topup.matched_bank_payment_id || null,
      matched_bank_reference: topup.matched_bank_reference || null,
      approved_by: topup.approved_by || null,
      admin_note: topup.admin_note || null,
      promotion_id: topup.promotion_id || null,
      promotion_name: topup.promotion_name || null,
      promotion_bonus_type: topup.promotion_bonus_type || null,
      promotion_bonus_value: topup.promotion_bonus_value || null,
      promotion_bonus_amount: topup.promotion_bonus_amount || null,
      promotion_total_amount: topup.promotion_total_amount || null,
      promotion_applied_at: topup.promotion_applied_at || null,
      error_message: errorMessage.slice(0, 500),
      updated_at: failedAt,
    })
    .eq("id", topup.id)
    .is("credited_at", null);

  if (error) {
    console.error("No se pudo restaurar la recarga después del fallo:", error.message);
  }
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

  if (status === "APPROVED" && topup.credited_at) return topup;
  if (status !== "PENDING") throw new Error("La recarga no está pendiente.");

  const now = new Date().toISOString();
  const delaySeconds = calculateDelaySeconds(topup.created_at, now);
  const matchedBankPaymentId = bankPaymentId || null;
  let matchedBankPaymentReference: string | null = null;
  let promotionReferenceAt: string | null = now;
  let paymentReserved = false;
  let creditRpcSucceeded = false;

  try {
    if (matchedBankPaymentId) {
      const reservedPayment = await reserveBankPayment({
        supabaseAdmin,
        bankPaymentId: matchedBankPaymentId,
        topupId: topup.id,
        reservedAt: now,
      });

      paymentReserved = true;
      matchedBankPaymentReference = String(reservedPayment.transaction_reference || "");
      promotionReferenceAt = String(reservedPayment.paid_at || reservedPayment.created_at || now);
    }

    const promotionCalculation = await findActiveTopupPromotion({
      supabaseAdmin,
      amount: topup.amount,
      referenceAt: promotionReferenceAt,
    });

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
      ...buildPromotionTopupPatch(promotionCalculation, topup.amount),
      updated_at: now,
    };

    const { data: approvedTopup, error: updateError } = await supabaseAdmin
      .from("wallet_topups")
      .update(patch)
      .eq("id", topup.id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!approvedTopup) throw new Error("La recarga cambió de estado mientras se estaba procesando.");

    // La RPC de crédito es la única operación que determina si el saldo fue abonado.
    await creditWalletTopup(supabaseAdmin, topup.id);
    creditRpcSucceeded = true;

    const creditedTopup = await getWalletTopupById(supabaseAdmin, topup.id);
    if (!creditedTopup?.credited_at) {
      throw new Error("La base de datos no confirmó la acreditación del saldo.");
    }

    if (matchedBankPaymentId) {
      try {
        await finalizeBankPayment({
          supabaseAdmin,
          bankPaymentId: matchedBankPaymentId,
          topupId: topup.id,
          usedAt: now,
        });
      } catch (finalizeError) {
        // No liberamos el pago: el saldo ya fue acreditado. El cron reparará esta
        // reserva y la marcará como usada en su siguiente ejecución.
        console.error(
          "La recarga fue acreditada, pero no se pudo finalizar el pago bancario:",
          finalizeError instanceof Error ? finalizeError.message : finalizeError
        );
      }
    }

    await saveTopupExecutionTelemetry({
      supabaseAdmin,
      topupId: topup.id,
      executedAt: now,
      delaySeconds,
    });
    await createDelayedTopupAlertIfNeeded({
      supabaseAdmin,
      topup,
      executedAt: now,
      delaySeconds,
      executedBy: approvedBy || null,
    });

    return creditedTopup;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al acreditar la recarga.";

    let currentTopup: WalletTopupRow | null = null;
    try {
      currentTopup = await getWalletTopupById(supabaseAdmin, topup.id);
    } catch (readError) {
      console.error(
        "No se pudo verificar la recarga después del fallo:",
        readError instanceof Error ? readError.message : readError
      );
    }

    // Si la RPC principal respondió correctamente, la operación de crédito ya fue
    // confirmada por PostgreSQL. Aunque falle una lectura posterior, jamás liberamos
    // el pago porque eso podría permitir una segunda acreditación.
    if (creditRpcSucceeded || currentTopup?.credited_at) {
      if (matchedBankPaymentId) {
        try {
          await finalizeBankPayment({
            supabaseAdmin,
            bankPaymentId: matchedBankPaymentId,
            topupId: topup.id,
            usedAt: now,
          });
        } catch (finalizeError) {
          console.error(
            "No se pudo finalizar el pago ya acreditado:",
            finalizeError instanceof Error ? finalizeError.message : finalizeError
          );
        }
      }
      return (
        currentTopup ||
        ({
          ...topup,
          status: "APPROVED",
          approved_at: topup.approved_at || now,
          matched_bank_payment_id: matchedBankPaymentId,
          matched_bank_reference: matchedBankPaymentReference,
          error_message: null,
        } as WalletTopupRow)
      );
    }

    await restoreTopupAfterFailedCredit({
      supabaseAdmin,
      topup,
      failedAt: new Date().toISOString(),
      errorMessage: message,
    });

    if (matchedBankPaymentId && paymentReserved) {
      await releaseBankPaymentReservation({
        supabaseAdmin,
        bankPaymentId: matchedBankPaymentId,
        topupId: topup.id,
        releasedAt: new Date().toISOString(),
      });
    }

    throw new Error(message);
  }
}

export async function tryAutoApproveBankTopup(
  supabaseAdmin: SupabaseClient,
  topupId: string,
  preloadedTopup?: WalletTopupRow | null
) {
  const topup =
    preloadedTopup?.id === topupId
      ? preloadedTopup
      : await getWalletTopupById(supabaseAdmin, topupId);

  if (!topup) throw new Error("No se encontró la recarga.");

  const bankPayment = await findUnusedBankPaymentForTopup(supabaseAdmin, topup);

  if (!bankPayment) return topup;

  return approveTopupWithBankPayment({
    supabaseAdmin,
    topupId: topup.id,
    bankPaymentId: bankPayment.id,
  });
}