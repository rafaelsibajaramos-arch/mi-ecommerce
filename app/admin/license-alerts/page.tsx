"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";

type LicenseAlert = {
  id: string;
  license_id: string;
  access_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  user_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  task_type: string;
  due_at: string;
  status: string;
  priority: string;
  message: string | null;
  completed_at: string | null;
  created_at: string;
  is_due: boolean;
  product_name: string;
  variant_name: string | null;
  customer_email: string;
  customer_full_name: string;
  order_number: number | null;
  license_text: string;
  billing_duration_days: number | null;
  billing_duration_months: number | null;
  billing_ends_at: string | null;
  rotation_status: string | null;
  access_starts_at: string | null;
  access_expires_at: string | null;
  access_status: string | null;
  access_duration_months: number | null;
  manual_license_text?: string | null;
  manual_product_note?: string | null;
  manual_note?: string | null;
};

type BannerState = {
  kind: "error" | "success";
  text: string;
} | null;

type AlertStats = {
  pendingDueCount: number;
  pendingTotalCount: number;
  completedCount: number;
};

type AlertPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Sin fecha";
  }
}

function getAlertLabel(alert: LicenseAlert) {
  if (alert.status === "completed") return "Realizada";
  if (alert.is_due) return "Pendiente ahora";
  return "Programada";
}

function getAlertClasses(alert: LicenseAlert) {
  if (alert.status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (alert.is_due) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function AdminLicenseAlertsPage() {
  const [alerts, setAlerts] = useState<LicenseAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const [filter, setFilter] = useState<"pending" | "due" | "completed" | "renewal" | "all">("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [stats, setStats] = useState<AlertStats>({
    pendingDueCount: 0,
    pendingTotalCount: 0,
    completedCount: 0,
  });
  const [pagination, setPagination] = useState<AlertPagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [manualLicenseText, setManualLicenseText] = useState("");
  const [manualProductNote, setManualProductNote] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualDays, setManualDays] = useState("0");
  const [creatingManualAlert, setCreatingManualAlert] = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setBanner(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setBanner({
          kind: "error",
          text: "Tu sesión expiró. Inicia sesión de nuevo.",
        });
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        filter,
        search,
        page: String(page),
        pageSize: String(pageSize),
      });

      const response = await fetch(`/api/admin/license-alerts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "No se pudieron cargar las alertas.");
      }

      setAlerts((result?.alerts as LicenseAlert[]) || []);
      setStats({
        pendingDueCount: Number(result?.stats?.pendingDueCount || 0),
        pendingTotalCount: Number(result?.stats?.pendingTotalCount || 0),
        completedCount: Number(result?.stats?.completedCount || 0),
      });
      setPagination({
        page: Number(result?.pagination?.page || page),
        pageSize: Number(result?.pagination?.pageSize || pageSize),
        total: Number(result?.pagination?.total || 0),
        totalPages: Number(result?.pagination?.totalPages || 1),
        hasPreviousPage: Boolean(result?.pagination?.hasPreviousPage),
        hasNextPage: Boolean(result?.pagination?.hasNextPage),
      });
    } catch (error) {
      setAlerts([]);
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error cargando las alertas.",
      });
    } finally {
      setLoading(false);
    }
  }, [filter, page, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAlerts();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAlerts]);

  const createManualAlert = async (event: FormEvent) => {
    event.preventDefault();
    setCreatingManualAlert(true);
    setBanner(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
      }

      const response = await fetch("/api/admin/license-alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          licenseText: manualLicenseText,
          productNote: manualProductNote,
          note: manualNote,
          daysUntilAlert: manualDays,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "No se pudo crear la alerta manual.");
      }

      setManualLicenseText("");
      setManualProductNote("");
      setManualNote("");
      setManualDays("0");
      setBanner({ kind: "success", text: "Alerta manual creada correctamente." });
      window.dispatchEvent(new Event("license-alerts-updated"));
      await loadAlerts();
    } catch (error) {
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error creando la alerta manual.",
      });
    } finally {
      setCreatingManualAlert(false);
    }
  };

  const completeAlert = async (alertId: string) => {
    setSavingId(alertId);
    setBanner(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
      }

      const response = await fetch("/api/admin/license-alerts/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ alertId }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "No se pudo completar la alerta.");
      }

      setBanner({
        kind: "success",
        text: "Alerta realizada y eliminada. Ya puedes crear una nueva renovación para esta cuenta.",
      });
      window.dispatchEvent(new Event("license-alerts-updated"));
      await loadAlerts();
    } catch (error) {
      setBanner({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error marcando la alerta como realizada.",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-6 text-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Administración
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Alertas de licencias
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
            Revisa los accesos vencidos que requieren cambio de contraseña. El
            punto rojo del menú se mantiene mientras existan alertas pendientes
            vencidas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAlerts()}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Actualizar
        </button>
      </div>

      {banner && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${banner.kind === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">
            Requieren acción
          </p>
          <p className="mt-3 text-4xl font-black text-red-600">{stats.pendingDueCount}</p>
          <p className="mt-2 text-sm text-slate-500">Vencidas o para hoy.</p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">
            Pendientes totales
          </p>
          <p className="mt-3 text-4xl font-black text-amber-600">{stats.pendingTotalCount}</p>
          <p className="mt-2 text-sm text-slate-500">Incluye próximas alertas.</p>
        </div>

        <div className="rounded-[28px] border border-emerald-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-500">
            Realizadas
          </p>
          <p className="mt-3 text-4xl font-black text-emerald-600">
            {stats.completedCount}
          </p>
          <p className="mt-2 text-sm text-slate-500">Historial de gestión.</p>
        </div>
      </div>


      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Crear alerta manual</h2>
          <p className="mt-1 text-sm text-slate-500">
            Úsala cuando quieras programar un aviso para una licencia entregada por fuera del flujo automático.
          </p>
        </div>

        <form onSubmit={createManualAlert} className="grid gap-4 lg:grid-cols-[1.2fr_1fr_160px_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Datos de la licencia entregada
            </label>
            <input
              value={manualLicenseText}
              onChange={(event) => setManualLicenseText(event.target.value)}
              placeholder="correo@gmail.com clave123 perfil1"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Nota para identificar producto/cliente
            </label>
            <input
              value={manualProductNote}
              onChange={(event) => setManualProductNote(event.target.value)}
              placeholder="YouTube cliente Pedro"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Avisar en días
            </label>
            <input
              type="number"
              min="0"
              value={manualDays}
              onChange={(event) => setManualDays(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
            <p className="mt-1 text-xs text-slate-500">Usa 0 para crearla para hoy.</p>
          </div>

          <button
            type="submit"
            disabled={creatingManualAlert}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-70"
          >
            {creatingManualAlert ? "Creando..." : "Crear alerta"}
          </button>

          <div className="lg:col-span-4">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Nota interna opcional
            </label>
            <textarea
              rows={3}
              value={manualNote}
              onChange={(event) => setManualNote(event.target.value)}
              placeholder="Ej: revisar cambio de contraseña, avisar por WhatsApp, renovar cuenta, etc."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </form>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="alert-search" className="sr-only">Buscar alerta</label>
            <input
              id="alert-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por correo o licencia..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["pending", "Pendientes"],
              ["due", "Para realizar"],
              ["renewal", "Renovaciones"],
              ["completed", "Realizadas"],
              ["all", "Todas"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${filter === key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5">
          <h2 className="text-xl font-bold text-slate-900">
            Alertas ({pagination.total})
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-slate-500">Cargando alertas...</div>
        ) : alerts.length === 0 ? (
          <div className="px-5 py-10 text-sm text-slate-500">
            No hay alertas para este filtro.
          </div>
        ) : (
          <div className="grid gap-2 p-2 sm:grid-cols-2 sm:p-3 lg:grid-cols-3">
            {alerts.map((alert) => (
              <article
                key={alert.id}
                className={`rounded-xl border bg-slate-50/80 p-2.5 shadow-sm transition hover:shadow-md ${alert.is_due && alert.status === "pending"
                  ? "border-red-200"
                  : alert.status === "completed"
                    ? "border-emerald-200"
                    : "border-slate-200"
                  }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-bold ${getAlertClasses(
                          alert
                        )}`}
                      >
                        {getAlertLabel(alert)}
                      </span>

                      <h3 className="mt-1 break-words text-lg font-black leading-tight text-slate-900" title={alert.product_name}>
                        {alert.product_name}
                        {alert.variant_name ? ` - ${alert.variant_name}` : ""}
                      </h3>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {alert.status === "pending" && (
                        <button
                          type="button"
                          disabled={savingId === alert.id}
                          onClick={() => void completeAlert(alert.id)}
                          aria-label="Marcar realizada"
                          title="Marcar realizada"
                          className="rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-70"
                        >
                          {savingId === alert.id ? "..." : "OK"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 divide-y divide-slate-200/80 border-t border-slate-200/80">
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <p className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Correo</p>
                    <p className="break-all text-right text-sm font-semibold text-slate-700">{alert.customer_email}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <p className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Vence</p>
                    <p className="text-right text-sm font-semibold text-slate-700">{formatDateTime(alert.access_expires_at || alert.due_at)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <p className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Licencia</p>
                    <p className="break-words text-right font-mono text-sm font-semibold text-slate-700" title={alert.license_text}>{alert.license_text}</p>
                  </div>
                </div>

                {alert.manual_note ? (
                  <p className="mt-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
                    {alert.manual_note}
                  </p>
                ) : null}

                {alert.status === "completed" && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    Realizada el {formatDateTime(alert.completed_at)}.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        {!loading && pagination.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-600">
              Página {pagination.page} de {pagination.totalPages} · {pagination.total} alerta(s)
            </p>

            <div className="flex gap-2">
              <label className="sr-only" htmlFor="alert-page">Ir a página</label>
              <select
                id="alert-page"
                value={pagination.page}
                onChange={(event) => setPage(Number(event.target.value))}
                disabled={loading || pagination.totalPages <= 1}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-slate-400 disabled:opacity-50"
              >
                {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <option key={pageNumber} value={pageNumber}>Página {pageNumber}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pagination.hasPreviousPage || loading}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>

              <button
                type="button"
                disabled={!pagination.hasNextPage || loading}
                onClick={() => setPage((currentPage) => currentPage + 1)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
