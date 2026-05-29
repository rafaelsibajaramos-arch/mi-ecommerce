"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import {
  IMAGE_INPUT_ACCEPT,
  convertImageFileToWebp,
  createImageStoragePath,
} from "../../../../lib/imageUpload";

type ProductType = "simple" | "variable" | "composite";

type VariantRow = {
  id?: string;
  tempId: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  stock: string;
  image_url: string;
  imageFile: File | null;
  is_active: boolean;
  sort_order: number;
  priorityLicenseRows: LicenseEditorRow[];
  newPriorityLicensesInput: string;
  accessDurationMonths: string;
  defaultLicenseBillingMonths: string;
};

type ComponentRow = {
  id?: string;
  tempId: string;
  child_product_id: string;
  child_variant_id: string;
  quantity: string;
  sort_order: number;
};

type ProductOption = {
  id: string;
  name: string;
  product_type: ProductType;
  is_active: boolean;
};

type ProductVariantOption = {
  id: string;
  product_id: string;
  name: string;
  is_active: boolean;
};

type ProductLicenseRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  license_text: string;
  status: "available" | "assigned" | "disabled";
  is_priority: boolean;
  billing_duration_days: number | null;
  billing_duration_months: number | null;
  requires_rotation_alert: boolean | null;
  license_mode: "individual" | "shared" | null;
  max_active_users: number | null;
};

type LicenseEditorRow = {
  id?: string;
  tempId: string;
  licenseText: string;
  billingDurationDays: string;
};

type ProductVariantDbRow = {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  price: number | null;
  stock: number | null;
  image_url: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  access_duration_months: number | null;
  default_license_billing_months: number | null;
};

type ProductComponentDbRow = {
  id: string;
  child_product_id: string | null;
  child_variant_id: string | null;
  quantity: number | null;
  sort_order: number | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

function makeTempId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function makeVariantSlug(productName: string, variantName: string) {
  return slugify(productName + " " + variantName);
}

function normalizeLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function rowsToLicenseText(rows: LicenseEditorRow[]) {
  return rows.map((row) => row.licenseText).join("\n");
}

function buildLicenseRowsFromText(
  text: string,
  currentRows: LicenseEditorRow[]
): LicenseEditorRow[] {
  const lines = normalizeLines(text);
  const usedIndexes = new Set<number>();

  return lines.map((line, index) => {
    const sameIndexRow = currentRows[index];

    if (sameIndexRow && sameIndexRow.licenseText === line && !usedIndexes.has(index)) {
      usedIndexes.add(index);
      return sameIndexRow;
    }

    const matchingIndex = currentRows.findIndex(
      (row, rowIndex) =>
        !usedIndexes.has(rowIndex) && row.licenseText.trim() === line
    );

    if (matchingIndex >= 0) {
      usedIndexes.add(matchingIndex);
      return currentRows[matchingIndex];
    }

    return {
      tempId: makeTempId(),
      licenseText: line,
      billingDurationDays: String(DEFAULT_BILLING_DAYS),
    };
  });
}

const DEFAULT_BILLING_DAYS = 30;

function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();

  result.setMonth(result.getMonth() + months);

  if (result.getDate() !== originalDay) {
    result.setDate(0);
  }

  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function inferAccessDurationMonths(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const monthMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(mes|meses|m)\b/);
  if (monthMatch) {
    const months = Number(monthMatch[1].replace(",", "."));
    if (Number.isFinite(months) && months > 0) return Math.ceil(months);
  }

  const dayMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(dia|dias|d)\b/);
  if (dayMatch) {
    const days = Number(dayMatch[1].replace(",", "."));
    if (Number.isFinite(days) && days > 0) return Math.max(1, Math.ceil(days / 30));
  }

  return 1;
}

function normalizeBillingDurationDays(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return DEFAULT_BILLING_DAYS;

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULT_BILLING_DAYS;
  }

  return Math.floor(numericValue);
}

function resolveLicenseBillingDays(row: ProductLicenseRow) {
  return normalizeBillingDurationDays(
    row.billing_duration_days ||
      (row.billing_duration_months ? row.billing_duration_months * 30 : null)
  );
}

function mapLicenseRowToEditor(row: ProductLicenseRow): LicenseEditorRow {
  return {
    id: row.id,
    tempId: row.id || makeTempId(),
    licenseText: row.license_text || "",
    billingDurationDays: String(resolveLicenseBillingDays(row)),
  };
}

function isInvalidBillingDays(value: string) {
  if (!value.trim()) return false;

  const numericValue = Number(value);

  return !Number.isFinite(numericValue) || numericValue <= 0;
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200";

const inputSoftClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200";

const fileInputClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white";

const checkboxClass =
  "h-5 w-5 rounded border-slate-300 accent-slate-900 cursor-pointer";

function SectionCard({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          ) : null}
        </div>

        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-5 py-5">{children}</div>
      ) : null}
    </section>
  );
}


function LicenseRowsEditor({
  title,
  subtitle,
  rows,
  licensesText,
  onLicensesTextChange,
  onSyncLicensesFromText,
  onRemoveLicense,
  onBillingDaysChange,
  inputClassName,
  textareaClassName,
}: {
  title: string;
  subtitle?: string;
  rows: LicenseEditorRow[];
  licensesText: string;
  onLicensesTextChange: (value: string) => void;
  onSyncLicensesFromText: () => void;
  onRemoveLicense: (tempId: string) => void;
  onBillingDaysChange: (tempId: string, value: string) => void;
  inputClassName: string;
  textareaClassName: string;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          Módulo de licencias
        </label>
        <textarea
          rows={6}
          value={licensesText}
          onChange={(event) => onLicensesTextChange(event.target.value)}
          placeholder={`correo@gmail.com clave123 perfil1\ncorreo2@gmail.com clave456 perfil2`}
          className={`${textareaClassName} font-mono text-sm`}
        />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Pega, borra o reordena una licencia por línea. Luego presiona actualizar listado para que abajo queden separadas con su duración.
          </p>
          <button
            type="button"
            onClick={onSyncLicensesFromText}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            Actualizar listado
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">
            Licencias guardadas/separadas
          </p>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {rows.length} licencia(s)
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Todavía no hay licencias en este módulo. Escribe las licencias arriba y presiona actualizar listado.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={row.tempId}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_170px_44px] md:items-end"
              >
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    Licencia #{index + 1}
                  </label>
                  <input
                    type="text"
                    value={row.licenseText}
                    readOnly
                    className={`${inputClassName} bg-white font-mono text-sm`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    Facturación días
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={row.billingDurationDays}
                    onChange={(event) =>
                      onBillingDaysChange(row.tempId, event.target.value)
                    }
                    placeholder="30"
                    className={inputClassName}
                  />
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    Vacío = 30 días.
                  </p>
                </div>

                <button
                  type="button"
                  title="Eliminar licencia"
                  aria-label={`Eliminar licencia ${index + 1}`}
                  onClick={() => onRemoveLicense(row.tempId)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-white text-xl font-black leading-none text-red-600 transition hover:bg-red-50"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditProductPage() {
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [productType, setProductType] = useState<ProductType>("simple");

  const [avoidRepeatLicense, setAvoidRepeatLicense] = useState(false);
  const [usePriorityLicenses, setUsePriorityLicenses] = useState(true);
  const [enableLicenseAlerts, setEnableLicenseAlerts] = useState(false);

  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [generalLicenseRows, setGeneralLicenseRows] = useState<LicenseEditorRow[]>([]);
  const [newGeneralLicensesInput, setNewGeneralLicensesInput] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentRow[]>([]);

  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);
  const [allVariants, setAllVariants] = useState<ProductVariantOption[]>([]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const previewUrl = useMemo(() => {
    if (!imageFile) return "";
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  const productNameMap = useMemo(() => {
    return Object.fromEntries(allProducts.map((p) => [p.id, p.name]));
  }, [allProducts]);

  const variantNameMap = useMemo(() => {
    return Object.fromEntries(allVariants.map((v) => [v.id, v.name]));
  }, [allVariants]);

  const variantOptionsByProduct = useMemo(() => {
    const grouped: Record<string, ProductVariantOption[]> = {};
    for (const item of allVariants) {
      if (!grouped[item.product_id]) grouped[item.product_id] = [];
      grouped[item.product_id].push(item);
    }
    return grouped;
  }, [allVariants]);

  const fetchProduct = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      setMessage("No se pudo cargar el producto.");
      return;
    }

    setName(data.name || "");
    setSlug(data.slug || "");
    setDescription(data.description || "");
    setPrice(String(data.price ?? ""));
    setStock(String(data.stock ?? 0));
    setCategory(data.category || "");
    setIsActive(Boolean(data.is_active));
    setProductType((data.product_type || "simple") as ProductType);
    setAvoidRepeatLicense(Boolean(data.avoid_repeat_license));
    setUsePriorityLicenses(Boolean(data.use_priority_licenses));
    setEnableLicenseAlerts(Boolean(data.enable_license_alerts));
    setCurrentImageUrl(data.image_url || "");
  };

  const fetchVariants = async () => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMessage("No se pudieron cargar las variantes.");
      return;
    }

    setVariants(
      ((data as ProductVariantDbRow[] | null) || []).map((item, index) => ({
        id: item.id,
        tempId: item.id || makeTempId(),
        name: item.name || "",
        slug: item.slug || "",
        description: item.description || "",
        price: String(item.price ?? ""),
        stock: String(item.stock ?? 0),
        image_url: item.image_url || "",
        imageFile: null,
        is_active: Boolean(item.is_active),
        sort_order: item.sort_order ?? index,
        priorityLicenseRows: [],
        newPriorityLicensesInput: "",
        accessDurationMonths: item.access_duration_months
          ? String(item.access_duration_months)
          : "",
        defaultLicenseBillingMonths: item.default_license_billing_months
          ? String(item.default_license_billing_months)
          : "",
      }))
    );
  };

  const fetchComponents = async () => {
    const { data, error } = await supabase
      .from("product_components")
      .select("*")
      .eq("product_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMessage("No se pudieron cargar los componentes.");
      return;
    }

    setComponents(
      ((data as ProductComponentDbRow[] | null) || []).map((item, index) => ({
        id: item.id,
        tempId: item.id || makeTempId(),
        child_product_id: item.child_product_id || "",
        child_variant_id: item.child_variant_id || "",
        quantity: String(item.quantity ?? 1),
        sort_order: item.sort_order ?? index,
      }))
    );
  };

  const fetchCatalogData = async () => {
    const [{ data: productsData }, { data: variantsData }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, product_type, is_active")
        .neq("id", id)
        .order("name", { ascending: true }),
      supabase
        .from("product_variants")
        .select("id, product_id, name, is_active")
        .order("name", { ascending: true }),
    ]);

    setAllProducts((productsData as ProductOption[]) || []);
    setAllVariants((variantsData as ProductVariantOption[]) || []);
  };

  const fetchLicenses = async () => {
    const { data, error } = await supabase
      .from("product_licenses")
      .select("id, product_id, variant_id, license_text, status, is_priority, billing_duration_days, billing_duration_months, requires_rotation_alert, license_mode, max_active_users")
      .eq("product_id", id)
      .eq("status", "available")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage("No se pudieron cargar las licencias.");
      return;
    }

    const rows = (data as ProductLicenseRow[]) || [];

    const generalRows = rows
      .filter((row) => !row.variant_id && !row.is_priority)
      .map(mapLicenseRowToEditor);

    setGeneralLicenseRows(generalRows);
    setNewGeneralLicensesInput(rowsToLicenseText(generalRows));

    setVariants((prev) =>
      prev.map((variant) => {
        if (!variant.id) return variant;

        const priorityRows = rows
          .filter(
            (row) => row.variant_id === variant.id && row.is_priority === true
          )
          .map(mapLicenseRowToEditor);

        return {
          ...variant,
          priorityLicenseRows: priorityRows,
          newPriorityLicensesInput: rowsToLicenseText(priorityRows),
          stock: String(priorityRows.length),
        };
      })
    );
  };

  const loadAll = async () => {
    setLoading(true);
    setMessage("");

    await Promise.all([
      fetchProduct(),
      fetchVariants(),
      fetchComponents(),
      fetchCatalogData(),
    ]);

    setLoading(false);
  };

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  useEffect(() => {
    if (!loading) {
      fetchLicenses();
    }
  }, [loading]);

  useEffect(() => {
    setStock(String(generalLicenseRows.length));
  }, [generalLicenseRows.length]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        tempId: makeTempId(),
        name: "",
        slug: "",
        description: "",
        price: "",
        stock: "0",
        image_url: "",
        imageFile: null,
        is_active: true,
        sort_order: prev.length,
        priorityLicenseRows: [],
        newPriorityLicensesInput: "",
        accessDurationMonths: "",
        defaultLicenseBillingMonths: "",
      },
    ]);
  };

  const updateVariant = (
    tempId: string,
    field: keyof VariantRow,
    value: string | number | boolean
  ) => {
    setVariants((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;

        const updated = { ...item, [field]: value };

        if (field === "name") {
          updated.slug = makeVariantSlug(name, String(value));
        }

        return updated;
      })
    );
  };

  const updateVariantImageFile = (tempId: string, file: File | null) => {
    setVariants((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, imageFile: file } : item
      )
    );
  };

  const removeVariant = (tempId: string) => {
    setVariants((prev) => {
      const found = prev.find((item) => item.tempId === tempId);
      if (found?.id) {
        setDeletedVariantIds((curr) => [...curr, found.id!]);
      }
      return prev.filter((item) => item.tempId !== tempId);
    });
  };

  const addComponent = () => {
    setComponents((prev) => [
      ...prev,
      {
        tempId: makeTempId(),
        child_product_id: "",
        child_variant_id: "",
        quantity: "1",
        sort_order: prev.length,
      },
    ]);
  };

  const updateComponent = (
    tempId: string,
    field: keyof ComponentRow,
    value: string | number
  ) => {
    setComponents((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, [field]: value } : item
      )
    );
  };

  const removeComponent = (tempId: string) => {
    setComponents((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const syncGeneralLicensesFromText = () => {
    const nextRows = buildLicenseRowsFromText(
      newGeneralLicensesInput,
      generalLicenseRows
    );

    setGeneralLicenseRows(nextRows);
    setNewGeneralLicensesInput(rowsToLicenseText(nextRows));
  };

  const updateGeneralLicenseBillingDays = (tempId: string, value: string) => {
    setGeneralLicenseRows((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, billingDurationDays: value } : item
      )
    );
  };

  const removeGeneralLicenseRow = (tempId: string) => {
    setGeneralLicenseRows((prev) => {
      const nextRows = prev.filter((item) => item.tempId !== tempId);
      setNewGeneralLicensesInput(rowsToLicenseText(nextRows));
      return nextRows;
    });
  };

  const syncVariantLicensesFromText = (tempId: string) => {
    setVariants((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;

        const nextRows = buildLicenseRowsFromText(
          item.newPriorityLicensesInput,
          item.priorityLicenseRows
        );

        return {
          ...item,
          priorityLicenseRows: nextRows,
          newPriorityLicensesInput: rowsToLicenseText(nextRows),
          stock: String(nextRows.length),
        };
      })
    );
  };

  const updateVariantLicenseBillingDays = (
    variantTempId: string,
    licenseTempId: string,
    value: string
  ) => {
    setVariants((prev) =>
      prev.map((variant) =>
        variant.tempId === variantTempId
          ? {
              ...variant,
              priorityLicenseRows: variant.priorityLicenseRows.map((license) =>
                license.tempId === licenseTempId
                  ? { ...license, billingDurationDays: value }
                  : license
              ),
            }
          : variant
      )
    );
  };

  const removeVariantLicenseRow = (variantTempId: string, licenseTempId: string) => {
    setVariants((prev) =>
      prev.map((variant) => {
        if (variant.tempId !== variantTempId) return variant;

        const nextRows = variant.priorityLicenseRows.filter(
          (license) => license.tempId !== licenseTempId
        );

        return {
          ...variant,
          priorityLicenseRows: nextRows,
          newPriorityLicensesInput: rowsToLicenseText(nextRows),
          stock: String(nextRows.length),
        };
      })
    );
  };

  const syncAvailableLicenses = async ({
    productId,
    variantId,
    rows,
    isPriority,
    requiresRotationAlert,
    licenseMode,
    maxActiveUsers,
  }: {
    productId: string;
    variantId: string | null;
    rows: LicenseEditorRow[];
    isPriority: boolean;
    requiresRotationAlert: boolean;
    licenseMode: "individual" | "shared";
    maxActiveUsers: number;
  }) => {
    let query = supabase
      .from("product_licenses")
      .select("id")
      .eq("product_id", productId)
      .eq("status", "available")
      .eq("is_priority", isPriority);

    if (variantId) {
      query = query.eq("variant_id", variantId);
    } else {
      query = query.is("variant_id", null);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const existingRows = (data as { id: string }[]) || [];
    const existingIds = existingRows.map((row) => row.id);
    const normalizedRows = rows
      .map((row) => ({
        licenseText: row.licenseText.trim(),
        billingDurationDays: normalizeBillingDurationDays(row.billingDurationDays),
      }))
      .filter((row) => row.licenseText);
    const now = new Date();

    if (existingIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("product_licenses")
        .delete()
        .in("id", existingIds);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    for (const [index, row] of normalizedRows.entries()) {
      const createdAt = new Date(now.getTime() + index).toISOString();
      const billingEndsAt = addDays(now, row.billingDurationDays).toISOString();

      const { error: insertError } = await supabase.from("product_licenses").insert([
        {
          product_id: productId,
          variant_id: variantId,
          status: "available",
          is_priority: isPriority,
          license_text: row.licenseText,
          billing_duration_days: row.billingDurationDays,
          billing_duration_months: Math.max(1, Math.ceil(row.billingDurationDays / 30)),
          billing_starts_at: now.toISOString(),
          billing_ends_at: billingEndsAt,
          requires_rotation_alert: requiresRotationAlert,
          license_mode: licenseMode,
          max_active_users: maxActiveUsers,
          created_at: createdAt,
        },
      ]);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const cleanName = name.trim();
    const cleanSlug = slugify(cleanName);
    const cleanCategory = category.trim();
    const numericPrice = Number(price || 0);
    const effectiveGeneralLicenseRows = buildLicenseRowsFromText(
      newGeneralLicensesInput,
      generalLicenseRows
    );
    const effectiveVariants = variants.map((variant) => {
      const priorityLicenseRows = buildLicenseRowsFromText(
        variant.newPriorityLicensesInput,
        variant.priorityLicenseRows
      );

      return {
        ...variant,
        priorityLicenseRows,
        newPriorityLicensesInput: rowsToLicenseText(priorityLicenseRows),
        stock: String(priorityLicenseRows.length),
      };
    });
    const autoGeneralStock = effectiveGeneralLicenseRows.length;
    const inferredProductAccessDurationMonths = enableLicenseAlerts
      ? inferAccessDurationMonths(`${cleanName} ${description}`)
      : null;

    if (!cleanName) {
      setMessage("Completa el nombre del producto.");
      setSaving(false);
      return;
    }


    for (const row of effectiveGeneralLicenseRows) {
      if (isInvalidBillingDays(row.billingDurationDays)) {
        setMessage(`La facturación de la licencia "${row.licenseText}" no es válida.`);
        setSaving(false);
        return;
      }
    }

    for (const variant of effectiveVariants) {
      for (const row of variant.priorityLicenseRows) {
        if (isInvalidBillingDays(row.billingDurationDays)) {
          setMessage(
            `La facturación de la licencia "${row.licenseText}" en la variante "${variant.name || "sin nombre"}" no es válida.`
          );
          setSaving(false);
          return;
        }
      }
    }

    if (
      productType !== "composite" &&
      (Number.isNaN(numericPrice) || numericPrice < 0)
    ) {
      setMessage("El precio del producto no es válido.");
      setSaving(false);
      return;
    }

    if (productType === "variable") {
      if (effectiveVariants.length === 0) {
        setMessage("Agrega al menos una variante.");
        setSaving(false);
        return;
      }

      for (const item of effectiveVariants) {
        if (!item.name.trim()) {
          setMessage("Todas las variantes deben tener nombre.");
          setSaving(false);
          return;
        }

        if (Number.isNaN(Number(item.price)) || Number(item.price) < 0) {
          setMessage(
            `La variante "${item.name || "sin nombre"}" tiene precio inválido.`
          );
          setSaving(false);
          return;
        }
      }
    }

    if (productType === "composite") {
      if (components.length < 2) {
        setMessage("Agrega al menos 2 componentes al combo.");
        setSaving(false);
        return;
      }

      for (const item of components) {
        if (!item.child_product_id) {
          setMessage("Todos los componentes deben tener un producto.");
          setSaving(false);
          return;
        }

        if (item.child_product_id === id) {
          setMessage("Un combo no puede incluirse a sí mismo.");
          setSaving(false);
          return;
        }

        if (Number.isNaN(Number(item.quantity)) || Number(item.quantity) <= 0) {
          setMessage("La cantidad de cada componente debe ser mayor que 0.");
          setSaving(false);
          return;
        }
      }
    }

    try {
      let finalImageUrl = currentImageUrl || null;

      if (imageFile) {
        const webpImageFile = await convertImageFileToWebp(imageFile);
        const filePath = createImageStoragePath("products");

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, webpImageFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType: webpImageFile.type,
          });

        if (uploadError) {
          setMessage("Error subiendo imagen: " + uploadError.message);
          setSaving(false);
          return;
        }

        const { data } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        finalImageUrl = data.publicUrl;
      }

      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: cleanName,
          slug: cleanSlug || null,
          description: description.trim() || null,
          category: cleanCategory || null,
          price: numericPrice,
          stock: autoGeneralStock,
          image_url: finalImageUrl,
          is_active: isActive,
          product_type: productType,
          avoid_repeat_license: avoidRepeatLicense,
          use_priority_licenses: usePriorityLicenses,
          fallback_to_general_licenses: true,
          enable_license_alerts: enableLicenseAlerts,
          access_duration_months: inferredProductAccessDurationMonths,
          default_license_billing_months: null,
          default_license_requires_rotation_alert: enableLicenseAlerts,
          default_license_mode: "individual",
          default_max_active_users: 1,
        })
        .eq("id", id);

      if (updateError) {
        setMessage("Error actualizando producto: " + updateError.message);
        setSaving(false);
        return;
      }

      if (deletedVariantIds.length > 0) {
        const { error: deleteVariantsError } = await supabase
          .from("product_variants")
          .delete()
          .in("id", deletedVariantIds);

        if (deleteVariantsError) {
          setMessage(
            "Error eliminando variantes: " + deleteVariantsError.message
          );
          setSaving(false);
          return;
        }
      }

      const variantIdMapByTempId: Record<string, string> = {};

      for (let index = 0; index < variants.length; index++) {
        const item = variants[index];
        const priorityLicenseRows = item.priorityLicenseRows;

        let finalVariantImageUrl = item.image_url.trim() || null;

        if (item.imageFile) {
          const webpVariantImageFile = await convertImageFileToWebp(
            item.imageFile
          );
          const filePath = createImageStoragePath("variants");

          const { error: uploadVariantImageError } = await supabase.storage
            .from("product-images")
            .upload(filePath, webpVariantImageFile, {
              cacheControl: "31536000",
              upsert: false,
              contentType: webpVariantImageFile.type,
            });

          if (uploadVariantImageError) {
            setMessage(
              `Error subiendo imagen de variante "${
                item.name || "sin nombre"
              }": ${uploadVariantImageError.message}`
            );
            setSaving(false);
            return;
          }

          const { data: variantImageData } = supabase.storage
            .from("product-images")
            .getPublicUrl(filePath);

          finalVariantImageUrl = variantImageData.publicUrl;
        }

        const payload = {
          product_id: id,
          name: item.name.trim(),
          slug: makeVariantSlug(cleanName, item.name),
          description: item.description.trim() || null,
          price: Number(item.price || 0),
          stock: priorityLicenseRows.length,
          image_url: finalVariantImageUrl,
          is_active: item.is_active,
          sort_order: index,
          access_duration_months: enableLicenseAlerts
            ? inferAccessDurationMonths(`${item.name} ${item.description}`)
            : null,
          default_license_billing_months: null,
        };

        if (item.id) {
          const { error } = await supabase
            .from("product_variants")
            .update(payload)
            .eq("id", item.id);

          if (error) {
            setMessage("Error actualizando variante: " + error.message);
            setSaving(false);
            return;
          }

          variantIdMapByTempId[item.tempId] = item.id;
        } else {
          const { data, error } = await supabase
            .from("product_variants")
            .insert([payload])
            .select("id")
            .single();

          if (error || !data) {
            setMessage("Error creando variante.");
            setSaving(false);
            return;
          }

          variantIdMapByTempId[item.tempId] = data.id;
        }
      }

      if (productType === "composite") {
        const { error: deleteComponentsError } = await supabase
          .from("product_components")
          .delete()
          .eq("product_id", id);

        if (deleteComponentsError) {
          setMessage(
            "Error limpiando componentes: " + deleteComponentsError.message
          );
          setSaving(false);
          return;
        }

        if (components.length > 0) {
          const componentsPayload = components.map((item, index) => ({
            product_id: id,
            child_product_id: item.child_product_id,
            child_variant_id: item.child_variant_id || null,
            quantity: Number(item.quantity || 1),
            sort_order: index,
          }));

          const { error: insertComponentsError } = await supabase
            .from("product_components")
            .insert(componentsPayload);

          if (insertComponentsError) {
            setMessage(
              "Error guardando componentes: " + insertComponentsError.message
            );
            setSaving(false);
            return;
          }
        }
      } else {
        await supabase.from("product_components").delete().eq("product_id", id);
      }

      await syncAvailableLicenses({
        productId: id,
        variantId: null,
        rows: effectiveGeneralLicenseRows,
        isPriority: false,
        requiresRotationAlert: enableLicenseAlerts,
        licenseMode: "individual",
        maxActiveUsers: 1,
      });

      for (const item of effectiveVariants) {
        const variantId = variantIdMapByTempId[item.tempId];
        const priorityLicenseRows = item.priorityLicenseRows;

        if (!variantId) continue;

        await syncAvailableLicenses({
          productId: id,
          variantId,
          rows: priorityLicenseRows,
          isPriority: true,
          requiresRotationAlert: enableLicenseAlerts,
          licenseMode: "individual",
          maxActiveUsers: 1,
        });
      }

      setDeletedVariantIds([]);
      setMessage("Producto actualizado correctamente.");
      await loadAll();
      await fetchLicenses();
    } catch (error) {
      setMessage(
        getErrorMessage(error, "Ocurrió un error guardando el producto.")
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-slate-700">Cargando producto...</div>;
  }

  return (
    <div className="space-y-6 text-slate-900">
      <style jsx global>{`
        input,
        textarea,
        select {
          color: #0f172a !important;
          -webkit-text-fill-color: #0f172a !important;
        }

        input::placeholder,
        textarea::placeholder {
          color: #94a3b8 !important;
          opacity: 1;
          -webkit-text-fill-color: #94a3b8 !important;
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        textarea:-webkit-autofill,
        textarea:-webkit-autofill:hover,
        textarea:-webkit-autofill:focus,
        select:-webkit-autofill,
        select:-webkit-autofill:hover,
        select:-webkit-autofill:focus {
          -webkit-text-fill-color: #0f172a !important;
          box-shadow: 0 0 0px 1000px #ffffff inset !important;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>

      <div className="max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
          Editar producto
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Configura producto simple, variable o compuesto desde un solo lugar.
        </p>
      </div>

      {message && (
        <div className="max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          {message}
        </div>
      )}

      <div className="max-w-5xl rounded-[28px] border border-slate-200 bg-slate-50/70 p-4 shadow-[0_10px_35px_rgba(15,23,42,0.08)]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <SectionCard
            title="Información general"
            subtitle="Datos principales del producto."
            defaultOpen={true}
          >
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setName(nextName);
                    setSlug(slugify(nextName));
                    setVariants((prev) =>
                      prev.map((variant) => ({
                        ...variant,
                        slug: variant.name.trim()
                          ? makeVariantSlug(nextName, variant.name)
                          : "",
                      }))
                    );
                  }}
                  placeholder="Nombre del producto"
                  className={inputSoftClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  URL automática
                </label>
                <input
                  type="text"
                  value={slug}
                  readOnly
                  placeholder="spotify-premium"
                  className={inputSoftClass}
                />
                <p className="mt-2 text-sm text-slate-500">
                  Se genera automáticamente según el nombre del producto.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Tipo de producto
                </label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as ProductType)}
                  className={inputSoftClass}
                >
                  <option value="simple">Simple</option>
                  <option value="variable">Variable</option>
                  <option value="composite">Compuesto / Combo</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Descripción
                </label>
                <textarea
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción del producto"
                  className={inputSoftClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Precio base
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="50000"
                  className={inputSoftClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Categoría
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ej: Streaming"
                  className={inputSoftClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Imagen
                </label>
                <input
                  type="file"
                  accept={IMAGE_INPUT_ACCEPT}
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className={fileInputClass}
                />

                <div className="mt-4 flex gap-4">
                  {currentImageUrl && !previewUrl && (
                    <img
                      src={currentImageUrl}
                      alt={name}
                      className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
                    />
                  )}

                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Vista previa"
                      className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
                    />
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Entrega y licencias"
            subtitle="Opciones de entrega y carga de licencias generales."
            defaultOpen={true}
          >
            <div className="space-y-4">
              <label className="flex items-center gap-3 text-base font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className={checkboxClass}
                />
                <span>Producto activo</span>
              </label>

              <label className="flex items-center gap-3 text-base font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={avoidRepeatLicense}
                  onChange={(e) => setAvoidRepeatLicense(e.target.checked)}
                  className={checkboxClass}
                />
                <span>Evitar entregar licencias repetidas al mismo cliente</span>
              </label>

              <label className="flex items-center gap-3 text-base font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={usePriorityLicenses}
                  onChange={(e) => setUsePriorityLicenses(e.target.checked)}
                  className={checkboxClass}
                />
                <span>Usar primero licencias prioritarias</span>
              </label>

              <label className="flex items-center gap-3 text-base font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={enableLicenseAlerts}
                  onChange={(e) => setEnableLicenseAlerts(e.target.checked)}
                  className={checkboxClass}
                />
                <span>Activar alertas de vencimiento para este producto</span>
              </label>

              <div className="pt-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Stock general
                </label>
                <input
                  type="number"
                  value={stock}
                  readOnly
                  className={inputSoftClass}
                />
                <p className="mt-2 text-sm text-slate-500">
                  Licencias detectadas: {generalLicenseRows.length}
                </p>
              </div>

              <LicenseRowsEditor
                title="Licencias generales"
                subtitle="Cada licencia queda separada y con su propia facturación. Si dejas la facturación vacía, se guardará como 30 días."
                rows={generalLicenseRows}
                licensesText={newGeneralLicensesInput}
                onLicensesTextChange={setNewGeneralLicensesInput}
                onSyncLicensesFromText={syncGeneralLicensesFromText}
                onRemoveLicense={removeGeneralLicenseRow}
                onBillingDaysChange={updateGeneralLicenseBillingDays}
                inputClassName={inputSoftClass}
                textareaClassName={inputSoftClass}
              />
            </div>
          </SectionCard>

          {productType === "variable" && (
            <SectionCard
              title="Variantes"
              subtitle="Cada variante tiene su propio precio, stock y licencias prioritarias."
              defaultOpen={true}
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  Administra las opciones que el cliente podrá elegir.
                </div>

                <button
                  type="button"
                  onClick={addVariant}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Agregar variante
                </button>
              </div>

              <div className="space-y-4">
                {variants.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    Todavía no has agregado variantes.
                  </div>
                ) : (
                  variants.map((item, index) => (
                    <div
                      key={item.tempId}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="font-bold text-slate-900">
                          Variante #{index + 1}
                        </h3>

                        <button
                          type="button"
                          onClick={() => removeVariant(item.tempId)}
                          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="space-y-4">
                        <input
                          type="text"
                          placeholder="Nombre variante"
                          value={item.name}
                          onChange={(e) =>
                            updateVariant(item.tempId, "name", e.target.value)
                          }
                          className={inputClass}
                        />

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            URL automática de la variante
                          </label>
                          <input
                            type="text"
                            placeholder="spotify-premium-1-mes"
                            value={item.slug}
                            readOnly
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Imagen de la variante
                          </label>
                          <input
                            type="file"
                            accept={IMAGE_INPUT_ACCEPT}
                            onChange={(e) =>
                              updateVariantImageFile(
                                item.tempId,
                                e.target.files?.[0] || null
                              )
                            }
                            className={fileInputClass}
                          />

                          {item.imageFile ? (
                            <p className="mt-2 text-sm text-slate-500">
                              Imagen seleccionada: {item.imageFile.name}
                            </p>
                          ) : item.image_url ? (
                            <div className="mt-3 flex items-center gap-3">
                              <img
                                src={item.image_url}
                                alt={item.name || "Imagen de variante"}
                                className="h-20 w-20 rounded-xl border border-slate-200 object-cover"
                              />
                              <p className="text-sm text-slate-500">
                                Imagen actual de la variante. Puedes reemplazarla subiendo un nuevo archivo.
                              </p>
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-slate-500">
                              Si no subes imagen, la variante usará la imagen principal del producto.
                            </p>
                          )}
                        </div>

                        <textarea
                          rows={3}
                          placeholder="Descripción de la variante"
                          value={item.description}
                          onChange={(e) =>
                            updateVariant(
                              item.tempId,
                              "description",
                              e.target.value
                            )
                          }
                          className={inputClass}
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <input
                            type="number"
                            placeholder="Precio"
                            value={item.price}
                            onChange={(e) =>
                              updateVariant(item.tempId, "price", e.target.value)
                            }
                            className={inputClass}
                          />

                          <div>
                            <input
                              type="number"
                              placeholder="Stock"
                              value={item.stock}
                              onChange={(e) =>
                                updateVariant(item.tempId, "stock", e.target.value)
                              }
                              className={inputClass}
                            />
                            <p className="mt-2 text-sm text-slate-500">
                              Licencias detectadas:{" "}
                              {item.priorityLicenseRows.length}
                            </p>
                          </div>
                        </div>


                        <label className="flex items-center gap-3 text-base font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.is_active}
                            onChange={(e) =>
                              updateVariant(
                                item.tempId,
                                "is_active",
                                e.target.checked
                              )
                            }
                            className={checkboxClass}
                          />
                          <span>Variante activa</span>
                        </label>

                        <LicenseRowsEditor
                          title="Licencias prioritarias de esta variante"
                          subtitle="Cada licencia queda separada y con su propio tiempo de facturación. Vacío = 30 días."
                          rows={item.priorityLicenseRows}
                          licensesText={item.newPriorityLicensesInput}
                          onLicensesTextChange={(value) =>
                            updateVariant(item.tempId, "newPriorityLicensesInput", value)
                          }
                          onSyncLicensesFromText={() => syncVariantLicensesFromText(item.tempId)}
                          onRemoveLicense={(licenseTempId) =>
                            removeVariantLicenseRow(item.tempId, licenseTempId)
                          }
                          onBillingDaysChange={(licenseTempId, value) =>
                            updateVariantLicenseBillingDays(
                              item.tempId,
                              licenseTempId,
                              value
                            )
                          }
                          inputClassName={inputClass}
                          textareaClassName={inputClass}
                        />

                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          )}

          {productType === "composite" && (
            <SectionCard
              title="Componentes del combo"
              subtitle="Elige 2 o más productos para formar el combo."
              defaultOpen={true}
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  Selecciona los productos o variantes que componen este combo.
                </div>

                <button
                  type="button"
                  onClick={addComponent}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Agregar componente
                </button>
              </div>

              <div className="space-y-4">
                {components.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    Todavía no has agregado componentes al combo.
                  </div>
                ) : (
                  components.map((item, index) => (
                    <div
                      key={item.tempId}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="font-bold text-slate-900">
                          Componente #{index + 1}
                        </h3>

                        <button
                          type="button"
                          onClick={() => removeComponent(item.tempId)}
                          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Producto
                          </label>
                          <select
                            value={item.child_product_id}
                            onChange={(e) => {
                              updateComponent(
                                item.tempId,
                                "child_product_id",
                                e.target.value
                              );
                              updateComponent(item.tempId, "child_variant_id", "");
                            }}
                            className={inputClass}
                          >
                            <option value="">Selecciona un producto</option>
                            {allProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {item.child_product_id &&
                          (variantOptionsByProduct[item.child_product_id]
                            ?.length || 0) > 0 && (
                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-700">
                                Variante específica (opcional)
                              </label>
                              <select
                                value={item.child_variant_id}
                                onChange={(e) =>
                                  updateComponent(
                                    item.tempId,
                                    "child_variant_id",
                                    e.target.value
                                  )
                                }
                                className={inputClass}
                              >
                                <option value="">Usar producto general</option>
                                {variantOptionsByProduct[item.child_product_id].map(
                                  (variant) => (
                                    <option key={variant.id} value={variant.id}>
                                      {variant.name}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                          )}

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Cantidad
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateComponent(
                                item.tempId,
                                "quantity",
                                e.target.value
                              )
                            }
                            className={inputClass}
                          />
                        </div>

                        <div className="text-sm text-slate-500">
                          {item.child_product_id ? (
                            <>
                              Producto:{" "}
                              <strong>{productNameMap[item.child_product_id]}</strong>
                              {item.child_variant_id && (
                                <>
                                  {" "}
                                  - Variante:{" "}
                                  <strong>
                                    {variantNameMap[item.child_variant_id]}
                                  </strong>
                                </>
                              )}
                            </>
                          ) : (
                            "Selecciona un producto para este componente."
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}