import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { creditWalletTopup, getWalletTopupByReference, upsertTopupTransactionState } from "../../../../../lib/walletTopups";
import { verifyWompiEventChecksum } from "../../../../../lib/wompi";

export const runtime = "nodejs";

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
      return NextResponse.json({ ok: false, error: "Checksum inválido." }, { status: 401 });
    }

    if (event?.event !== "transaction.updated") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const transaction = event?.data?.transaction;

    if (!transaction?.reference || !transaction?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const topup = await getWalletTopupByReference(
      supabaseAdmin,
      String(transaction.reference)
    );

    if (!topup) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const syncedTopup = await upsertTopupTransactionState({
      supabaseAdmin,
      topup,
      transaction: {
        id: String(transaction.id),
        reference: String(transaction.reference),
        status: String(transaction.status || "PENDING"),
        amount_in_cents: Number(transaction.amount_in_cents || topup.amount_in_cents || 0),
        currency: String(transaction.currency || topup.currency || "COP"),
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      },
      { status: 500 }
    );
  }
}