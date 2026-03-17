"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type ProductType = "simple" | "variable" | "composite";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  product_type: ProductType;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  sort_order: number;
};

type ProductComponent = {
  id: string;
  product_id: string;
  child_product_id: string;
  child_variant_id: string | null;
  quantity: number;
  sort_order: number;
};

type ProductMini = {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
};

type VariantMini = {
  id: string;
  name: string;
  price: number;
};

type Profile = {
  id: string;
  balance: number;
};

type ResolvedComponent = {
  id: string;
  quantity: number;
  product_name: string;
  variant_name: string | null;
  image_url: string | null;
  unit_price: number;
};

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [components, setComponents] = useState<ResolvedComponent[]>([]);

  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (id) {
      fetchAll();
    }
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (productError || !productData) {
      setMessage("Producto no encontrado.");
      setLoading(false);
      return;
    }

    const currentProduct = productData as Product;
    setProduct(currentProduct);

    if (currentProduct.product_type === "variable") {
      const { data: variantsData } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", currentProduct.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      const safeVariants = (variantsData as ProductVariant[]) || [];
      setVariants(safeVariants);

      if (safeVariants.length > 0) {
        setSelectedVariantId(safeVariants[0].id);
      }
    } else {
      setVariants([]);
      setSelectedVariantId("");
    }

    if (currentProduct.product_type === "composite") {
      const { data: componentRows } = await supabase
        .from("product_components")
        .select("*")
        .eq("product_id", currentProduct.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      const rawComponents = (componentRows as ProductComponent[]) || [];

      const productIds = Array.from(
        new Set(rawComponents.map((item) => item.child_product_id))
      );

      const variantIds = Array.from(
        new Set(
          rawComponents
            .map((item) => item.child_variant_id)
            .filter(Boolean) as string[]
        )
      );

      const [{ data: childProducts }, { data: childVariants }] = await Promise.all([
        productIds.length
          ? supabase
              .from("products")
              .select("id, name, image_url, price")
              .in("id", productIds)
          : Promise.resolve({ data: [] as ProductMini[] }),
        variantIds.length
          ? supabase
              .from("product_variants")
              .select("id, name, price")
              .in("id", variantIds)
          : Promise.resolve({ data: [] as VariantMini[] }),
      ]);

      const productMap = Object.fromEntries(
        ((childProducts as ProductMini[]) || []).map((p) => [p.id, p])
      );

      const variantMap = Object.fromEntries(
        ((childVariants as VariantMini[]) || []).map((v) => [v.id, v])
      );

      const resolved: ResolvedComponent[] = rawComponents.map((item) => {
        const childProduct = productMap[item.child_product_id];
        const childVariant = item.child_variant_id
          ? variantMap[item.child_variant_id]
          : null;

        return {
          id: item.id,
          quantity: item.quantity,
          product_name: childProduct?.name || "Producto",
          variant_name: childVariant?.name || null,
          image_url: childProduct?.image_url || null,
          unit_price: Number(childVariant?.price ?? childProduct?.price ?? 0),
        };
      });

      setComponents(resolved);
    } else {
      setComponents([]);
    }

    setLoading(false);
  };

  const selectedVariant = useMemo(() => {
    if (!selectedVariantId) return null;
    return variants.find((item) => item.id === selectedVariantId) || null;
  }, [selectedVariantId, variants]);

  const visiblePrice = useMemo(() => {
    if (!product) return 0;
    if (product.product_type === "variable" && selectedVariant) {
      return Number(selectedVariant.price);
    }
    return Number(product.price);
  }, [product, selectedVariant]);

  const visibleStock = useMemo(() => {
    if (!product) return 0;
    if (product.product_type === "variable" && selectedVariant) {
      return Number(selectedVariant.stock);
    }
    return Number(product.stock);
  }, [product, selectedVariant]);

  const visibleDescription = useMemo(() => {
    if (!product) return "";
    if (
      product.product_type === "variable" &&
      selectedVariant?.description &&
      selectedVariant.description.trim() !== ""
    ) {
      return selectedVariant.description;
    }
    return product.description || "Este producto no tiene descripción.";
  }, [product, selectedVariant]);

  const handleBuyNow = async () => {
    if (!product) return;

    setBuying(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("Debes iniciar sesión para comprar.");
        setBuying(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, balance")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage("No se encontró el perfil del usuario.");
        setBuying(false);
        return;
      }

      const profile = profileData as Profile;

      const { data: freshProduct, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", product.id)
        .eq("is_active", true)
        .single();

      if (productError || !freshProduct) {
        setMessage("No se pudo validar el producto.");
        setBuying(false);
        return;
      }

      const currentProduct = freshProduct as Product;

      let currentPrice = Number(currentProduct.price);
      let currentStock = Number(currentProduct.stock);
      let currentVariant: ProductVariant | null = null;

      if (currentProduct.product_type === "variable") {
        if (!selectedVariantId) {
          setMessage("Selecciona una variante.");
          setBuying(false);
          return;
        }

        const { data: freshVariant, error: variantError } = await supabase
          .from("product_variants")
          .select("*")
          .eq("id", selectedVariantId)
          .eq("product_id", currentProduct.id)
          .eq("is_active", true)
          .single();

        if (variantError || !freshVariant) {
          setMessage("No se pudo validar la variante seleccionada.");
          setBuying(false);
          return;
        }

        currentVariant = freshVariant as ProductVariant;
        currentPrice = Number(currentVariant.price);
        currentStock = Number(currentVariant.stock);
      }

      if (currentStock <= 0) {
        setMessage("Este producto ya no tiene stock disponible.");
        setBuying(false);
        await fetchAll();
        return;
      }

      if (Number(profile.balance) < currentPrice) {
        setMessage(
          `Saldo insuficiente. Tu saldo actual es $${Number(
            profile.balance
          ).toLocaleString()} y el producto cuesta $${currentPrice.toLocaleString()}.`
        );
        setBuying(false);
        return;
      }

      const newBalance = Number(profile.balance) - currentPrice;

      const { error: balanceUpdateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user.id);

      if (balanceUpdateError) {
        setMessage("No se pudo descontar el saldo.");
        setBuying(false);
        return;
      }

      if (currentProduct.product_type === "variable" && currentVariant) {
        const newVariantStock = Number(currentVariant.stock) - 1;

        const { error: variantStockError } = await supabase
          .from("product_variants")
          .update({ stock: newVariantStock })
          .eq("id", currentVariant.id);

        if (variantStockError) {
          await supabase
            .from("profiles")
            .update({ balance: profile.balance })
            .eq("id", user.id);

          setMessage("No se pudo descontar el stock de la variante.");
          setBuying(false);
          return;
        }
      } else {
        const newStock = Number(currentProduct.stock) - 1;

        const { error: stockUpdateError } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", currentProduct.id);

        if (stockUpdateError) {
          await supabase
            .from("profiles")
            .update({ balance: profile.balance })
            .eq("id", user.id);

          setMessage("No se pudo descontar el stock del producto.");
          setBuying(false);
          return;
        }
      }

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            total: currentPrice,
            status: "paid",
          },
        ])
        .select()
        .single();

      if (orderError || !orderData) {
        await supabase
          .from("profiles")
          .update({ balance: profile.balance })
          .eq("id", user.id);

        setMessage("No se pudo crear el pedido.");
        setBuying(false);
        return;
      }

      const { error: orderItemError } = await supabase
        .from("order_items")
        .insert([
          {
            order_id: orderData.id,
            product_id: currentProduct.id,
            variant_id: currentVariant?.id || null,
            quantity: 1,
            unit_price: currentPrice,
            item_type:
              currentProduct.product_type === "variable" ? "variant" : "simple",
            product_name: currentProduct.name,
            variant_name: currentVariant?.name || null,
          },
        ]);

      if (orderItemError) {
        await supabase.from("orders").delete().eq("id", orderData.id);

        await supabase
          .from("profiles")
          .update({ balance: profile.balance })
          .eq("id", user.id);

        setMessage("No se pudo guardar el detalle del pedido.");
        setBuying(false);
        return;
      }

      setSuccessMessage(
        `Compra realizada con éxito. Se descontaron $${currentPrice.toLocaleString()} de tu saldo.`
      );

      await fetchAll();
    } catch {
      setMessage("Ocurrió un error inesperado al procesar la compra.");
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-transparent text-white">
        <div className="mx-auto max-w-5xl px-5 py-10 text-sm text-white/60 md:px-6 md:text-base">
          Cargando producto...
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-transparent text-white">
        <div className="mx-auto max-w-5xl space-y-4 px-5 py-10 md:px-6">
          <div className="text-white/70">{message}</div>
          <Link
            href="/#catalogo"
            className="inline-block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-white transition hover:bg-white/[0.06]"
          >
            Volver al catálogo
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-white">
      <section>
        <div className="mx-auto max-w-5xl px-5 py-8 md:px-6 md:py-10">
          <div className="mb-5 md:mb-6">
            <Link
              href="/#catalogo"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              Volver al catálogo
            </Link>
          </div>

          <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-8">
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-md">
              <div className="aspect-square bg-white/[0.02]">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-white/35 md:text-base">
                    Sin imagen
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45 md:text-sm md:tracking-[0.18em]">
                  {product.category || "Sin categoría"}
                </p>

                <h1 className="mt-2 text-[2.1rem] font-extrabold leading-[0.95] text-white sm:text-[2.5rem] md:text-[3.1rem]">
                  {product.name}
                </h1>
              </div>

              <div className="text-2xl font-extrabold text-white sm:text-3xl md:text-[2.8rem]">
                ${visiblePrice.toLocaleString()}
              </div>

              <div>
                {visibleStock > 0 ? (
                  <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-300 sm:text-sm">
                    Disponible - Stock: {visibleStock}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-300 sm:text-sm">
                    Agotado
                  </span>
                )}
              </div>

              {product.product_type === "variable" && variants.length > 0 && (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h2 className="mb-3 text-base font-bold text-white md:text-lg">
                    Variantes
                  </h2>

                  <div className="flex flex-wrap gap-2.5">
                    {variants.map((variant) => {
                      const isSelected = selectedVariantId === variant.id;

                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedVariantId(variant.id)}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                            isSelected
                              ? "border-white bg-white text-black"
                              : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]"
                          }`}
                        >
                          {variant.name}
                        </button>
                      );
                    })}
                  </div>

                  {selectedVariant && (
                    <p className="mt-4 text-sm text-white/65">
                      Selección actual: <strong>{selectedVariant.name}</strong>
                    </p>
                  )}
                </div>
              )}

              {product.product_type === "composite" && components.length > 0 && (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                  <h2 className="mb-3 text-base font-bold text-white md:text-lg">
                    Incluye este combo
                  </h2>

                  <div className="space-y-3">
                    {components.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                      >
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.product_name}
                            className="h-12 w-12 rounded-xl object-cover sm:h-14 sm:w-14"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-[10px] text-white/40 sm:h-14 sm:w-14 sm:text-xs">
                            Sin imagen
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">
                            {item.quantity} x {item.product_name}
                          </p>
                          {item.variant_name && (
                            <p className="text-sm text-white/60">
                              Variante: {item.variant_name}
                            </p>
                          )}
                        </div>

                        <div className="text-xs font-semibold text-white/75 sm:text-sm">
                          ${Number(item.unit_price).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {message && (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
                  {message}
                </div>
              )}

              {successMessage && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                  {successMessage}
                </div>
              )}

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
                <h2 className="mb-2 text-base font-bold text-white md:text-lg">
                  Descripción
                </h2>

                <p className="text-sm leading-7 text-white/65 md:text-base">
                  {visibleDescription}
                </p>
              </div>

              <button
                onClick={handleBuyNow}
                disabled={visibleStock <= 0 || buying}
                className="w-full rounded-2xl bg-white py-3.5 text-sm font-semibold text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 md:py-4 md:text-base"
              >
                {buying
                  ? "Procesando compra..."
                  : visibleStock > 0
                  ? "Comprar ahora"
                  : "Producto agotado"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}