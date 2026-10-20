import { z } from "zod";

export const REQUEST_IMAGES_BUCKET = "RequestImages";
export const MAX_REQUEST_IMAGE_BYTES = 4 * 1024 * 1024;
export const requestImageKinds = ["inspo", "selfie"] as const;
export const requestImageKindSchema = z.enum(requestImageKinds);
export const requestImageContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const requestImageUploadSchema = z.object({
  kind: requestImageKindSchema,
  contentType: requestImageContentTypeSchema,
});
export const requestImageUploadsSchema = z
  .array(requestImageUploadSchema)
  .max(2)
  .refine((images) => new Set(images.map((image) => image.kind)).size === images.length);

export type RequestImageKind = (typeof requestImageKinds)[number];
export type RequestImageUpload = z.infer<typeof requestImageUploadSchema>;
export type RequestImageFiles = Partial<Record<RequestImageKind, File>>;
export type RequestImageRecord = { kind: RequestImageKind; path: string };

export const requestImageLabels: Record<RequestImageKind, string> = {
  inspo: "Inspo photo",
  selfie: "Selfie",
};

export function requestImageError(file: Pick<File, "size" | "type">): string | undefined {
  if (!requestImageContentTypeSchema.safeParse(file.type).success)
    return "Choose a JPG, PNG, or WebP image. Convert HEIC photos to JPG first.";
  if (file.size === 0) return "This image is empty. Choose another photo.";
  if (file.size > MAX_REQUEST_IMAGE_BYTES) return "Choose an image smaller than 4 MB.";
}

/** Check the actual file header as well as the browser-supplied MIME type. */
export function matchesImageContent(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (contentType === "image/webp")
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}
