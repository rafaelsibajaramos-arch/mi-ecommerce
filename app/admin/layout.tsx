import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-[#0f172a]">
      <div className="flex min-h-screen">
        <AdminSidebar />

        <section className="min-w-0 flex-1 pt-[76px] lg:pt-0">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}