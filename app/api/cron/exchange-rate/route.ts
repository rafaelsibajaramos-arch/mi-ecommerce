import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { EXCHANGE_RATE_TAG, MXN_EXCHANGE_RATE_TAG, fetchGoogleRate, fetchGoogleMxnRate, getExchangeRate, getMxnExchangeRate } from "@/lib/exchangeRate";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    // Update independently so an unavailable currency does not block the other.
    const updates = await Promise.allSettled([
      (async () => {
        await fetchGoogleRate();
        revalidateTag(EXCHANGE_RATE_TAG, "max");
        await getExchangeRate();
      })(),
      (async () => {
        await fetchGoogleMxnRate();
        revalidateTag(MXN_EXCHANGE_RATE_TAG, "max");
        await getMxnExchangeRate();
      })(),
    ]);
    if (updates.some(update => update.status === "rejected")) {
      throw new Error("No se pudieron actualizar todas las monedas");
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error("No se pudo actualizar la cotizacion de Google; se conserva la última tasa válida.");
    return NextResponse.json({ error: "No se pudo actualizar la cotizacion de Google" }, { status: 503 });
  }
}
