import crypto from "crypto";

export type WompiTransactionStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "VOIDED"
  | "ERROR"
  | string;

export type WompiTransactionSummary = {
  id: string;
  reference: string;
  status: WompiTransactionStatus;
  amount_in_cents: number;
  currency: string;
  payment_method_type: string | null;
  status_message?: string | null;
};

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value.trim();
}

export function getWompiPublicKey() {
  return requireEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY");
}

export function getWompiIntegritySecret() {
  return requireEnv("WOMPI_INTEGRITY_SECRET");
}

export function getWompiEventsSecret() {
  return requireEnv("WOMPI_EVENTS_SECRET");
}

export function getWompiApiBaseUrl(publicKey = getWompiPublicKey()) {
  return publicKey.startsWith("pub_test_")
    ? "https://sandbox.wompi.co/v1"
    : "https://production.wompi.co/v1";
}

export function getWompiCheckoutBaseUrl() {
  return "https://checkout.wompi.co/p/";
}

export function buildWompiIntegritySignature({
  reference,
  amountInCents,
  currency,
  expirationTime,
}: {
  reference: string;
  amountInCents: number;
  currency: string;
  expirationTime?: string | null;
}) {
  const raw = `${reference}${amountInCents}${currency}${expirationTime || ""}${getWompiIntegritySecret()}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function fetchWompiTransactionById(transactionId: string) {
  const publicKey = getWompiPublicKey();
  const apiBaseUrl = getWompiApiBaseUrl(publicKey);

  const response = await fetch(`${apiBaseUrl}/transactions/${transactionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${publicKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.error?.reason ||
        payload?.error?.messages?.[0]?.message ||
        payload?.message ||
        "No se pudo consultar la transacción en Wompi."
    );
  }

  const data = payload?.data;

  if (!data?.id || !data?.reference) {
    throw new Error("Wompi devolvió una transacción inválida.");
  }

  return {
    id: String(data.id),
    reference: String(data.reference),
    status: String(data.status || "PENDING").toUpperCase(),
    amount_in_cents: Number(data.amount_in_cents || 0),
    currency: String(data.currency || "COP").toUpperCase(),
    payment_method_type: data.payment_method_type
      ? String(data.payment_method_type)
      : null,
    status_message: data.status_message ? String(data.status_message) : null,
  } satisfies WompiTransactionSummary;
}

export function getNestedValue(source: unknown, path: string) {
  if (!source || typeof source !== "object") return "";

  return path.split(".").reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== "object") return "";
    return (acc as Record<string, unknown>)[part];
  }, source);
}

function safeEqualHex(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function verifyWompiEventChecksum({
  event,
  checksum,
}: {
  event: Record<string, unknown>;
  checksum?: string | null;
}) {
  const expectedChecksum = String(checksum || "").trim().toLowerCase();

  if (!expectedChecksum) return false;

  const signature =
    event && typeof event.signature === "object" && event.signature
      ? (event.signature as Record<string, unknown>)
      : null;

  const rawProperties = signature?.properties;
  const properties = Array.isArray(rawProperties) ? rawProperties : [];

  // IMPORTANTE: Wompi envía timestamp en la raíz del evento, no dentro de signature.
  const timestamp = event?.timestamp;

  if (!timestamp || properties.length === 0) return false;

  const concatenatedValues = properties
    .map((property) => String(getNestedValue(event?.data, String(property)) || ""))
    .join("");

  const raw = `${concatenatedValues}${String(timestamp)}${getWompiEventsSecret()}`;

  const calculatedChecksum = crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .toLowerCase();

  return safeEqualHex(calculatedChecksum, expectedChecksum);
}