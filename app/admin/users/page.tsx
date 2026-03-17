"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  balance: number;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Error cargando usuarios: " + error.message);
      setLoading(false);
      return;
    }

    setUsers(data || []);
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUserId(userId);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      setMessage("Error actualizando rol: " + error.message);
      setUpdatingUserId(null);
      return;
    }

    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user
      )
    );

    setMessage("Rol actualizado correctamente.");
    setUpdatingUserId(null);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
          Usuarios
        </p>
        <h1 className="text-4xl font-extrabold text-gray-900 mt-2">
          Gestión de usuarios
        </h1>
        <p className="text-gray-600 mt-3">
          Administra roles, revisa usuarios registrados y prepara la gestión de
          saldo.
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
          {message}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Usuarios registrados
          </h2>
        </div>

        {loading ? (
          <div className="p-6">
            <p className="text-gray-500">Cargando usuarios...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-6">
            <p className="text-gray-500">No hay usuarios registrados todavía.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-[30%]">
                    Usuario
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-[28%]">
                    Correo
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-[14%]">
                    Rol actual
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-[12%]">
                    Saldo
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 w-[16%]">
                    Cambiar rol
                  </th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-gray-200 hover:bg-gray-50/70 transition"
                  >
                    <td className="px-6 py-5 align-middle">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {user.full_name || "Sin nombre"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 break-all">
                          {user.id}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-5 align-middle">
                      <p className="text-gray-700 break-all">{user.email}</p>
                    </td>

                    <td className="px-6 py-5 align-middle">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          user.role === "admin"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>

                    <td className="px-6 py-5 align-middle">
                      <p className="font-bold text-green-600">
                        ${user.balance ?? 0}
                      </p>
                    </td>

                    <td className="px-6 py-5 align-middle">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value)
                        }
                        disabled={updatingUserId === user.id}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}