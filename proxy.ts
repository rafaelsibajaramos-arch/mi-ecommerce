import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy liviano.
 * La autorización real se valida dentro de los layouts y las APIs.
 * No se hacen llamadas de red aquí para evitar bloquear cada navegación.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
