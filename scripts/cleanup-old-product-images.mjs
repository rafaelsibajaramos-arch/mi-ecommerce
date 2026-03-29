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
const FOLDER = "products";
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;
const DELETE_BATCH_SIZE = 1000;

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

async function listAllFiles(bucket, folder) {
  const allFiles = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Error listando archivos: ${error.message}`);
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

  return allFiles;
}

async function getUsedImagePaths() {
  const usedPaths = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("products")
      .select("id, name, image_url")
      .range(from, to);

    if (error) {
      throw new Error(`Error leyendo products: ${error.message}`);
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

  return usedPaths;
}

async function deleteInBatches(bucket, paths) {
  for (let i = 0; i < paths.length; i += DELETE_BATCH_SIZE) {
    const batch = paths.slice(i, i + DELETE_BATCH_SIZE);

    const { data, error } = await supabase.storage.from(bucket).remove(batch);

    if (error) {
      throw new Error(`Error borrando archivos: ${error.message}`);
    }

    console.log(`Lote borrado: ${batch.length} archivo(s)`);
    console.log(data);
  }
}

async function main() {
  console.log("Revisando imágenes usadas en la tabla products...");
  const usedPaths = await getUsedImagePaths();

  console.log("Listando archivos del bucket...");
  const storageFiles = await listAllFiles(BUCKET, FOLDER);

  const allStoragePaths = storageFiles.map((file) => file.fullPath);
  const unusedPaths = allStoragePaths.filter((path) => !usedPaths.has(path));
  const usedButMissing = [...usedPaths].filter(
    (path) => !allStoragePaths.includes(path)
  );

  console.log("");
  console.log("===== RESUMEN =====");
  console.log(`Imágenes referenciadas en DB: ${usedPaths.size}`);
  console.log(`Archivos encontrados en Storage: ${allStoragePaths.length}`);
  console.log(`Candidatas a borrar: ${unusedPaths.length}`);
  console.log(`Referencias rotas en DB: ${usedButMissing.length}`);
  console.log("");

  if (usedButMissing.length > 0) {
    console.log("Se canceló el borrado porque hay referencias rotas en DB.");
    console.log("Corrige eso primero.");
    process.exit(1);
  }

  if (unusedPaths.length === 0) {
    console.log("No hay imágenes viejas para borrar.");
    return;
  }

  console.log("===== ARCHIVOS A BORRAR =====");
  unusedPaths.forEach((path) => console.log(path));
  console.log("");

  await deleteInBatches(BUCKET, unusedPaths);

  console.log("");
  console.log("Limpieza terminada.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});