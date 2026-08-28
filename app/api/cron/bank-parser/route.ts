import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { approveTopupWithBankPayment, payerNamesMatch } from "../../../../lib/bankTopups";
import { creditWalletTopup, getWalletTopupById } from "../../../../lib/walletTopups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos máx en Vercel

const PROVIDER = "BREB_LLAVES";
const BANK_MATCH_WINDOW_MS = 5 * 60 * 1000;
const MAX_UNSEEN_EMAILS_PER_RUN = 10;
const MAX_REPAIR_PAYMENTS_PER_RUN = 10;
const MAX_RECONCILE_PAYMENTS_PER_RUN = 10;
const MAX_MATCH_CANDIDATES = 25;
const MAX_RECONCILE_TOPUP_CANDIDATES = 100;

function env(name: string) {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Falta variable de entorno: ${name}`);
    return v;
}

// ===== Mismas funciones que tu Python =====
function normalizeText(value: string) {
    return (value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function normalizeSpaces(value: string) {
    return (value || "").replace(/\s+/g, " ").trim();
}

function parseAmount(value: string): number {
    const cleaned = value.replace(/[$\s]/g, "").replace(/COP/gi, "").replace(/[.,]/g, "");
    if (!/^\d+$/.test(cleaned)) throw new Error(`Monto inválido: ${value}`);
    return parseInt(cleaned, 10);
}

function parseBrebEmail(subject: string, body: string) {
    const fullText = normalizeSpaces(`${subject} ${body}`);

    // "Recibiste 100 de DANNA GABRIELA NAVARRO el 10 de junio de 2026 a las 4:37 p.m, desde el banco Nequi."
    const pattern =
        /Recibiste\s+\$?\s*([0-9][0-9.,\s]*)\s+de\s+(.+?)\s+el\s+(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+\s+de\s+\d{4})/i;

    const match = fullText.match(pattern);

    if (!match) {
        const fallback = fullText.match(/Recibiste\s+\$?\s*([0-9][0-9.,\s]*)\s+de\s+(.+?)\s+el\s+/i);
        if (!fallback) throw new Error("No pude extraer monto y remitente del correo Bre-B.");
        return buildParsed(fallback[1], fallback[2]);
    }

    return buildParsed(match[1], match[2]);
}

function buildParsed(amountText: string, payerText: string) {
    const amount = parseAmount(amountText);
    const payerOrigin = normalizeSpaces(payerText);
    const normalized = normalizeText(payerOrigin);
    if (!normalized) throw new Error("Nombre del remitente vacío.");
    return { amount, payerOrigin, normalizedPayerOrigin: normalized };
}

function makeReference(messageId: string, amount: number, normalizedPayer: string) {
    const base = (messageId || "").replace(/[<>\s]/g, "").replace(/[^A-Za-z0-9_\-.@]/g, "");
    if (base) return `BREB-${base.slice(0, 80)}`;
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    return `BREB-${amount}-${normalizedPayer.slice(0, 30)}-${stamp}`;
}

type PendingTopupForMatch = {
    id: string;
    amount: number | string | null;
    payer_origin: string | null;
    normalized_payer_origin: string | null;
};

type BankPaymentForMatch = {
    id: string;
    amount: number;
    payerOrigin?: string | null;
    normalizedPayerOrigin: string;
};

// ===== Auto-match inverso: pago llegó DESPUÉS del reporte del cliente =====
async function matchPendingTopups(
    supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
    payment: BankPaymentForMatch
) {
    const activeSince = new Date(Date.now() - BANK_MATCH_WINDOW_MS).toISOString();
    const { data: pendingTopups, error } = await supabaseAdmin
        .from("wallet_topups")
        .select("id, payer_origin, normalized_payer_origin")
        .eq("status", "PENDING")
        .eq("provider", PROVIDER)
        .eq("amount", payment.amount)
        .gte("created_at", activeSince)
        .order("created_at", { ascending: true }) // el más antiguo primero (FIFO justo)
        .limit(MAX_MATCH_CANDIDATES);

    if (error) throw new Error(error.message);
    if (!pendingTopups || pendingTopups.length === 0) return false;

    const bankValue = payment.payerOrigin || payment.normalizedPayerOrigin;

    const pendingTopup = (pendingTopups as PendingTopupForMatch[]).find((topup) =>
        payerNamesMatch(topup.payer_origin || topup.normalized_payer_origin || "", bankValue)
    );

    if (!pendingTopup) return false;

    try {
        await approveTopupWithBankPayment({
            supabaseAdmin,
            topupId: String(pendingTopup.id),
            bankPaymentId: payment.id,
        });
        return true;
    } catch (error) {
        console.error("No se pudo acreditar automáticamente la transferencia:", {
            paymentId: payment.id,
            topupId: pendingTopup.id,
            error: error instanceof Error ? error.message : error,
        });
        return false;
    }
}

async function reconcileUnusedBankPayments(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
    const activeSince = new Date(Date.now() - BANK_MATCH_WINDOW_MS).toISOString();
    const { data: payments, error } = await supabaseAdmin
        .from("bank_payment_notifications")
        .select("id, amount, payer_origin, normalized_payer_origin")
        .eq("provider", PROVIDER)
        .eq("is_used", false)
        .is("matched_topup_id", null)
        .gte("created_at", activeSince)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(MAX_RECONCILE_PAYMENTS_PER_RUN);

    if (error) throw new Error(error.message);
    if (!payments || payments.length === 0) return 0;

    const normalizedPayments = (payments as Array<{
        id: string;
        amount: number | string | null;
        payer_origin: string | null;
        normalized_payer_origin: string | null;
    }>)
        .map((payment) => ({
            ...payment,
            numericAmount: Math.round(Number(payment.amount || 0)),
        }))
        .filter((payment) => payment.numericAmount > 0);

    const amounts = Array.from(
        new Set(normalizedPayments.map((payment) => payment.numericAmount))
    );

    if (amounts.length === 0) return 0;

    const { data: pendingTopups, error: pendingError } = await supabaseAdmin
        .from("wallet_topups")
        .select("id, amount, payer_origin, normalized_payer_origin")
        .eq("status", "PENDING")
        .eq("provider", PROVIDER)
        .in("amount", amounts)
        .gte("created_at", activeSince)
        .order("created_at", { ascending: true })
        .limit(MAX_RECONCILE_TOPUP_CANDIDATES);

    if (pendingError) throw new Error(pendingError.message);
    if (!pendingTopups || pendingTopups.length === 0) return 0;

    const pendingByAmount = new Map<number, PendingTopupForMatch[]>();

    for (const topup of pendingTopups as PendingTopupForMatch[]) {
        const amount = Math.round(Number(topup.amount || 0));
        if (!amount) continue;

        const rows = pendingByAmount.get(amount) || [];
        rows.push(topup);
        pendingByAmount.set(amount, rows);
    }

    const claimedTopupIds = new Set<string>();
    let matchedCount = 0;

    for (const payment of normalizedPayments) {
        const candidates = pendingByAmount.get(payment.numericAmount) || [];
        const bankValue =
            payment.payer_origin ||
            payment.normalized_payer_origin ||
            "";

        const pendingTopup = candidates.find(
            (topup) =>
                !claimedTopupIds.has(topup.id) &&
                payerNamesMatch(
                    topup.payer_origin || topup.normalized_payer_origin || "",
                    bankValue
                )
        );

        if (!pendingTopup) continue;

        try {
            await approveTopupWithBankPayment({
                supabaseAdmin,
                topupId: pendingTopup.id,
                bankPaymentId: payment.id,
            });
            claimedTopupIds.add(pendingTopup.id);
            matchedCount += 1;
        } catch (matchError) {
            console.error("No se pudo reconciliar una transferencia pendiente:", {
                paymentId: payment.id,
                topupId: pendingTopup.id,
                error: matchError instanceof Error ? matchError.message : matchError,
            });
        }
    }

    return matchedCount;
}


function isOlderThanTwoMinutes(value: string | null | undefined) {
    if (!value) return true;
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return true;
    return Date.now() - timestamp > 2 * 60 * 1000;
}

async function repairIncompleteBankMatches(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { data: payments, error } = await supabaseAdmin
        .from("bank_payment_notifications")
        .select("id, is_used, matched_topup_id, used_at, updated_at")
        .eq("is_used", false)
        .not("matched_topup_id", "is", null)
        .lt("updated_at", staleBefore)
        .order("updated_at", { ascending: true })
        .limit(MAX_REPAIR_PAYMENTS_PER_RUN);

    if (error) throw new Error(error.message);
    if (!payments || payments.length === 0) {
        return { finalized: 0, released: 0, credited: 0, errors: [] as string[] };
    }

    let finalized = 0;
    let released = 0;
    let credited = 0;
    const errors: string[] = [];

    for (const payment of payments as Array<{
        id: string;
        is_used: boolean | null;
        matched_topup_id: string | null;
        used_at: string | null;
        updated_at: string | null;
    }>) {
        if (!payment.matched_topup_id || !isOlderThanTwoMinutes(payment.updated_at || payment.used_at)) continue;

        try {
            const topup = await getWalletTopupById(supabaseAdmin, payment.matched_topup_id);

            if (!topup) {
                errors.push(`Pago ${payment.id}: la recarga asociada no existe.`);
                continue;
            }

            const status = String(topup.status || "PENDING").toUpperCase();

            if (topup.credited_at) {
                if (!payment.is_used) {
                    const usedAt = new Date().toISOString();
                    const { error: finalizeError } = await supabaseAdmin
                        .from("bank_payment_notifications")
                        .update({ is_used: true, used_at: usedAt, updated_at: usedAt })
                        .eq("id", payment.id)
                        .eq("matched_topup_id", topup.id);

                    if (finalizeError) throw new Error(finalizeError.message);
                    finalized += 1;
                }
                continue;
            }

            if (status === "APPROVED") {
                await creditWalletTopup(supabaseAdmin, topup.id);
                const refreshed = await getWalletTopupById(supabaseAdmin, topup.id);

                if (!refreshed?.credited_at) {
                    throw new Error("La recarga aprobada no confirmó credited_at después del reintento.");
                }

                const usedAt = new Date().toISOString();
                const { error: finalizeError } = await supabaseAdmin
                    .from("bank_payment_notifications")
                    .update({ is_used: true, used_at: usedAt, updated_at: usedAt })
                    .eq("id", payment.id)
                    .eq("matched_topup_id", topup.id);

                if (finalizeError) throw new Error(finalizeError.message);
                credited += 1;
                continue;
            }

            if (["PENDING", "REJECTED", "EXPIRED", "VOIDED", "ERROR"].includes(status)) {
                const releasedAt = new Date().toISOString();
                const { error: releaseError } = await supabaseAdmin
                    .from("bank_payment_notifications")
                    .update({
                        is_used: false,
                        matched_topup_id: null,
                        used_at: null,
                        updated_at: releasedAt,
                    })
                    .eq("id", payment.id)
                    .eq("matched_topup_id", topup.id);

                if (releaseError) throw new Error(releaseError.message);
                released += 1;
            }
        } catch (repairError) {
            const detail = repairError instanceof Error ? repairError.message : String(repairError);
            errors.push(`Pago ${payment.id}: ${detail}`);
            console.error("No se pudo reparar una transferencia incompleta:", {
                paymentId: payment.id,
                topupId: payment.matched_topup_id,
                error: detail,
            });
        }
    }

    return { finalized, released, credited, errors };
}

// ===== Handler principal =====
export async function GET(request: NextRequest) {
    // 🔒 Protección del endpoint
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${env("CRON_SECRET")}`) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const results: Array<Record<string, unknown>> = [];

    const allowedSenders = new Set(
        (process.env.BANK_ALLOWED_SENDERS || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
    );

    const client = new ImapFlow({
        host: env("BANK_IMAP_HOST"),
        port: parseInt(process.env.BANK_IMAP_PORT || "993", 10),
        secure: true,
        auth: { user: env("BANK_IMAP_USER"), pass: env("BANK_IMAP_PASSWORD") },
        logger: false,
    });

    try {
        await client.connect();
        const mailbox = process.env.BANK_IMAP_MAILBOX || "INBOX";
        const lock = await client.getMailboxLock(mailbox);

        try {
            const searchResult = await client.search({ seen: false }, { uid: true });
            const unseenUids = [...(searchResult || [])]
                .sort((a, b) => a - b)
                .slice(0, MAX_UNSEEN_EMAILS_PER_RUN);

            if (!unseenUids || unseenUids.length === 0) {
                results.push({ skipped: "Sin correos nuevos." });
            }

            for (const uid of unseenUids || []) {
                try {
                    const { content } = await client.download(String(uid), undefined, { uid: true });
                    const parsed = await simpleParser(content);

                    const sender = (parsed.from?.value?.[0]?.address || "").toLowerCase();
                    const subject = parsed.subject || "";
                    const messageId = (parsed.messageId || "").replace(/[<>]/g, "");
                    const htmlText = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "";
                    const body = normalizeSpaces(parsed.text || htmlText || "");
                    // Filtros (igual que tu Python)
                    if (allowedSenders.size > 0 && !allowedSenders.has(sender)) {
                        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
                        results.push({ uid, skipped: "remitente no permitido" });
                        continue;
                    }

                    const subjectLower = subject.toLowerCase();
                    if (!subjectLower.includes("bre-b") && !subjectLower.includes("breb")) {
                        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
                        results.push({ uid, skipped: "asunto no es Bre-B" });
                        continue;
                    }

                    const data = parseBrebEmail(subject, body);
                    const reference = makeReference(messageId, data.amount, data.normalizedPayerOrigin);

                    const { data: inserted, error: insertError } = await supabaseAdmin
                        .from("bank_payment_notifications")
                        .insert({
                            provider: PROVIDER,
                            sender_email: sender,
                            subject,
                            message_id: messageId || `imap-uid-${uid}`,
                            transaction_reference: reference,
                            amount: data.amount,
                            payer_origin: data.payerOrigin,
                            normalized_payer_origin: data.normalizedPayerOrigin,
                            paid_at: parsed.date?.toISOString() || new Date().toISOString(),
                            raw_body: body.slice(0, 2000),
                            parser_version: "v2-vercel",
                        })
                        .select("id")
                        .single();

                    if (insertError) {
                        // Duplicado (23505) = ya procesado antes → marcar leído y seguir
                        if (insertError.code === "23505") {
                            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
                            results.push({ uid, skipped: "duplicado" });
                            continue;
                        }
                        results.push({ uid, error: insertError.message }); // NO marcar leído → reintenta
                        continue;
                    }

                    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

                    // 🔁 Match inverso: ¿hay un reporte pendiente esperando este pago?
                    const matched = await matchPendingTopups(supabaseAdmin, {
                        id: String(inserted.id),
                        amount: data.amount,
                        payerOrigin: data.payerOrigin,
                        normalizedPayerOrigin: data.normalizedPayerOrigin,
                    });

                    results.push({ uid, inserted: true, amount: data.amount, autoMatched: matched });
                } catch (err) {
                    // Correo no parseable → queda sin leer para reintento/revisión
                    results.push({ uid, error: err instanceof Error ? err.message : "error desconocido" });
                }
            }
        } finally {
            lock.release();
        }

        const repairedMatches = await repairIncompleteBankMatches(supabaseAdmin);
        const reconciledMatches = await reconcileUnusedBankPayments(supabaseAdmin);

        return NextResponse.json({
            ok: true,
            processed: results.length,
            repairedMatches,
            reconciledMatches,
            results,
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Error IMAP" },
            { status: 500 }
        );
    } finally {
        try {
            await client.logout();
        } catch { }
    }
}
