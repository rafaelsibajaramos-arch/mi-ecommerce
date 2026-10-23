"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // AuthGuard presenta aquí el formulario existente para visitantes.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  return null;
}
