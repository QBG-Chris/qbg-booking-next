"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SelfieCamera({
  onCapture,
  onCancel,
  onChooseFile,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onChooseFile: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    const preview = video.current;
    active.current = true;
    cancel.current?.focus();

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access isn’t available in this browser. Choose a file instead.");
        return;
      }
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
        if (disposed) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        if (preview) {
          preview.srcObject = stream;
          await preview.play();
        }
      } catch (cause) {
        stream?.getTracks().forEach((track) => track.stop());
        if (disposed) return;
        const name = cause instanceof Error ? cause.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access was blocked. Allow camera access in your browser, or choose a file."
            : name === "NotFoundError"
              ? "No camera was found. Connect a camera or choose a file."
              : "The camera couldn’t be opened. Check that it isn’t in use, or choose a file.",
        );
      }
    }
    void openCamera();
    return () => {
      disposed = true;
      active.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (preview) preview.srcObject = null;
    };
  }, []);

  function capture() {
    const preview = video.current;
    if (!preview?.videoWidth || !preview.videoHeight) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(preview.videoWidth, preview.videoHeight));
    canvas.width = Math.round(preview.videoWidth * scale);
    canvas.height = Math.round(preview.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The photo couldn’t be captured. Choose a file instead.");
      return;
    }
    setCapturing(true);
    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!active.current) return;
        setCapturing(false);
        if (!blob) {
          setError("The photo couldn’t be captured. Choose a file instead.");
          return;
        }
        onCapture(new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div
      role="group"
      aria-label="Take a selfie"
      className="space-y-3 p-3"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label="Selfie camera preview"
        className="aspect-[4/3] w-full -scale-x-100 rounded-lg bg-muted object-contain"
        onCanPlay={() => setReady(true)}
      />
      {error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : (
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {ready ? "Frame your hair in the preview, then capture your photo." : "Opening camera…"}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {error ? (
          <Button type="button" size="sm" onClick={onChooseFile}>
            Choose file instead
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!ready || capturing} onClick={capture}>
            <Camera aria-hidden="true" />
            {capturing ? "Saving…" : "Capture photo"}
          </Button>
        )}
        <Button ref={cancel} type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel camera
        </Button>
      </div>
    </div>
  );
}
