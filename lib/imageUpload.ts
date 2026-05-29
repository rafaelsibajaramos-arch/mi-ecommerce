const WEBP_MIME_TYPE = "image/webp";

export const IMAGE_INPUT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
].join(",");

type ConvertToWebpOptions = {
  quality?: number;
};

function getBaseName(fileName: string) {
  const cleanName = fileName.trim() || "image";
  return cleanName.replace(/\.[^.]+$/, "");
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(
              "No se pudo convertir la imagen a WebP. Prueba con una imagen JPG, PNG o WebP."
            )
          );
          return;
        }

        resolve(blob);
      },
      WEBP_MIME_TYPE,
      quality
    );
  });
}

async function loadImageWithBitmap(file: File) {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    return await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
  } catch {
    return null;
  }
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "No se pudo leer la imagen. Usa una imagen válida en formato JPG, PNG, WebP, GIF o AVIF."
        )
      );
    };

    image.src = objectUrl;
  });
}

export async function convertImageFileToWebp(
  file: File,
  options: ConvertToWebpOptions = {}
) {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo seleccionado no es una imagen válida.");
  }

  const quality = options.quality ?? 0.86;
  const bitmap = await loadImageWithBitmap(file);
  const canvas = bitmap
    ? createCanvas(bitmap.width, bitmap.height)
    : createCanvas(1, 1);
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap?.close();
    throw new Error("No se pudo preparar la imagen para conversión WebP.");
  }

  if (bitmap) {
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    const image = await loadImageElement(file);
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    context.drawImage(image, 0, 0);
  }

  const webpBlob = await canvasToWebpBlob(canvas, quality);
  const webpName = `${getBaseName(file.name)}.webp`;

  return new File([webpBlob], webpName, {
    type: WEBP_MIME_TYPE,
    lastModified: Date.now(),
  });
}

export function createImageStoragePath(folder: "products" | "variants") {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
  return `${folder}/${fileName}`;
}

export function getImageUploadErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "No se pudo procesar la imagen.";
}
