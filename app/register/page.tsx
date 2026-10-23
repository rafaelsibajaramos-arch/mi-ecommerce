"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from '../../lib/supabase';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  return null;
}
