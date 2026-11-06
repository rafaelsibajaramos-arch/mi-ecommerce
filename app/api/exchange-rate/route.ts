import { NextResponse } from "next/server";
import { getExchangeRate, getMxnExchangeRate, getPenExchangeRate } from "@/lib/exchangeRate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Each currency keeps its own cache and can remain available independently.
    const [usd, mxn, pen] = await Promise.allSettled([getExchangeRate(), getMxnExchangeRate(), getPenExchangeRate()]);
    if (usd.status === "rejected" && mxn.status === "rejected" && pen.status === "rejected") {
      throw new Error("No hay tasas disponibles");
    }
    return NextResponse.json({
      ...(usd.status === "fulfilled" ? usd.value : {}),
      pen: pen.status === "fulfilled" ? pen.value : null,
      mxn: mxn.status === "fulfilled" ? mxn.value : null,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "cotizacion de Google no disponible; los valores siguen en COP." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
