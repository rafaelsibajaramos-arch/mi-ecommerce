import type { SupabaseClient } from "@supabase/supabase-js";

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
    payer_origin?: string | null;
    destination_account?: string | null;
    receipt_url?: string | null;
    matched_bank_payment_id?: string | null;
    matched_bank_reference?: string | null;
    approved_by?: string | null;
    admin_note?: string | null;
    error_message: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    credited_at: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

const SELECT_TOPUP = "*";

export function normalizeTopupStatus(status: string | null | undefined) {
    return String(status || "PENDING").trim().toUpperCase();
}

export function assertWompiTransactionMatchesTopup({
    topup,
    transaction,
}: {
    topup: WalletTopupRow;
    transaction: { reference: string; amount_in_cents: number; currency: string; id: string; status: string; payment_method_type?: string | null; status_message?: string | null; };
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
    transaction: { reference: string; amount_in_cents: number; currency: string; id: string; status: string; payment_method_type?: string | null; status_message?: string | null; };
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

function getTopupProviderLabel(topup: WalletTopupRow) {
    const provider = String(topup.provider || "BREB_LLAVES").toUpperCase();
    return provider === "WOMPI" ? "Wompi" : "Bre-B / Llaves";
}

function getWalletTopupTransactionLabel(topup: WalletTopupRow) {
    return `Recarga automática por ${getTopupProviderLabel(topup)} (${topup.reference})`;
}

async function repairLegacyWompiTransactionLabel(
    supabaseAdmin: SupabaseClient,
    topup: WalletTopupRow,
    sinceIso: string
) {
    if (String(topup.provider || "").toUpperCase() !== "BREB_LLAVES") return;

    const label = getWalletTopupTransactionLabel(topup);

    const { error } = await supabaseAdmin
        .from("wallet_transactions")
        .update({
            note: label,
            description: label,
        })
        .eq("user_id", topup.user_id)
        .eq("type", "credit")
        .eq("amount", Number(topup.amount || 0))
        .gte("created_at", sinceIso)
        .or("note.ilike.%Wompi%,description.ilike.%Wompi%");

    if (error) throw new Error(error.message);
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

    const label = getWalletTopupTransactionLabel(topup);

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
    const startedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.rpc("credit_wallet_topup", {
        p_topup_id: topupId,
    });

    if (error) throw new Error(error.message);

    const creditedTopup = await getWalletTopupById(supabaseAdmin, topupId);

    if (creditedTopup && normalizeTopupStatus(creditedTopup.status) === "APPROVED") {
        await repairLegacyWompiTransactionLabel(supabaseAdmin, creditedTopup, startedAt);
        await ensureWalletTransactionForTopup(supabaseAdmin, creditedTopup);
    }
}
