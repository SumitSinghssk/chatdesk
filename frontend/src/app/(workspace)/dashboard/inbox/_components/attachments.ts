/**
 * Gets picked files ready for WhatsApp before upload: photos WhatsApp won't take as images (WebP, HEIC,
 * GIF, BMP...) become JPEGs, and photos over its 5 MB image limit are scaled down until they fit.
 * Anything the browser can't decode is left as it is (the server sends it as a document).
 */

const IMAGE_LIMIT = 5 * 1024 * 1024;
const SENDABLE = new Set(["image/jpeg", "image/png"]);
const MAX_SIDE = 4096;

function blob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function jpegName(name: string) {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name || "photo"}.jpg`;
}

async function toJpeg(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // e.g. HEIC on browsers that can't read it
  }
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  // a few passes: lower quality first, then smaller, until it fits in WhatsApp's limit
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff"; // transparent PNG/WebP areas would turn black in a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await blob(canvas, attempt === 0 ? 0.9 : 0.82);
    if (out && out.size <= IMAGE_LIMIT) {
      bitmap.close();
      return new File([out], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
    }
    scale *= 0.75;
  }
  bitmap.close();
  return file;
}

/** True when the file is a picture that needs converting or shrinking first. */
export function needsPrep(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return false;
  return !SENDABLE.has(file.type) || file.size > IMAGE_LIMIT;
}

export async function prepareFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => (needsPrep(f) ? toJpeg(f) : Promise.resolve(f))));
}
