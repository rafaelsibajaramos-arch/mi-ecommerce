import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from '@supabase/ssr';
import { publicBrowsingEnabled } from './lib/publicBrowsing';

/**
 * Proxy liviano.
 * La autorización real se valida dentro de los layouts y las APIs.
 * No se hacen llamadas de red aquí para evitar bloquear cada navegación.
 */
export async function proxy(request: NextRequest) {
  if (['/', '/contact'].includes(request.nextUrl.pathname) && !(await publicBrowsingEnabled())) {
    const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
    });
    const { data, error } = await auth.auth.getUser();
    if (error || !data.user) return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/", "/contact", "/admin/:path*", "/account/:path*"],
};
