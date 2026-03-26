"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
};

type MessageType = "success" | "error" | "";

const PAGE_SIZE = 10;

function buildPagination(current: number, total: number): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, "...", total];
  }

  if (current >= total - 3) {
    return [1, "...", total - 3, total - 2, total - 1, total];
  }

  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function AdminUsersPage() {
  const sectionTopRef = useRef<HTMLElement | null>(null);

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
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  function handlePageChange(page: number) {
    setCurrentPage(page);
    sectionTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
    setCurrentPage(1);
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

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  }, [filteredUsers.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredUsers.slice(start, end);
  }, [filteredUsers, currentPage]);

  const paginationItems = useMemo(() => {
    return buildPagination(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const pageStart = filteredUsers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredUsers.length);

  const parseApiResponse = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return await response.json();
    }

    const rawText = await response.text();

    if (rawText.includes("<!DOCTYPE")) {
      throw new Error(
        "La API devolvió HTML en vez de JSON. Revisa que la ruta exista bien en app/api/admin/users/... y reinicia el servidor."
      );
    }

    throw new Error(rawText || "Respuesta inválida del servidor.");
  };

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  };

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

    try {
      const token = await getAccessToken();

      if (!token) {
        setMessage("Tu sesión expiró. Inicia sesión de nuevo.");
        setMessageType("error");
        return;
      }

      const response = await fetch("/api/admin/users/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          email: newEmail,
        }),
      });

      const result = await parseApiResponse(response);

      if (!response.ok) {
        setMessage(result?.error || "No se pudo actualizar el correo.");
        setMessageType("error");
        return;
      }

      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, email: newEmail } : user
        )
      );

      setEmailDrafts((prev) => ({
        ...prev,
        [userId]: newEmail,
      }));

      setMessage(`Correo actualizado correctamente a ${newEmail}.`);
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ocurrió un error actualizando el correo."
      );
      setMessageType("error");
    } finally {
      setUpdatingEmailUserId(null);
    }
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

    try {
      const token = await getAccessToken();

      if (!token) {
        setMessage("Tu sesión expiró. Inicia sesión de nuevo.");
        setMessageType("error");
        return;
      }

      const response = await fetch("/api/admin/users/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          password: newPassword,
        }),
      });

      const result = await parseApiResponse(response);

      if (!response.ok) {
        setMessage(result?.error || "No se pudo cambiar la contraseña.");
        setMessageType("error");
        return;
      }

      setPasswordDrafts((prev) => ({
        ...prev,
        [userId]: "",
      }));

      setMessage("Contraseña actualizada correctamente.");
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ocurrió un error cambiando la contraseña."
      );
      setMessageType("error");
    } finally {
      setUpdatingPasswordUserId(null);
    }
  };

  return (
    <section ref={sectionTopRef} className="space-y-6 text-slate-900">
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
              {paginatedUsers.map((user) => (
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

      {!loading && filteredUsers.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-slate-600">
            Mostrando <span className="font-semibold">{pageStart}</span> -{" "}
            <span className="font-semibold">{pageEnd}</span> de{" "}
            <span className="font-semibold">{filteredUsers.length}</span>{" "}
            usuarios
          </p>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
                className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ‹
              </button>

              {paginationItems.map((item, index) =>
                item === "..." ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handlePageChange(item)}
                    className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${
                      currentPage === item
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() =>
                  handlePageChange(Math.min(currentPage + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}