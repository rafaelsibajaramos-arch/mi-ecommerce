import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type TopupForVoid = {
  id: string;
  user_id: string | null;
  reference: string | null;
  amount: number | null;
  provider: string | null;
  status: string | null;
  credited_at: string | null;
  matched_bank_payment_id: string | null;
  promotion_bonus_amount?: number | null;
  promotion_total_amount?: number | null;
  promotion_applied_at?: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
  if (!token) throw new Error("No autorizado.");

  const supabaseAuth = createSupabaseUserClientFromToken(token);
  const supabaseAdmin = createSupabaseAdmin();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) throw new Error("Sesión inválida.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error("No se pudo validar el administrador.");
  if (!profile || String((profile as { role?: string | null }).role || "") !== "admin") {
    throw new Error("No tienes permisos de administrador.");
  }

  return { user, supabaseAdmin };
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "PENDING").trim().toUpperCase();
}

async function hasAutomaticCreditTransaction({
  supabaseAdmin,
  topup,
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  topup: TopupForVoid;
}) {
  if (!topup.user_id || !topup.reference) return false;

  const reference = topup.reference.replace(/[%_,]/g, "");
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id, note, description")
    .eq("user_id", topup.user_id)
    .eq("type", "credit")
    .eq("amount", Number(topup.amount || 0))
    .or(`note.ilike.%${reference}%,description.ilike.%${reference}%`)
    .limit(5);

  if (error) throw new Error(error.message);

  return ((data as Array<{ note?: string | null; description?: string | null }> | null) || []).some((row) => {
    const text = `${row.note || ""} ${row.description || ""}`
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

    return (
      text.includes("recarga automatica") ||
      text.includes("bre-b") ||
      text.includes("breb-") ||
      text.includes("llaves") ||
      text.includes("wompi")
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = await request.json();
    const topupId = typeof body?.topupId === "string" ? body.topupId.trim() : "";

    if (!topupId) return jsonError("Falta el id de la recarga.");

    const { data: topupData, error: topupError } = await supabaseAdmin
      .from("wallet_topups")
      .select("id, user_id, reference, amount, provider, status, credited_at, matched_bank_payment_id, promotion_bonus_amount, promotion_total_amount, promotion_applied_at")
      .eq("id", topupId)
      .maybeSingle();

    if (topupError) return jsonError(topupError.message, 500);
    if (!topupData) return jsonError("No se encontró la recarga.", 404);

    const topup = topupData as TopupForVoid;
    const status = normalizeStatus(topup.status);

    if (status === "VOIDED") {
      return NextResponse.json({ ok: true, reversed: false, alreadyVoided: true });
    }

    const now = new Date().toISOString();
    const amount = Math.abs(Number(topup.amount || 0));
    const appliedBonus = topup.promotion_applied_at ? Math.max(0, Number(topup.promotion_bonus_amount || 0)) : 0;
    const amountToReverse = amount + appliedBonus;
    let reversed = false;

    const shouldReverseAutomaticCredit =
      status === "APPROVED" &&
      !!topup.user_id &&
      amountToReverse > 0 &&
      (!!topup.credited_at || (await hasAutomaticCreditTransaction({ supabaseAdmin, topup })));

    if (shouldReverseAutomaticCredit) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, balance")
        .eq("id", topup.user_id)
        .maybeSingle();

      if (profileError) return jsonError(profileError.message, 500);
      if (!profile) return jsonError("No se encontró el perfil del cliente.", 404);

      const currentBalance = Number((profile as { balance?: number | null }).balance || 0);
      if (currentBalance < amountToReverse) {
        return jsonError(
          `No se puede descontar ${amountToReverse.toLocaleString("es-CO")} porque el cliente solo tiene ${currentBalance.toLocaleString("es-CO")} de saldo.`,
          409
        );
      }

      const { error: balanceError } = await supabaseAdmin
        .from("profiles")
        .update({ balance: currentBalance - amountToReverse })
        .eq("id", topup.user_id);

      if (balanceError) return jsonError(balanceError.message, 500);

      const label = topup.reference
        ? `Anulación de recarga automática Bre-B / Llaves (${topup.reference})`
        : "Anulación de recarga automática Bre-B / Llaves";

      const { error: txError } = await supabaseAdmin.from("wallet_transactions").insert({
        user_id: topup.user_id,
        type: "debit",
        amount: amountToReverse,
        note: label,
        description: label,
      });

      if (txError) {
        await supabaseAdmin.from("profiles").update({ balance: currentBalance }).eq("id", topup.user_id);
        return jsonError(`No se pudo registrar la reversa: ${txError.message}`, 500);
      }

      reversed = true;
    }

    if (topup.matched_bank_payment_id) {
      const { data: bankPayment } = await supabaseAdmin
        .from("bank_payment_notifications")
        .select("id, raw_body")
        .eq("id", topup.matched_bank_payment_id)
        .maybeSingle();

      const rawBody = `${(bankPayment as { raw_body?: string | null } | null)?.raw_body || ""}

[ADMIN_VOIDED ${now}] Pago invalidado porque la recarga automática relacionada fue eliminada/anulada por admin ${user.id}.`;

      await supabaseAdmin
        .from("bank_payment_notifications")
        .update({
          is_used: true,
          matched_topup_id: null,
          used_at: now,
          raw_body: rawBody.slice(0, 4000),
          updated_at: now,
        })
        .eq("id", topup.matched_bank_payment_id);
    }

    const { data: updatedTopup, error: updateError } = await supabaseAdmin
      .from("wallet_topups")
      .update({
        status: "VOIDED",
        voided_at: now,
        voided_by: user.id,
        void_reason: reversed
          ? appliedBonus > 0
            ? `Anulada por admin. Se descontó saldo base + bono promocional (${amountToReverse.toLocaleString("es-CO")}).`
            : "Anulada por admin. Se descontó saldo porque había sido cargada automáticamente."
          : "Anulada por admin. No se descontó saldo porque no había carga automática confirmada.",
        admin_note: reversed
          ? "Anulada desde admin con reversa de saldo automático."
          : "Anulada desde admin sin reversa de saldo.",
        updated_at: now,
      })
      .eq("id", topup.id)
      .select("id, status, voided_at, void_reason, admin_note")
      .single();

    if (updateError) return jsonError(updateError.message, 500);

    await supabaseAdmin
      .from("wallet_topup_alerts")
      .update({ status: "DISMISSED", reviewed_by: user.id, reviewed_at: now })
      .eq("topup_id", topup.id)
      .eq("status", "OPEN");

    return NextResponse.json({ ok: true, reversed, topup: updatedTopup });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    const status = message.includes("permisos") ? 403 : message.includes("autorizado") || message.includes("Sesión") ? 401 : 500;
    return jsonError(message, status);
  }
}
