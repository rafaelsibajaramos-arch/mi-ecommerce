"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
};

type MessageType = "success" | "error" | "";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [updatingEmailUserId, setUpdatingEmailUserId] = useState<string | null>(null);
  const [updatingPasswordUserId, setUpdatingPasswordUserId] = useState<string | null>(null);

  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Error cargando usuarios: " + error.message);
      setMessageType("error");
      setLoading(false);
      return;
    }

    const profiles = (data as Profile[]) || [];
    setUsers(profiles);

    const initialEmailDrafts: Record<string, string> = {};
    const initialPasswordDrafts: Record<string, string> = {};

    profiles.forEach((user) => {
      initialEmailDrafts[user.id] = user.email || "";
      initialPasswordDrafts[user.id] = "";
    });

    setEmailDrafts(initialEmailDrafts);
    setPasswordDrafts(initialPasswordDrafts);
    setLoading(false);
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return users;

    return users.filter((user) => {
      const fullName = (user.full_name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      return fullName.includes(term) || email.includes(term);
    });
  }, [users, search]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRoleUserId(userId);
    setMessage("");
    setMessageType("");

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      setMessage("Error actualizando rol: " + error.message);
      setMessageType("error");
      setUpdatingRoleUserId(null);
      return;
    }

    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user
      )
    );

    setMessage("Rol actualizado correctamente.");
    setMessageType("success");
    setUpdatingRoleUserId(null);
  };

  const handleEmailDraftChange = (userId: string, value: string) => {
    setEmailDrafts((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const handlePasswordDraftChange = (userId: string, value: string) => {
    setPasswordDrafts((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const handleEmailChange = async (userId: string) => {
    const newEmail = (emailDrafts[userId] || "").trim().toLowerCase();

    if (!newEmail || !newEmail.includes("@")) {
      setMessage("Escribe un correo válido.");
      setMessageType("error");
      return;
    }

    setUpdatingEmailUserId(userId);
    setMessage("");
    setMessageType("");

    const { error } = await supabase
      .from("profiles")
      .update({ email: newEmail })
      .eq("id", userId);

    if (error) {
      setMessage("Error actualizando correo: " + error.message);
      setMessageType("error");
      setUpdatingEmailUserId(null);
      return;
    }

    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, email: newEmail } : user
      )
    );

    setMessage(`Correo actualizado correctamente a ${newEmail}.`);
    setMessageType("success");
    setUpdatingEmailUserId(null);
  };

  const handlePasswordChange = async (userId: string) => {
    const newPassword = (passwordDrafts[userId] || "").trim();

    if (newPassword.length < 6) {
      setMessage("La nueva contraseña debe tener al menos 6 caracteres.");
      setMessageType("error");
      return;
    }

    setUpdatingPasswordUserId(userId);
    setMessage("");
    setMessageType("");

    setTimeout(() => {
      setMessage(
        "La interfaz ya quedó lista, pero para cambiar la contraseña real de otro usuario en Supabase necesito un endpoint admin con service role."
      );
      setMessageType("error");
      setUpdatingPasswordUserId(null);
    }, 350);
  };

  return (
    <section className="space-y-6 text-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Usuarios
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Gestión de usuarios
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Administra roles, correos y prepara el cambio de contraseña desde un
            panel más limpio.
          </p>
        </div>

        <div className="w-full lg:max-w-md">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Buscar usuario
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
            messageType === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <h2 className="text-2xl font-extrabold text-slate-900">
            Usuarios registrados
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {loading
              ? "Cargando usuarios..."
              : `${filteredUsers.length} usuario${filteredUsers.length === 1 ? "" : "s"} encontrado${filteredUsers.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        {loading ? (
          <div className="px-5 py-8 sm:px-6">
            <p className="text-slate-500">Cargando usuarios...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-5 py-8 sm:px-6">
            <p className="text-slate-500">
              No se encontraron usuarios con esa búsqueda.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-500 xl:grid">
              <span>Usuario</span>
              <span>Rol</span>
              <span>Cambiar correo</span>
              <span>Cambiar contraseña</span>
            </div>

            <div className="divide-y divide-slate-200">
              {filteredUsers.map((user) => (
                <div key={user.id} className="px-5 py-5 sm:px-6">
                  <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr_1.2fr_1.2fr] xl:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                        Usuario
                      </p>
                      <p className="text-base font-bold text-slate-900">
                        {user.full_name || "Sin nombre"}
                      </p>
                      <p className="mt-1 break-all text-sm text-slate-600">
                        {user.email}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                        Rol
                      </p>
                      <select
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value)
                        }
                        disabled={updatingRoleUserId === user.id}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-slate-500 disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                        Cambiar correo
                      </p>
                      <div className="space-y-3">
                        <input
                          type="email"
                          value={emailDrafts[user.id] || ""}
                          onChange={(e) =>
                            handleEmailDraftChange(user.id, e.target.value)
                          }
                          placeholder="nuevo@email.com"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleEmailChange(user.id)}
                          disabled={updatingEmailUserId === user.id}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-[#050816] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
                        >
                          {updatingEmailUserId === user.id
                            ? "Guardando..."
                            : "Guardar correo"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                        Cambiar contraseña
                      </p>
                      <div className="space-y-3">
                        <input
                          type="password"
                          value={passwordDrafts[user.id] || ""}
                          onChange={(e) =>
                            handlePasswordDraftChange(user.id, e.target.value)
                          }
                          placeholder="Nueva contraseña"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-500"
                        />
                        <button
                          type="button"
                          onClick={() => handlePasswordChange(user.id)}
                          disabled={updatingPasswordUserId === user.id}
                          className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        >
                          {updatingPasswordUserId === user.id
                            ? "Procesando..."
                            : "Cambiar contraseña"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}