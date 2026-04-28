import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  creditWalletTopup,
  getWalletTopupByReference,
  upsertTopupTransactionState,
} from "../../../../../lib/walletTopups";
import { verifyWompiEventChecksum } from "../../../../../lib/wompi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonOk(data: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...data });
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const checksumHeader = request.headers.get("x-event-checksum");
    const event = await request.json();

    const isValidChecksum = verifyWompiEventChecksum({
      event,
      checksum: checksumHeader || event?.signature?.checksum || null,
    });

    if (!isValidChecksum) {
      return jsonError("Checksum inválido.", 401);
    }

    if (event?.event !== "transaction.updated") {
      return jsonOk({ ignored: true, reason: "Evento no relevante." });
    }

    const transaction = event?.data?.transaction;

    if (!transaction?.reference || !transaction?.id) {
      return jsonOk({ ignored: true, reason: "Transacción incompleta." });
    }

    const topup = await getWalletTopupByReference(
      supabaseAdmin,
      String(transaction.reference)
    );

    if (!topup) {
      return jsonOk({ ignored: true, reason: "Recarga no encontrada." });
    }

    const syncedTopup = await upsertTopupTransactionState({
      supabaseAdmin,
      topup,
      transaction: {
        id: String(transaction.id),
        reference: String(transaction.reference),
        status: String(transaction.status || "PENDING"),
        amount_in_cents: Number(transaction.amount_in_cents || 0),
        currency: String(transaction.currency || "COP"),
        payment_method_type: transaction.payment_method_type
          ? String(transaction.payment_method_type)
          : null,
        status_message: transaction.status_message
          ? String(transaction.status_message)
          : null,
      },
    });

    if (String(transaction.status || "").toUpperCase() === "APPROVED") {
      await creditWalletTopup(supabaseAdmin, syncedTopup.id);
    }

    return jsonOk();
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Ocurrió un error inesperado."
    );
  }
}