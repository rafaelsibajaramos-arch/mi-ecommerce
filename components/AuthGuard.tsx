"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const publicRoutes = ["/login", "/register", "/reset-password"];

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const isPublicRoute = publicRoutes.some(
        (route) => pathname === route || pathname.startsWith(route)
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session && !isPublicRoute) {
        router.replace("/login");
        return;
      }

      if (session && pathname === "/login") {
        router.replace("/");
        return;
      }

      setChecking(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const isPublicRoute = publicRoutes.some(
        (route) => pathname === route || pathname.startsWith(route)
      );

      if (!session && !isPublicRoute) {
        router.replace("/login");
        return;
      }

      if (session && pathname === "/login") {
        router.replace("/");
        return;
      }

      setChecking(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/60">
        Cargando...
      </div>
    );
  }

  return <>{children}</>;
}