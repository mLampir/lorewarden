/** Longest side of a stored map. Large enough to read grid lines on a big screen. */
export const MAX_IMAGE_SIDE = 2560;

/** Files up to this size are stored as they are if they are not larger than MAX_IMAGE_SIDE. */
const KEEP_ORIGINAL_BYTES = 1_500_000;

/** Scales width and height down to fit within max, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Reads an image file as a data URL. Large images are scaled down and re-encoded so that
 * adventures stay small enough to store in the browser and to export.
 */
export async function readImage(file: File): Promise<{ src: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_SIDE);
  if (size.width === bitmap.width && file.size <= KEEP_ORIGINAL_BYTES) {
    bitmap.close();
    return { src: await readAsDataUrl(file), mimeType: file.type };
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  // Browsers without WebP encoding return a PNG, so fall back to JPEG.
  let src = canvas.toDataURL('image/webp', 0.85);
  if (!src.startsWith('data:image/webp')) src = canvas.toDataURL('image/jpeg', 0.85);
  return { src, mimeType: src.slice(5, src.indexOf(';')) };
}

/** Turns "Old Mill (floor 1).png" into "Old Mill (floor 1)". */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || name;
}
