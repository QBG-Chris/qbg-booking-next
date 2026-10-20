import { NextRequest, NextResponse } from "next/server";
import {
  MAX_REQUEST_IMAGE_BYTES,
  matchesImageContent,
  requestImageError,
  requestImageKindSchema,
} from "@/lib/request-images";
import { uploadRequestImage, verifyImageUploadToken } from "@/lib/server/request-images";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const authorization = verifyImageUploadToken(token, id);
  if (!authorization)
    return NextResponse.json(
      {
        error:
          "Photo upload access has expired or is invalid. Your appointment is still requested.",
      },
      { status: 403 },
    );

  // Bound the multipart body while streaming, even without a Content-Length header.
  const limit = MAX_REQUEST_IMAGE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return NextResponse.json({ error: "Choose an image smaller than 4 MB." }, { status: 413 });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;") || !request.body)
    return NextResponse.json({ error: "Send a photo upload." }, { status: 400 });

  let form: FormData;
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return NextResponse.json({ error: "Choose an image smaller than 4 MB." }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    form = await new Response(body, { headers: request.headers }).formData();
  } catch {
    return NextResponse.json({ error: "Send a valid photo upload." }, { status: 400 });
  }

  const kind = requestImageKindSchema.safeParse(form.get("kind"));
  const file = form.get("file");
  if (!kind.success || !(file instanceof File) || form.getAll("file").length !== 1)
    return NextResponse.json({ error: "Choose one inspo photo or selfie." }, { status: 400 });
  const allowed = authorization.uploads.find((image) => image.kind === kind.data);
  if (!allowed || allowed.contentType !== file.type)
    return NextResponse.json({ error: "This photo was not authorized." }, { status: 403 });
  const error = requestImageError(file);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesImageContent(bytes, file.type))
    return NextResponse.json(
      { error: "This file isn’t a valid JPG, PNG, or WebP image." },
      { status: 400 },
    );
  try {
    const image = await uploadRequestImage(authorization, kind.data, bytes);
    return NextResponse.json({ image }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Your photo couldn’t be uploaded. Please try again." },
      { status: 503 },
    );
  }
}
