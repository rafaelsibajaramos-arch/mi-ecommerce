import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function env(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Falta la variable ${name}.`);
    return value;
}

export async function POST(request: NextRequest) {
    try {
        const authorization = request.headers.get("authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
        }

        const supabaseAuth = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: claimsData, error: userError } = await supabaseAuth.auth.getClaims(token);
        const userId = String(claimsData?.claims?.sub || "").trim();

        if (userError || !userId) {
            return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
        }

        const supabaseAdmin = createSupabaseAdmin();
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

        if (profileError || profile?.role !== "admin") {
            return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
        }

        revalidateTag("public-catalog", "max");
        return NextResponse.json({ ok: true });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "No se pudo actualizar el catálogo." },
            { status: 500 }
        );
    }
}
