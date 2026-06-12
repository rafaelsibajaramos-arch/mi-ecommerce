"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

// ===================== Tipos =====================
type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
};

type TopupRow = {
    id: string;
    user_id: string | null;
    reference: string | null;
    amount: number | null;
    provider: string | null;
    status: string | null;
    payer_origin: string | null;
    created_at: string | null;
    approved_at: string | null;
    credited_at: string | null;
    executed_at: string | null;
    delay_seconds: number | null;
    expired_at: string | null;
    expiration_reason: string | null;
};

type FormattedTopup = TopupRow & {
    email: string;
    full_name: string | null;
};

type AlertRow = {
    id: string;
    topup_id: string;
    reference: string | null;
    amount: number | null;
    provider: string | null;
    requested_at: string | null;
    executed_at: string | null;
    delay_seconds: number | null;
    customer_name: string | null;
    customer_email: string | null;
    executed_by: string | null;
    reason: string | null;
    message: string | null;
    status: string | null;
    reviewed_at: string | null;
    created_at: string | null;
};

type BannerState = { kind: "success" | "error"; text: string } | null;
type MainTab = "HISTORIAL" | "ALERTAS";

const PAGE_SIZE = 10;

// ===================== Helpers =====================
function buildPagination(current: number, total: number): Array<number | "..."> {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, "...", total];
    if (current >= total - 3) return [1, "...", total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
}

function formatMoney(value: number) {
    return `$ ${Number(Math.abs(value || 0)).toLocaleString("es-CO")}`;
}

function formatDate(value: string | null) {
    if (!value) return "Sin fecha";
    try {
        return new Date(value).toLocaleString("es-CO", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return "Sin fecha";
    }
}

function formatDelay(seconds: number | null) {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    if (total === 0) return "—";
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) return `${hrs}h ${mins}min`;
    if (mins > 0) return `${mins} min ${secs}s`;
    return `${secs}s`;
}

// Calcula retraso real entre creación y aprobación (por si delay_seconds viene null en datos viejos)
function computeDelaySeconds(t: FormattedTopup): number | null {
    if (typeof t.delay_seconds === "number") return t.delay_seconds;
    const end = t.executed_at || t.credited_at || t.approved_at;
    if (!t.created_at || !end) return null;
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(t.created_at).getTime()) / 1000));
}

function statusBadge(status: string | null) {
    const s = (status || "PENDING").toUpperCase();
    if (s === "APPROVED")
        return { label: "Aprobada", cls: "border border-emerald-200 bg-emerald-50 text-emerald-700" };
    if (s === "PENDING")
        return { label: "Pendiente", cls: "border border-amber-200 bg-amber-50 text-amber-700" };
    if (s === "EXPIRED")
        return { label: "Expirada", cls: "border border-slate-300 bg-slate-100 text-slate-600" };
    if (s === "REJECTED")
        return { label: "Rechazada", cls: "border border-rose-200 bg-rose-50 text-rose-700" };
    return { label: s, cls: "border border-slate-200 bg-slate-50 text-slate-700" };
}

// ===================== Componente =====================
export default function RecargasAutomaticasPage() {
    const topRef = useRef<HTMLDivElement | null>(null);

    const [mainTab, setMainTab] = useState<MainTab>("HISTORIAL");
    const [banner, setBanner] = useState<BannerState>(null);

    const [topups, setTopups] = useState<FormattedTopup[]>([]);
    const [alerts, setAlerts] = useState<AlertRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [page, setPage] = useState(1);

    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);

        const [topupsRes, alertsRes] = await Promise.all([
            supabase
                .from("wallet_topups")
                .select(
                    "id, user_id, reference, amount, provider, status, payer_origin, created_at, approved_at, credited_at, executed_at, delay_seconds, expired_at, expiration_reason"
                )
                .eq("provider", "BREB_LLAVES")
                .order("created_at", { ascending: false })
                .limit(500),
            supabase
                .from("wallet_topup_alerts")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(300),
        ]);

        if (topupsRes.error || alertsRes.error) {
            setTopups([]);
            setAlerts([]);
            setLoading(false);
            setBanner({ kind: "error", text: "No se pudieron cargar los datos." });
            return;
        }

        const rawTopups = (topupsRes.data as TopupRow[]) || [];
        const userIds = Array.from(
            new Set(rawTopups.map((t) => t.user_id).filter(Boolean))
        ) as string[];

        let profilesData: ProfileRow[] = [];
        if (userIds.length > 0) {
            const { data } = await supabase
                .from("profiles")
                .select("id, email, full_name")
                .in("id", userIds);
            profilesData = (data as ProfileRow[]) || [];
        }

        const profileMap = new Map<string, ProfileRow>();
        profilesData.forEach((p) => profileMap.set(p.id, p));

        const formatted: FormattedTopup[] = rawTopups.map((t) => {
            const profile = t.user_id ? profileMap.get(t.user_id) : null;
            return {
                ...t,
                email: profile?.email || "Sin correo",
                full_name: profile?.full_name || null,
            };
        });

        setTopups(formatted);
        setAlerts((alertsRes.data as AlertRow[]) || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadData(), 0);
        return () => window.clearTimeout(timer);
    }, [loadData]);

    useEffect(() => {
        if (!banner) return;
        const timer = setTimeout(() => setBanner(null), 5000);
        return () => clearTimeout(timer);
    }, [banner]);

    const openAlertsCount = useMemo(
        () => alerts.filter((a) => (a.status || "OPEN").toUpperCase() === "OPEN").length,
        [alerts]
    );

    // ---------- Filtro historial ----------
    const filteredTopups = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return topups.filter((t) => {
            const statusMatch =
                statusFilter === "ALL" || (t.status || "PENDING").toUpperCase() === statusFilter;
            const termMatch =
                !term ||
                t.email.toLowerCase().includes(term) ||
                (t.reference || "").toLowerCase().includes(term) ||
                (t.payer_origin || "").toLowerCase().includes(term);
            return statusMatch && termMatch;
        });
    }, [topups, statusFilter, searchTerm]);

    // ---------- Filtro alertas ----------
    const filteredAlerts = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return alerts.filter((a) => {
            const termMatch =
                !term ||
                (a.customer_email || "").toLowerCase().includes(term) ||
                (a.customer_name || "").toLowerCase().includes(term) ||
                (a.reference || "").toLowerCase().includes(term);
            return termMatch;
        });
    }, [alerts, searchTerm]);

    const activeList = mainTab === "HISTORIAL" ? filteredTopups : filteredAlerts;
    const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
    const effectivePage = Math.min(page, totalPages);
    const pageStart = activeList.length === 0 ? 0 : (effectivePage - 1) * PAGE_SIZE + 1;
    const pageEnd = Math.min(effectivePage * PAGE_SIZE, activeList.length);

    const paginatedTopups = useMemo(
        () => filteredTopups.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
        [filteredTopups, effectivePage]
    );
    const paginatedAlerts = useMemo(
        () => filteredAlerts.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
        [filteredAlerts, effectivePage]
    );

    const paginationItems = useMemo(
        () => buildPagination(effectivePage, totalPages),
        [effectivePage, totalPages]
    );

    function handlePageChange(next: number) {
        setPage(next);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function switchTab(t: MainTab) {
        setMainTab(t);
        setPage(1);
    }

    async function updateAlertStatus(alert: AlertRow, newStatus: "REVIEWED" | "DISMISSED" | "OPEN") {
        setUpdatingId(alert.id);
        setBanner(null);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        const { error } = await supabase
            .from("wallet_topup_alerts")
            .update({
                status: newStatus,
                reviewed_by: newStatus === "OPEN" ? null : user?.id || null,
                reviewed_at: newStatus === "OPEN" ? null : new Date().toISOString(),
            })
            .eq("id", alert.id);

        if (error) {
            setBanner({ kind: "error", text: "No se pudo actualizar la alerta." });
            setUpdatingId(null);
            return;
        }

        setBanner({
            kind: "success",
            text:
                newStatus === "REVIEWED"
                    ? "Alerta marcada como revisada."
                    : newStatus === "DISMISSED"
                        ? "Alerta descartada."
                        : "Alerta reabierta.",
        });

        await loadData();
        setUpdatingId(null);
    }

    // ===================== Render =====================
    return (
        <section ref={topRef} className="space-y-6 pb-6 text-slate-900">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Admin
                </p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                    Recargas automáticas
                </h1>
                <p className="mt-2 text-sm text-slate-600 sm:text-base">
                    Historial de recargas Bre-B / Llaves y alertas de recargas que se aprobaron
                    con demora (riesgo de doble acreditación por recarga manual de soporte).
                </p>
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

            {/* Pestañas principales */}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => switchTab("HISTORIAL")}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition ${mainTab === "HISTORIAL"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                >
                    Historial de recargas
                </button>

                <button
                    type="button"
                    onClick={() => switchTab("ALERTAS")}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition ${mainTab === "ALERTAS"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                >
                    Alertas de demora
                    {openAlertsCount > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                            {openAlertsCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={loadData}
                    className="ml-auto inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                    Actualizar
                </button>
            </div>

            {/* Buscador + filtro de estado */}
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Buscar por correo, referencia o remitente
                        </label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setPage(1);
                            }}
                            placeholder="cliente@email.com / BREB-..."
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                        />
                    </div>

                    {mainTab === "HISTORIAL" && (
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                Estado
                            </label>
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white md:w-48"
                            >
                                <option value="ALL">Todos</option>
                                <option value="PENDING">Pendiente</option>
                                <option value="APPROVED">Aprobada</option>
                                <option value="EXPIRED">Expirada</option>
                                <option value="REJECTED">Rechazada</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* ============ TABLA HISTORIAL ============ */}
                {mainTab === "HISTORIAL" && (
                    <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                        {loading ? (
                            <div className="px-5 py-8 text-sm text-slate-500">Cargando recargas...</div>
                        ) : filteredTopups.length === 0 ? (
                            <div className="px-5 py-8 text-sm text-slate-500">
                                No hay recargas con ese filtro.
                            </div>
                        ) : (
                            <>
                                <div className="hidden grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.9fr] gap-4 border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-500 md:grid">
                                    <span>Usuario</span>
                                    <span>Monto</span>
                                    <span>Estado</span>
                                    <span>Solicitada</span>
                                    <span>Demora</span>
                                </div>

                                <div className="divide-y divide-slate-200">
                                    {paginatedTopups.map((t) => {
                                        const badge = statusBadge(t.status);
                                        const delay = computeDelaySeconds(t);
                                        const isLate = (delay || 0) > 300; // +5 min
                                        return (
                                            <div key={t.id} className="px-5 py-5 md:px-6">
                                                <div className="grid gap-4 md:grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.9fr] md:items-center">
                                                    <div className="min-w-0">
                                                        <p className="break-all text-sm font-semibold text-slate-900">
                                                            {t.email}
                                                        </p>
                                                        {t.payer_origin && (
                                                            <p className="mt-0.5 text-xs text-slate-500">
                                                                De: {t.payer_origin}
                                                            </p>
                                                        )}
                                                        {t.reference && (
                                                            <p className="mt-0.5 break-all text-[11px] text-slate-400">
                                                                {t.reference}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                                                            Monto
                                                        </p>
                                                        <p className="text-sm font-bold text-slate-900">
                                                            {formatMoney(Number(t.amount || 0))}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                                                            Estado
                                                        </p>
                                                        <span
                                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                                                            Solicitada
                                                        </p>
                                                        <p className="text-sm text-slate-700">
                                                            {formatDate(t.created_at)}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:hidden">
                                                            Demora
                                                        </p>
                                                        <span
                                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${isLate
                                                                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                                                                    : "border border-slate-200 bg-slate-50 text-slate-600"
                                                                }`}
                                                        >
                                                            {formatDelay(delay)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ============ LISTA ALERTAS ============ */}
                {mainTab === "ALERTAS" && (
                    <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                        {loading ? (
                            <div className="px-5 py-8 text-sm text-slate-500">Cargando alertas...</div>
                        ) : filteredAlerts.length === 0 ? (
                            <div className="px-5 py-8 text-sm text-slate-500">
                                No hay alertas de demora. Todo se está aprobando dentro de los 5 minutos. ✅
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {paginatedAlerts.map((alert) => {
                                    const isOpen = (alert.status || "OPEN").toUpperCase() === "OPEN";
                                    const expanded = expandedId === alert.id;
                                    const sLabel =
                                        (alert.status || "OPEN").toUpperCase() === "OPEN"
                                            ? "Abierta"
                                            : (alert.status || "").toUpperCase() === "REVIEWED"
                                                ? "Revisada"
                                                : "Descartada";
                                    const sCls =
                                        (alert.status || "OPEN").toUpperCase() === "OPEN"
                                            ? "border border-amber-200 bg-amber-50 text-amber-700"
                                            : (alert.status || "").toUpperCase() === "REVIEWED"
                                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border border-slate-200 bg-slate-50 text-slate-600";

                                    return (
                                        <div key={alert.id} className="px-5 py-5 md:px-6">
                                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${sCls}`}
                                                        >
                                                            {sLabel}
                                                        </span>
                                                        <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rose-700">
                                                            Demoró {formatDelay(alert.delay_seconds)}
                                                        </span>
                                                    </div>

                                                    <p className="mt-3 break-all text-sm font-semibold text-slate-900">
                                                        {alert.customer_email || "Sin correo"}
                                                    </p>
                                                    {alert.customer_name && (
                                                        <p className="mt-0.5 text-xs text-slate-500">
                                                            {alert.customer_name}
                                                        </p>
                                                    )}

                                                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                Monto
                                                            </p>
                                                            <p className="mt-1 text-sm font-bold text-slate-900">
                                                                {formatMoney(Number(alert.amount || 0))}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                Solicitada
                                                            </p>
                                                            <p className="mt-1 text-sm text-slate-700">
                                                                {formatDate(alert.requested_at)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                Aprobada
                                                            </p>
                                                            <p className="mt-1 text-sm text-slate-700">
                                                                {formatDate(alert.executed_at)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                Referencia
                                                            </p>
                                                            <p className="mt-1 break-all text-sm text-slate-700">
                                                                {alert.reference || "N/A"}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedId(expanded ? null : alert.id)}
                                                        className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
                                                    >
                                                        {expanded ? "Ocultar detalle" : "Ver detalle completo"}
                                                    </button>

                                                    {expanded && alert.message && (
                                                        <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                                                            {alert.message}
                                                        </pre>
                                                    )}
                                                </div>

                                                <div className="flex flex-row gap-2 md:flex-col md:items-end">
                                                    {isOpen ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => updateAlertStatus(alert, "REVIEWED")}
                                                                disabled={updatingId === alert.id}
                                                                className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                                                            >
                                                                {updatingId === alert.id ? "..." : "Marcar revisada"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => updateAlertStatus(alert, "DISMISSED")}
                                                                disabled={updatingId === alert.id}
                                                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                                                            >
                                                                Descartar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateAlertStatus(alert, "OPEN")}
                                                            disabled={updatingId === alert.id}
                                                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                                        >
                                                            {updatingId === alert.id ? "..." : "Reabrir"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Paginación */}
                {!loading && activeList.length > 0 && (
                    <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm text-slate-600">
                            Mostrando <span className="font-semibold">{pageStart}</span> -{" "}
                            <span className="font-semibold">{pageEnd}</span> de{" "}
                            <span className="font-semibold">{activeList.length}</span>{" "}
                            {mainTab === "HISTORIAL" ? "recargas" : "alertas"}
                        </p>

                        {totalPages > 1 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handlePageChange(Math.max(effectivePage - 1, 1))}
                                    disabled={effectivePage === 1}
                                    className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    ‹
                                </button>

                                {paginationItems.map((item, index) =>
                                    item === "..." ? (
                                        <span
                                            key={`ra-ellipsis-${index}`}
                                            className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-transparent px-3 text-sm font-semibold text-slate-400"
                                        >
                                            ...
                                        </span>
                                    ) : (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => handlePageChange(item)}
                                            className={`flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition ${effectivePage === item
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
                                    onClick={() => handlePageChange(Math.min(effectivePage + 1, totalPages))}
                                    disabled={effectivePage === totalPages}
                                    className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    ›
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}