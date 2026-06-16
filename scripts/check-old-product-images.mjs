import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = "product-images";
const FOLDERS = ["products", "variants"];
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

function extractBucketPathFromPublicUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const idx = parsed.pathname.indexOf(PUBLIC_PREFIX);

    if (idx === -1) return null;

    return parsed.pathname.slice(idx + PUBLIC_PREFIX.length);
  } catch {
    return null;
  }
}

async function listAllFiles(bucket, folders) {
  const allFiles = [];

  for (const folder of folders) {
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Error listando archivos en ${folder}: ${error.message}`);
      }

      const files = (data || []).filter((item) => item.name);

      allFiles.push(
        ...files.map((file) => ({
          ...file,
          fullPath: `${folder}/${file.name}`,
        }))
      );

      if (files.length < limit) break;
      offset += limit;
    }
  }

  return allFiles;
}

async function addUsedImagePathsFromTable({ table, select, usedPaths }) {
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, to);

    if (error) {
      throw new Error(`Error leyendo ${table}: ${error.message}`);
    }

    const rows = data || [];

    for (const row of rows) {
      const path = extractBucketPathFromPublicUrl(row.image_url);
      if (path) {
        usedPaths.add(path);
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }
}

async function getUsedImagePaths() {
  const usedPaths = new Set();

  await addUsedImagePathsFromTable({
    table: "products",
    select: "id, name, image_url",
    usedPaths,
  });

  await addUsedImagePathsFromTable({
    table: "product_variants",
    select: "id, name, image_url",
    usedPaths,
  });

  return usedPaths;
}

async function main() {
  console.log("Revisando imágenes usadas en products y product_variants...");
  const usedPaths = await getUsedImagePaths();

  console.log("Listando archivos del bucket...");
  const storageFiles = await listAllFiles(BUCKET, FOLDERS);

  const allStoragePaths = storageFiles.map((file) => file.fullPath);

  const unusedPaths = allStoragePaths.filter((path) => !usedPaths.has(path));
  const usedButMissing = [...usedPaths].filter(
    (path) => !allStoragePaths.includes(path)
  );
  const nonWebpUsedPaths = [...usedPaths].filter(
    (path) => !path.toLowerCase().endsWith(".webp")
  );

  console.log("");
  console.log("===== RESUMEN =====");
  console.log(`Imágenes referenciadas en DB: ${usedPaths.size}`);
  console.log(`Archivos encontrados en Storage: ${allStoragePaths.length}`);
  console.log(`Candidatas a borrar: ${unusedPaths.length}`);
  console.log(`Referencias rotas en DB: ${usedButMissing.length}`);
  console.log(`Referencias usadas no WebP: ${nonWebpUsedPaths.length}`);
  console.log("");

  if (unusedPaths.length > 0) {
    console.log("===== CANDIDATAS A BORRAR =====");
    unusedPaths.forEach((path) => console.log(path));
    console.log("");
  } else {
    console.log("No hay imágenes viejas para borrar.");
    console.log("");
  }

  if (usedButMissing.length > 0) {
    console.log("===== REFERENCIAS ROTAS EN DB =====");
    usedButMissing.forEach((path) => console.log(path));
    console.log("");
  }

  if (nonWebpUsedPaths.length > 0) {
    console.log("===== REFERENCIAS USADAS QUE TODAVÍA NO SON WEBP =====");
    nonWebpUsedPaths.forEach((path) => console.log(path));
    console.log("");
  }

  console.log("Modo prueba: no se borró ningún archivo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
