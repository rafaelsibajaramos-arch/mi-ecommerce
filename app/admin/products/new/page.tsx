"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

export default function NewProductPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [category, setCategory] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const previewUrl = useMemo(() => {
    if (!imageFile) return "";
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const cleanName = name.trim();
    const numericPrice = Number(price);
    const numericStock = Number(stock);

    if (!cleanName || price === "" || stock === "") {
      setMessage("Completa nombre, precio y stock.");
      return;
    }

    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      setMessage("El precio no es válido.");
      return;
    }

    if (Number.isNaN(numericStock) || numericStock < 0) {
      setMessage("El stock no es válido.");
      return;
    }

    setSaving(true);

    try {
      let uploadedImageUrl: string | null = null;

      if (imageFile) {
        const fileExt =
          imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, imageFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          setMessage("Error subiendo imagen: " + uploadError.message);
          setSaving(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        uploadedImageUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from("products").insert([
        {
          name: cleanName,
          description: description.trim() || null,
          price: numericPrice,
          stock: numericStock,
          image_url: uploadedImageUrl,
          category: category.trim() || null,
          is_active: isActive,
        },
      ]);

      if (error) {
        setMessage("Error creando producto: " + error.message);
        setSaving(false);
        return;
      }

      router.push("/admin/products");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
          Admin
        </p>

        <h1 className="mt-2 text-4xl font-extrabold text-gray-900">
          Nuevo producto
        </h1>

        <p className="mt-3 text-gray-600">
          Crea un nuevo producto para tu tienda.
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
          {message}
        </div>
      )}

      <div className="max-w-2xl rounded-3xl border bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del producto"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del producto"
              rows={4}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Precio
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="50000"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Stock manual inicial
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Imagen del producto
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            />

            {previewUrl && (
              <div className="mt-4">
                <img
                  src={previewUrl}
                  alt="Vista previa"
                  className="h-32 w-32 rounded-2xl border object-cover"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Categoría
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Streaming, Cuentas, Suscripciones..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="is_active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="is_active"
              className="text-sm font-medium text-gray-700"
            >
              Producto activo
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-[#050816] px-5 py-3 font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Guardando..." : "Crear producto"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/products")}
              className="rounded-2xl border px-5 py-3 font-semibold text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}