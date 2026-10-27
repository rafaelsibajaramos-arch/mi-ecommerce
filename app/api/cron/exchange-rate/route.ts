import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { EXCHANGE_RATE_TAG, fetchGoogleRate, getExchangeRate } from "@/lib/exchangeRate";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    // Check the source before invalidating; retain the cached rate on source failure.
    await fetchGoogleRate();
    revalidateTag(EXCHANGE_RATE_TAG, "max");
    await getExchangeRate();
    return NextResponse.json({ ok: true });
  } catch {
    console.error("No se pudo actualizar la cotizacion de Google; se conserva la última tasa válida.");
    return NextResponse.json({ error: "No se pudo actualizar la cotizacion de Google" }, { status: 503 });
  }
}
