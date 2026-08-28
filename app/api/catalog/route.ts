import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  created_at?: string;
  sort_order?: number | null;
  product_type?: ProductType;
  fallback_to_general_licenses?: boolean;
  combo_stock?: number | null;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  stock: number;
  image_url?: string | null;
  is_active: boolean;
  sort_order: number;
};

type ProductComponent = {
  id: string;
  product_id: string;
  child_product_id: string;
  child_variant_id: string | null;
  quantity: number;
  sort_order?: number | null;
};

type CatalogItem = {
  product: Product;
  variant: ProductVariant | null;
  catalogId: string;
  displayName: string;
  displayDescription: string | null;
  displayPrice: number;
  displayStock: number;
  displayImageUrl: string | null;
};

type CategoryItem = { name: string; count: number };

type CatalogSnapshot = {
  items: CatalogItem[];
  categories: CategoryItem[];
  comboChildProductIds: string[];
  comboChildVariantIds: string[];
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function getSupabase() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function getVariantStock(product: Product, variant: ProductVariant) {
  return (
    Number(variant.stock || 0) +
    (product.fallback_to_general_licenses === false ? 0 : Number(product.stock || 0))
  );
}

const loadCatalogSnapshot = unstable_cache(
  async (): Promise<CatalogSnapshot> => {
    const supabase = getSupabase();

    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select(
        "id, name, description, price, stock, image_url, category, is_active, created_at, sort_order, product_type, fallback_to_general_licenses, combo_stock"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (productsError) throw new Error(productsError.message);

    const products = (productsData || []) as Product[];
    const comboChildProductIds = new Set<string>();
    const comboChildVariantIds = new Set<string>();
    const variableIds = products
      .filter((product) => product.product_type === "variable")
      .map((product) => product.id);
    const compositeIds = products
      .filter((product) => product.product_type === "composite")
      .map((product) => product.id);

    const [variantsResult, componentsResult] = await Promise.all([
      variableIds.length
        ? supabase
            .from("product_variants")
            .select("id, product_id, name, slug, description, price, stock, image_url, is_active, sort_order")
            .in("product_id", variableIds)
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      compositeIds.length
        ? supabase
            .from("product_components")
            .select("id, product_id, child_product_id, child_variant_id, quantity, sort_order")
            .in("product_id", compositeIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (variantsResult.error) throw new Error(variantsResult.error.message);
    if (componentsResult.error) throw new Error(componentsResult.error.message);

    const variants = (variantsResult.data || []) as ProductVariant[];
    const components = (componentsResult.data || []) as ProductComponent[];
    const groupedVariants = new Map<string, ProductVariant[]>();

    variants.forEach((variant) => {
      const rows = groupedVariants.get(variant.product_id) || [];
      rows.push(variant);
      groupedVariants.set(variant.product_id, rows);
    });

    const comboStock = new Map<string, number>();

    if (components.length > 0) {
      const childProductIds = Array.from(new Set(components.map((row) => row.child_product_id)));
      const childVariantIds = Array.from(
        new Set(components.map((row) => row.child_variant_id).filter(Boolean) as string[])
      );
      childProductIds.forEach((id) => comboChildProductIds.add(id));
      childVariantIds.forEach((id) => comboChildVariantIds.add(id));

      const [childProductsResult, childVariantsResult] = await Promise.all([
        childProductIds.length
          ? supabase
              .from("products")
              .select("id, stock, is_active, product_type, fallback_to_general_licenses")
              .in("id", childProductIds)
          : Promise.resolve({ data: [], error: null }),
        childVariantIds.length
          ? supabase
              .from("product_variants")
              .select("id, product_id, stock, is_active")
              .in("id", childVariantIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (childProductsResult.error) throw new Error(childProductsResult.error.message);
      if (childVariantsResult.error) throw new Error(childVariantsResult.error.message);

      const childProductMap = new Map(
        ((childProductsResult.data || []) as Array<{
          id: string;
          stock: number | null;
          is_active: boolean | null;
          product_type?: ProductType;
          fallback_to_general_licenses?: boolean | null;
        }>).map((row) => [row.id, row])
      );
      const childVariantMap = new Map(
        ((childVariantsResult.data || []) as Array<{
          id: string;
          product_id: string;
          stock: number | null;
          is_active: boolean | null;
        }>).map((row) => [row.id, row])
      );
      const byCombo = new Map<string, ProductComponent[]>();

      components.forEach((component) => {
        const rows = byCombo.get(component.product_id) || [];
        rows.push(component);
        byCombo.set(component.product_id, rows);
      });

      products
        .filter((product) => product.product_type === "composite")
        .forEach((combo) => {
          const comboComponents = byCombo.get(combo.id) || [];
          if (comboComponents.length < 2) {
            comboStock.set(combo.id, 0);
            return;
          }

          const requirements = new Map<string, ProductComponent>();
          comboComponents.forEach((component) => {
            const key = `${component.child_product_id}__${component.child_variant_id || "base"}`;
            if (!requirements.has(key)) requirements.set(key, { ...component, quantity: 1 });
          });

          let capacity = Number.MAX_SAFE_INTEGER;

          requirements.forEach((requirement) => {
            const child = childProductMap.get(requirement.child_product_id);
            if (!child || child.is_active !== true || child.product_type === "composite") {
              capacity = 0;
              return;
            }

            let units = Number(child.stock || 0);
            if (requirement.child_variant_id) {
              const variant = childVariantMap.get(requirement.child_variant_id);
              if (!variant || variant.is_active !== true || variant.product_id !== child.id) {
                capacity = 0;
                return;
              }
              units =
                Number(variant.stock || 0) +
                (child.fallback_to_general_licenses === false ? 0 : Number(child.stock || 0));
            }
            capacity = Math.min(capacity, Math.max(0, Math.floor(units)));
          });

          const manual =
            combo.combo_stock === null || combo.combo_stock === undefined
              ? Number.MAX_SAFE_INTEGER
              : Math.max(0, Number(combo.combo_stock));
          comboStock.set(combo.id, Math.max(0, Math.min(capacity, manual)));
        });
    }

    const items: CatalogItem[] = [];

    products.forEach((product) => {
      if (product.product_type === "variable") {
        const productVariants = groupedVariants.get(product.id) || [];
        if (productVariants.length > 0) {
          productVariants.forEach((variant) => {
            items.push({
              product,
              variant,
              catalogId: `${product.id}-${variant.id}`,
              displayName: `${product.name} - ${variant.name}`,
              displayDescription: variant.description || product.description,
              displayPrice: Number(variant.price || 0),
              displayStock: getVariantStock(product, variant),
              displayImageUrl: variant.image_url || product.image_url,
            });
          });
          return;
        }
      }

      items.push({
        product,
        variant: null,
        catalogId: product.id,
        displayName: product.name,
        displayDescription: product.description,
        displayPrice: Number(product.price || 0),
        displayStock:
          product.product_type === "composite"
            ? Number(comboStock.get(product.id) || 0)
            : Number(product.stock || 0),
        displayImageUrl: product.image_url,
      });
    });

    const counts = new Map<string, number>();
    items.forEach((item) => {
      const category = (item.product.category || "").trim();
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    });

    const categories: CategoryItem[] = [
      { name: "Todas", count: items.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, "es", { sensitivity: "base" }))
        .map(([name, count]) => ({ name, count })),
    ];

    return {
      items,
      categories,
      comboChildProductIds: Array.from(comboChildProductIds),
      comboChildVariantIds: Array.from(comboChildVariantIds),
    };
  },
  ["public-catalog-v2"],
  { revalidate: 60, tags: ["public-catalog"] }
);

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(1, Math.min(100, Number(params.get("pageSize") || 12)));
    const category = (params.get("category") || "Todas").trim();
    const search = (params.get("search") || "").trim().toLowerCase();

    const snapshot = await loadCatalogSnapshot();
    const filtered = snapshot.items.filter((item) => {
      if (category !== "Todas" && (item.product.category || "") !== category) return false;
      if (!search) return true;
      return [item.displayName, item.displayDescription, item.product.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });

    const from = (page - 1) * pageSize;
    const items = filtered.slice(from, from + pageSize);

    return NextResponse.json(
      {
        ok: true,
        items,
        categories: snapshot.categories,
        comboChildProductIds: snapshot.comboChildProductIds,
        comboChildVariantIds: snapshot.comboChildVariantIds,
        total: filtered.length,
        page,
        pageSize,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudo cargar el catálogo." },
      { status: 500 }
    );
  }
}
