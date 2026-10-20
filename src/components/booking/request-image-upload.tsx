"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Check, ImagePlus, ScanFace, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  requestImageError,
  requestImageKinds,
  requestImageLabels,
  type RequestImageFiles,
  type RequestImageKind,
} from "@/lib/request-images";
import { cn } from "@/lib/utils";
import { SelfieCamera } from "./selfie-camera";

export function PhotoPreview({
  file,
  alt,
  className,
}: {
  file: File;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // Local File previews don't use Next's remote image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={alt} className={className} />;
}

function ImageUpload({
  kind,
  file,
  onChange,
}: {
  kind: RequestImageKind;
  file?: File;
  onChange: (file?: File) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const wasCameraOpen = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const dragDepth = useRef(0);
  const label = requestImageLabels[kind];
  const Icon = kind === "inspo" ? Sparkles : ScanFace;

  useEffect(() => {
    if (wasCameraOpen.current && !cameraOpen) cameraButton.current?.focus();
    wasCameraOpen.current = cameraOpen;
  }, [cameraOpen]);

  function select(files: File[]) {
    if (!files.length) return;
    if (files.length > 1) {
      setError("Choose one photo for this upload.");
      return;
    }
    const nextError = requestImageError(files[0]);
    setError(nextError || "");
    if (!nextError) {
      onChange(files[0]);
      setCameraOpen(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <span id={`${id}-title`}>{label}</span>
      </div>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (--dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          select(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "relative overflow-hidden rounded-xl border border-dashed bg-background/60 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30",
          dragging
            ? "border-primary bg-secondary ring-2 ring-ring/30"
            : "border-input hover:border-primary/60",
          file && "border-solid bg-muted/30",
          error && "border-destructive",
        )}
      >
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          aria-label={`Upload ${label.toLowerCase()}`}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          aria-invalid={!!error}
          className="peer sr-only"
          onChange={(event) => {
            select(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
        {cameraOpen ? (
          <SelfieCamera
            onCapture={(photo) => select([photo])}
            onCancel={() => setCameraOpen(false)}
            onChooseFile={() => {
              setCameraOpen(false);
              input.current?.click();
            }}
          />
        ) : file ? (
          <>
            <div className="relative aspect-[4/3] bg-muted/50 p-2">
              <PhotoPreview
                file={file}
                alt={`${label} preview`}
                className="size-full rounded-lg object-contain"
              />
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-medium shadow-sm">
                <Check className="size-3 text-primary" aria-hidden="true" /> Ready to attach
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`Remove ${label.toLowerCase()}`}
                onClick={() => {
                  onChange(undefined);
                  setError("");
                  input.current?.focus();
                }}
                className="absolute top-3 right-3 rounded-full bg-card/95 shadow-sm"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex min-w-0 items-center gap-2 border-t px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {file.size < 1024 * 1024
                    ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                </p>
              </div>
              {kind !== "selfie" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => input.current?.click()}
                  aria-label={`Replace ${label.toLowerCase()}`}
                >
                  Replace
                </Button>
              )}
            </div>
          </>
        ) : kind === "selfie" ? (
          <div className="flex min-h-36 flex-col items-center justify-center px-4 py-7 text-center">
            <span className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-card text-primary shadow-xs">
              <ScanFace className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-primary">
              Choose a file or take a photo
            </span>
            <span className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
              or drag & drop it here
            </span>
          </div>
        ) : (
          <label
            htmlFor={id}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center px-4 py-7 text-center peer-focus-visible:underline"
          >
            <span className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-card text-primary shadow-xs">
              <Upload className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-primary">Choose a photo</span>
            <span className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
              or drag & drop it here
            </span>
          </label>
        )}
        {kind === "selfie" && !cameraOpen && (
          <div className="flex flex-wrap justify-center gap-2 border-t px-3 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={file ? "Replace selfie" : "Choose selfie file"}
              onClick={() => input.current?.click()}
            >
              <Upload aria-hidden="true" />
              {file ? "Replace file" : "Choose file"}
            </Button>
            <Button
              ref={cameraButton}
              type="button"
              variant="outline"
              size="sm"
              aria-label={file ? "Retake selfie photo" : "Take selfie photo"}
              onClick={() => {
                setError("");
                setCameraOpen(true);
              }}
            >
              <Camera aria-hidden="true" />
              {file ? "Retake photo" : "Take photo"}
            </Button>
          </div>
        )}
      </div>
      <p id={`${id}-help`} className="text-xs leading-5 text-muted-foreground">
        {kind === "inspo"
          ? "The look you love. A cut, color, or style to inspire your visit."
          : "Your hair today. Help your stylist get to know your starting point."}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      )}
      <span className="sr-only" role="status">
        {file ? `${label} selected: ${file.name}` : `${label} not selected`}
      </span>
    </div>
  );
}

export function RequestImageUpload({
  images,
  onChange,
}: {
  images: RequestImageFiles;
  onChange: (kind: RequestImageKind, file?: File) => void;
}) {
  return (
    <fieldset className="space-y-5 border-t pt-6">
      <legend className="sr-only">Optional appointment photos</legend>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <ImagePlus className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Show us what you have in mind</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            Optional
          </span>
        </div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          A little visual inspiration goes a long way. Add either photo, both, or skip for now.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {requestImageKinds.map((kind) => (
          <ImageUpload
            key={kind}
            kind={kind}
            file={images[kind]}
            onChange={(file) => onChange(kind, file)}
          />
        ))}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        JPG, PNG, or WebP · Up to 4 MB each. Photos attach when you send your request.
      </p>
    </fieldset>
  );
}

export function RequestImagePreviews({ images }: { images: RequestImageFiles }) {
  const kinds = requestImageKinds.filter((kind) => images[kind]);
  if (!kinds.length) return null;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Photos to share with your stylist</p>
      <div className="grid grid-cols-2 gap-3">
        {kinds.map((kind) => (
          <div key={kind} className="min-w-0 rounded-lg border bg-muted/30 p-2">
            <PhotoPreview
              file={images[kind]!}
              alt={`${requestImageLabels[kind]} preview`}
              className="aspect-[4/3] w-full rounded-md object-contain"
            />
            <p className="px-1 pt-2 pb-1 text-xs font-medium">{requestImageLabels[kind]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
