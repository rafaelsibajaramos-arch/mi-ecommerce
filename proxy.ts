import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_REQUEST_TIMEOUT_MS = 6_000;

const fetchWithTimeout: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
  });

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // La página no debe quedar completamente caída por una variable ausente.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[proxy] Faltan las variables públicas de Supabase.");
    return response;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: fetchWithTimeout,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // Refresca la sesión, pero nunca deja la página esperando más de 6 segundos.
    await supabase.auth.getUser();
  } catch (error) {
    console.error(
      "[proxy] No se pudo refrescar la sesión de Supabase:",
      error instanceof Error ? error.message : String(error)
    );
  }

  return response;
}

export const config = {
  matcher: [
    // No ejecutar el proxy en APIs, cron, archivos estáticos ni imágenes.
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
