import { NextResponse } from "next/server";
import { getExchangeRate } from "@/lib/exchangeRate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getExchangeRate(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "cotizacion de Google no disponible; los valores siguen en COP." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
