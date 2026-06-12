import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { approveTopupWithBankPayment } from "../../../../lib/bankTopups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos máx en Vercel

const PROVIDER = "BREB_LLAVES";

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

// ===== Auto-match inverso: pago llegó DESPUÉS del reporte del cliente =====
async function matchPendingTopups(
    supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
    payment: { id: string; amount: number; normalizedPayerOrigin: string }
) {
    const { data: pendingTopup } = await supabaseAdmin
        .from("wallet_topups")
        .select("id")
        .eq("status", "PENDING")
        .eq("provider", PROVIDER)
        .eq("amount", payment.amount)
        .eq("normalized_payer_origin", payment.normalizedPayerOrigin)
        .order("created_at", { ascending: true }) // el más antiguo primero (FIFO justo)
        .limit(1)
        .maybeSingle();

    if (!pendingTopup) return false;

    try {
        await approveTopupWithBankPayment({
            supabaseAdmin,
            topupId: String(pendingTopup.id),
            bankPaymentId: payment.id,
        });
        return true;
    } catch {
        return false; // el lock is_used=false protege contra carreras
    }
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
            const unseenUids = await client.search({ seen: false }, { uid: true });

            if (!unseenUids || unseenUids.length === 0) {
                return NextResponse.json({ ok: true, processed: 0, message: "Sin correos nuevos." });
            }

            for (const uid of unseenUids) {
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

        return NextResponse.json({ ok: true, processed: results.length, results });
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