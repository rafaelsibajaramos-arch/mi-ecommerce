import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ ok: true, message: "Wompi fue deshabilitado. Las recargas ahora se validan por correo oficial de Bre-B / Llaves." });
}
