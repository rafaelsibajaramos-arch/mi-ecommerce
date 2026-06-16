import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value.trim();
}

function createSupabaseUserClientFromToken(token: string) {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "password",
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return jsonError("No autorizado.", 401);
    }

    const supabaseAuth = createSupabaseUserClientFromToken(token);
    const supabaseAdmin = createSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return jsonError("Sesión inválida.", 401);
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfileError) {
      return jsonError("No se pudo validar el perfil del administrador.", 500);
    }

    if (!callerProfile || callerProfile.role !== "admin") {
      return jsonError("No tienes permisos para cambiar contraseñas.", 403);
    }

    const body = await request.json();
    const targetUserId =
      typeof body?.userId === "string" ? body.userId.trim() : "";
    const newPassword =
      typeof body?.password === "string" ? body.password.trim() : "";

    if (!targetUserId) {
      return jsonError("Falta el id del usuario.");
    }

    if (newPassword.length < 6) {
      return jsonError("La nueva contraseña debe tener al menos 6 caracteres.");
    }

    const { error: passwordUpdateError } =
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

    if (passwordUpdateError) {
      return jsonError(passwordUpdateError.message, 400);
    }

    return NextResponse.json({
      ok: true,
      message: "Contraseña actualizada correctamente.",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado.",
      500
    );
  }
}