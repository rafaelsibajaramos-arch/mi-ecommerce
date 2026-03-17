"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  balance: number;
  created_at?: string;
};

type TabType = "info" | "security";

export default function AccountPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("info");

  const [fullName, setFullName] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        console.error("Error cargando perfil:", profileError?.message);
        setLoading(false);
        return;
      }

      setProfile(profileData as Profile);
      setFullName(profileData.full_name || "");
      setLoading(false);
    };

    loadUser();
  }, [router]);

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return "No disponible";

    try {
      return new Date(profile.created_at).toLocaleDateString("es-CO", {
        year: "numeric",
        month: "long",
      });
    } catch {
      return "No disponible";
    }
  }, [profile?.created_at]);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) return;

    setSavingInfo(true);
    setInfoMessage("");

    const trimmedName = fullName.trim();

    if (!trimmedName) {
      setInfoMessage("El nombre no puede estar vacío.");
      setSavingInfo(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmedName })
      .eq("id", profile.id);

    if (error) {
      setInfoMessage("No se pudo actualizar la información.");
      setSavingInfo(false);
      return;
    }

    setProfile({
      ...profile,
      full_name: trimmedName,
    });

    setInfoMessage("Información actualizada correctamente.");
    setSavingInfo(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage("");

    if (!newPassword || !confirmPassword) {
      setPasswordMessage("Completa ambos campos de contraseña.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Las contraseñas no coinciden.");
      return;
    }

    setSavingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordMessage(error.message);
      setSavingPassword(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Contraseña actualizada correctamente.");
    setSavingPassword(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-transparent px-6 py-10 text-white">
        <div className="mx-auto max-w-7xl">Cargando perfil...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-transparent px-6 py-10 text-white">
        <div className="mx-auto max-w-7xl">
          <p className="text-white/70">No se pudo cargar tu perfil.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-[0_0_30px_rgba(59,130,246,0.25)]">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21a8 8 0 1 0-16 0" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Mi perfil
            </h1>
            <p className="mt-2 text-lg text-white/70">
              Gestiona tu información personal y configuración
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-8 border-b border-white/10 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={
              activeTab === "info"
                ? "border-b-2 border-blue-500 pb-3 text-base font-semibold text-blue-400"
                : "pb-3 text-base font-semibold text-white/60 transition hover:text-white"
            }
          >
            Información
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={
              activeTab === "security"
                ? "border-b-2 border-blue-500 pb-3 text-base font-semibold text-blue-400"
                : "pb-3 text-base font-semibold text-white/60 transition hover:text-white"
            }
          >
            Seguridad
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/10 bg-slate-800/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-blue-500 text-white shadow-[0_0_40px_rgba(59,130,246,0.28)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21a8 8 0 1 0-16 0" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>

              <h2 className="mt-6 text-3xl font-bold">
                {profile.full_name || "Usuario"}
              </h2>

              <p className="mt-2 text-base text-white/55">
                {profile.email || "Sin correo"}
              </p>
            </div>

            <div className="mt-10 space-y-5 text-base">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/70">Estado:</span>
                <span className="font-semibold text-emerald-400">Activo</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/70">Saldo:</span>
                <span className="font-semibold text-sky-400">
                  ${Number(profile.balance ?? 0).toLocaleString("es-CO")}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/70">Rol:</span>
                <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-300 capitalize">
                  {profile.role || "user"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-white/70">Miembro desde:</span>
                <span className="text-white/70">{memberSince}</span>
              </div>
            </div>
          </aside>

          {activeTab === "info" && (
            <section className="rounded-[28px] border border-white/10 bg-slate-800/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <h2 className="text-3xl font-bold">Información personal</h2>

              <form className="mt-10 space-y-8" onSubmit={handleSaveInfo}>
                <div>
                  <label className="mb-3 block text-base font-semibold text-white/85">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-base text-white outline-none placeholder:text-white/30 focus:border-blue-500/60"
                  />
                </div>

                <div>
                  <label className="mb-3 block text-base font-semibold text-white/85">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={profile.email || ""}
                    disabled
                    className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white/60 outline-none"
                  />
                  <p className="mt-3 text-sm text-white/40">
                    El correo no se puede modificar desde esta sección.
                  </p>
                </div>

                {infoMessage && (
                  <p
                    className={`text-sm ${
                      infoMessage.includes("correctamente")
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {infoMessage}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingInfo}
                    className="rounded-2xl bg-blue-500 px-8 py-4 text-base font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50"
                  >
                    {savingInfo ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === "security" && (
            <section className="rounded-[28px] border border-white/10 bg-slate-800/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <h2 className="text-3xl font-bold">Seguridad de la cuenta</h2>

              <form className="mt-10 space-y-8" onSubmit={handleChangePassword}>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-3 block text-base font-semibold text-white/85">
                      Nueva contraseña
                    </label>
                    <input
                      type="password"
                      placeholder="Nueva contraseña"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-base text-white outline-none placeholder:text-white/30 focus:border-blue-500/60"
                    />
                  </div>

                  <div>
                    <label className="mb-3 block text-base font-semibold text-white/85">
                      Confirmar contraseña
                    </label>
                    <input
                      type="password"
                      placeholder="Confirmar contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-base text-white outline-none placeholder:text-white/30 focus:border-blue-500/60"
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-blue-500/40 bg-blue-500/10 p-6">
                  <p className="text-lg font-semibold text-blue-300">
                    Consejos de seguridad
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-blue-200/90">
                    <li>• Usa al menos 8 caracteres con mayúsculas, minúsculas y números.</li>
                    <li>• No compartas tu contraseña con nadie.</li>
                    <li>• Cambia tu contraseña regularmente.</li>
                  </ul>
                </div>

                {passwordMessage && (
                  <p
                    className={`text-sm ${
                      passwordMessage.includes("correctamente")
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {passwordMessage}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="rounded-2xl bg-blue-500 px-8 py-4 text-base font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50"
                  >
                    {savingPassword ? "Actualizando..." : "Actualizar contraseña"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}