"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

type ProductType = "simple" | "variable" | "composite";

type VariantRow = {
  id?: string;
  tempId: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  stock: string;
  is_active: boolean;
  sort_order: number;
  priorityLicensesInput: string;
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
};

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

function normalizeLines(text: string) {
  return Array.from(
    new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200";

const inputSoftClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200";

const fileInputClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 outline-none file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white";

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

  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [generalLicensesInput, setGeneralLicensesInput] = useState("");
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
      (data || []).map((item: any, index: number) => ({
        id: item.id,
        tempId: item.id || makeTempId(),
        name: item.name || "",
        slug: item.slug || "",
        description: item.description || "",
        price: String(item.price ?? ""),
        stock: String(item.stock ?? 0),
        is_active: Boolean(item.is_active),
        sort_order: item.sort_order ?? index,
        priorityLicensesInput: "",
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
      (data || []).map((item: any, index: number) => ({
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
      .select("id, product_id, variant_id, license_text, status, is_priority")
      .eq("product_id", id)
      .eq("status", "available");

    if (error) {
      setMessage("No se pudieron cargar las licencias.");
      return;
    }

    const rows = (data as ProductLicenseRow[]) || [];

    const generalLines = rows
      .filter((row) => !row.variant_id && !row.is_priority)
      .map((row) => row.license_text);

    setGeneralLicensesInput(generalLines.join("\n"));

    setVariants((prev) =>
      prev.map((variant) => {
        if (!variant.id) return variant;

        const priorityLines = rows
          .filter(
            (row) => row.variant_id === variant.id && row.is_priority === true
          )
          .map((row) => row.license_text);

        return {
          ...variant,
          priorityLicensesInput: priorityLines.join("\n"),
          stock: String(priorityLines.length),
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
    const detected = String(normalizeLines(generalLicensesInput).length);
    setStock(detected);
  }, [generalLicensesInput]);

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
        is_active: true,
        sort_order: prev.length,
        priorityLicensesInput: "",
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

        if (field === "priorityLicensesInput") {
          updated.stock = String(normalizeLines(String(value)).length);
        }

        return updated;
      })
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

  const syncAvailableLicenses = async ({
    productId,
    variantId,
    lines,
    isPriority,
  }: {
    productId: string;
    variantId: string | null;
    lines: string[];
    isPriority: boolean;
  }) => {
    let query = supabase
      .from("product_licenses")
      .select("id, license_text")
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

    const existingRows = (data as { id: string; license_text: string }[]) || [];
    const incomingSet = new Set(lines.map((line) => line.trim()));
    const existingSet = new Set(
      existingRows.map((row) => row.license_text.trim())
    );

    const toInsert = lines.filter((line) => !existingSet.has(line));
    const toDeleteIds = existingRows
      .filter((row) => !incomingSet.has(row.license_text.trim()))
      .map((row) => row.id);

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("product_licenses")
        .delete()
        .in("id", toDeleteIds);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    if (toInsert.length > 0) {
      const payload = toInsert.map((license) => ({
        product_id: productId,
        variant_id: variantId,
        license_text: license,
        status: "available",
        is_priority: isPriority,
      }));

      const { error: insertError } = await supabase
        .from("product_licenses")
        .insert(payload);

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
    const cleanSlug = slug.trim() || slugify(cleanName);
    const cleanCategory = category.trim();
    const numericPrice = Number(price || 0);
    const generalLines = normalizeLines(generalLicensesInput);
    const autoGeneralStock = generalLines.length;

    if (!cleanName) {
      setMessage("Completa el nombre del producto.");
      setSaving(false);
      return;
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
      if (variants.length === 0) {
        setMessage("Agrega al menos una variante.");
        setSaving(false);
        return;
      }

      for (const item of variants) {
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
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, imageFile);

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
        const priorityLines = normalizeLines(item.priorityLicensesInput);

        const payload = {
          product_id: id,
          name: item.name.trim(),
          slug: item.slug.trim() || slugify(item.name),
          description: item.description.trim() || null,
          price: Number(item.price || 0),
          stock: priorityLines.length,
          is_active: item.is_active,
          sort_order: index,
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
        lines: generalLines,
        isPriority: false,
      });

      for (const item of variants) {
        const variantId = variantIdMapByTempId[item.tempId];
        const priorityLines = normalizeLines(item.priorityLicensesInput);

        if (!variantId) continue;

        await syncAvailableLicenses({
          productId: id,
          variantId,
          lines: priorityLines,
          isPriority: true,
        });
      }

      setDeletedVariantIds([]);
      setMessage("Producto actualizado correctamente.");
      await loadAll();
      await fetchLicenses();
    } catch (err: any) {
      setMessage(err?.message || "Ocurrió un error guardando el producto.");
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
                    setName(e.target.value);
                    if (!slug.trim()) setSlug(slugify(e.target.value));
                  }}
                  placeholder="Nombre del producto"
                  className={inputSoftClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="spotify-premium"
                  className={inputSoftClass}
                />
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
                  accept="image/*"
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
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Producto activo
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={avoidRepeatLicense}
                  onChange={(e) => setAvoidRepeatLicense(e.target.checked)}
                />
                Evitar entregar licencias repetidas al mismo cliente
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={usePriorityLicenses}
                  onChange={(e) => setUsePriorityLicenses(e.target.checked)}
                />
                Usar primero licencias prioritarias
              </label>

              <div className="pt-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Stock general
                </label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className={inputSoftClass}
                />
                <p className="mt-2 text-sm text-slate-500">
                  Licencias detectadas:{" "}
                  {normalizeLines(generalLicensesInput).length}
                </p>
              </div>

              <div className="pt-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Licencias generales (una por línea)
                </label>
                <textarea
                  rows={8}
                  value={generalLicensesInput}
                  onChange={(e) => setGeneralLicensesInput(e.target.value)}
                  placeholder={`correo@gmail.com clave123 perfil1\ncorreo2@gmail.com clave456 perfil2`}
                  className={inputSoftClass}
                />
              </div>
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

                        <input
                          type="text"
                          placeholder="Slug variante"
                          value={item.slug}
                          onChange={(e) =>
                            updateVariant(
                              item.tempId,
                              "slug",
                              slugify(e.target.value)
                            )
                          }
                          className={inputClass}
                        />

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
                              {normalizeLines(item.priorityLicensesInput).length}
                            </p>
                          </div>
                        </div>

                        <label className="flex items-center gap-3 text-sm text-slate-700">
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
                          />
                          Variante activa
                        </label>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Licencias prioritarias de esta variante (una por
                            línea)
                          </label>

                          <textarea
                            rows={5}
                            value={item.priorityLicensesInput}
                            onChange={(e) =>
                              updateVariant(
                                item.tempId,
                                "priorityLicensesInput",
                                e.target.value
                              )
                            }
                            placeholder={`correo1@gmail.com clave123 perfil1\ncorreo2@gmail.com clave456 perfil2`}
                            className={inputClass}
                          />
                        </div>
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