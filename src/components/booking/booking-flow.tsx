"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Heading, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ServicePicker } from "./service-picker";
import { DatePicker } from "./date-picker";
import { DetailsForm, type DetailErrors } from "./details-form";
import { AppointmentOverview } from "./appointment-overview";
import { Review } from "./review";
import { availableSlots, detailsSchema, duration, money } from "@/lib/booking";
import {
  busyPeriodSchema,
  type Availability,
  type ClientDetails,
  type Profile,
  type Receipt,
  type Service,
} from "@/lib/models";
import { saveReceipt } from "@/lib/receipt";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { requestImageKinds, type RequestImageFiles } from "@/lib/request-images";

type PendingPhotos = { receipt: Receipt; token: string };

const steps = [
  {
    label: "Service",
    title: "Choose your service",
    subtitle: "A refresh, a transformation, or your usual. What are we doing today?",
  },
  {
    label: "Date & time",
    title: "Find your perfect time",
    subtitle: "Pick a date and an available time that works for you.",
  },
  {
    label: "Your details",
    title: "A few details about you",
    subtitle: "Let your stylist know who’s coming. Your details stay with your booking.",
  },
  {
    label: "Review",
    title: "Review your appointment",
    subtitle: "Check the details below, then send your request to your stylist.",
  },
];

export function BookingFlow({
  profile,
  services,
  schedule,
}: {
  profile: Profile;
  services: Service[];
  schedule: Availability[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service>();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [retry, setRetry] = useState(0);
  const [details, setDetails] = useState<ClientDetails>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [errors, setErrors] = useState<DetailErrors>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submissionError, setSubmissionError] = useState("");
  const [images, setImages] = useState<RequestImageFiles>({});
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhotos>();
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!date || !service) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/stylists/${profile.slug}/availability?date=${date}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Please try again.");
        const busy = z.array(busyPeriodSchema).parse(data.busy);
        if (controller.signal.aborted) return;
        const nextSlots = availableSlots(date, service, schedule, busy);
        setSlots(nextSlots);
        setTime((current) => (nextSlots.includes(current) ? current : ""));
        setAvailabilityError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setSlots([]);
        setTime("");
        setAvailabilityError(error instanceof Error ? error.message : "Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [date, service, schedule, profile.slug, retry]);

  function goTo(next: number) {
    if (submittingRef.current || pendingPhotos) return;
    setStep(next);
    setConsent(false);
    setSubmissionError("");
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => headingRef.current?.querySelector("h1")?.focus());
  }
  function next() {
    if (step === 0 && service) goTo(1);
    else if (step === 1 && date && time && !loading && !availabilityError) goTo(2);
    else if (step === 2) {
      const result = detailsSchema.safeParse(details);
      if (result.success) {
        setDetails(result.data);
        setErrors({});
        goTo(3);
      } else {
        const nextErrors: DetailErrors = {};
        for (const issue of result.error.issues)
          nextErrors[issue.path[0] as keyof ClientDetails] ??= issue.message;
        setErrors(nextErrors);
        requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
      }
    }
  }
  async function submit() {
    if (!service || !date || !time || !consent || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError("");
    try {
      let pending = pendingPhotos;
      if (!pending) {
        const response = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...details,
            slug: profile.slug,
            serviceId: service.id,
            date,
            time,
            smsConsent: consent,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            imageUploads: requestImageKinds
              .filter((kind) => images[kind])
              .map((kind) => ({
                kind,
                contentType: images[kind]!.type,
              })),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Please try again.");
        const { imageUploadToken, ...receipt } = data as Receipt & { imageUploadToken?: string };
        saveReceipt(receipt);
        if (!requestImageKinds.some((kind) => images[kind])) {
          router.replace(`/book/${profile.slug}/confirmation`);
          return;
        }
        pending = { receipt, token: imageUploadToken || "" };
        setPendingPhotos(pending);
      }
      const receipt: Receipt = { ...pending.receipt, images: [...(pending.receipt.images || [])] };
      const remaining = requestImageKinds.filter(
        (kind) => images[kind] && !receipt.images!.some((image) => image.kind === kind),
      );
      const results = await Promise.allSettled(
        remaining.map(async (kind) => {
          const form = new FormData();
          form.set("kind", kind);
          form.set("file", images[kind]!);
          const response = await fetch(`/api/bookings/${receipt.id}/images`, {
            method: "POST",
            headers: { Authorization: `Bearer ${pending.token}` },
            body: form,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Please try again.");
          return data.image;
        }),
      );
      for (const result of results)
        if (result.status === "fulfilled") receipt.images!.push(result.value);
      saveReceipt(receipt);
      setPendingPhotos({ ...pending, receipt });
      if (results.some((result) => result.status === "rejected")) {
        throw new Error(
          "Your appointment request has been sent. Some photos couldn’t be attached. Retry to upload only the remaining photos, or continue without them.",
        );
      }
      router.replace(`/book/${profile.slug}/confirmation`);
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Your request couldn’t be sent. Please try again.",
      );
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  const canProceed =
    step === 0 ? !!service : step === 1 ? !!date && !!time && !loading && !availabilityError : true;

  return (
    <Shell
      title={profile.display_name}
      onBack={
        pendingPhotos ? undefined : () => (step ? goTo(step - 1) : router.push(`/${profile.slug}`))
      }
      className="pb-32 sm:pb-36"
    >
      <nav aria-label="Booking progress" className="mb-10">
        <ol className="relative isolate grid grid-cols-4">
          {steps.map((item, index) => (
            <li key={item.label} className="relative text-center">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-4 right-1/2 -z-10 h-px w-full bg-border",
                    index <= step && "bg-primary/50",
                  )}
                />
              )}
              <button
                type="button"
                disabled={index >= step || submitting || !!pendingPhotos}
                onClick={() => goTo(index)}
                aria-current={index === step ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${item.label}`}
                className="relative mx-auto flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-full border bg-background text-xs",
                    index <= step
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {index < step ? <Check className="size-4" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-[10px] leading-5 sm:text-xs",
                    index === step ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <section className="min-w-0">
          <div ref={headingRef}>
            <Heading
              eyebrow={`Step ${step + 1} of 4`}
              title={steps[step].title}
              subtitle={steps[step].subtitle}
            />
          </div>
          {step === 0 && (
            <ServicePicker
              services={services}
              selected={service}
              onSelect={(selected) => {
                if (selected.id !== service?.id) {
                  setService(selected);
                  setTime("");
                  setDate("");
                  setSlots([]);
                  setAvailabilityError("");
                  setLoading(false);
                }
              }}
            />
          )}
          {step === 1 && (
            <DatePicker
              date={date}
              time={time}
              slots={slots}
              loading={loading}
              error={availabilityError}
              schedule={schedule}
              onDate={(value) => {
                setDate(value);
                setTime("");
                setSlots([]);
                setAvailabilityError("");
                setLoading(true);
                setRetry((current) => current + 1);
              }}
              onTime={setTime}
              onRetry={() => {
                setLoading(true);
                setAvailabilityError("");
                setRetry((current) => current + 1);
              }}
            />
          )}
          {step === 2 && (
            <DetailsForm
              details={details}
              errors={errors}
              onChange={(key, value) => {
                setDetails((current) => ({ ...current, [key]: value }));
                setErrors((current) => ({ ...current, [key]: undefined }));
              }}
              onSubmit={next}
              images={images}
              onImageChange={(kind, file) => setImages((current) => ({ ...current, [kind]: file }))}
            />
          )}
          {step === 3 && service && (
            <Review
              profile={profile}
              service={service}
              date={date}
              time={time}
              details={details}
              consent={consent}
              submitting={submitting}
              error={submissionError}
              images={images}
              bookingSent={!!pendingPhotos}
              onSkipPhotos={() => router.replace(`/book/${profile.slug}/confirmation`)}
              onConsent={setConsent}
              onEdit={() => goTo(2)}
              onConfirm={() => void submit()}
              onChangeTime={() => {
                goTo(1);
                setTime("");
                setLoading(true);
                setRetry((current) => current + 1);
              }}
            />
          )}
        </section>
        <aside
          aria-label="Appointment overview"
          className={cn("lg:sticky lg:top-8", step === 3 && "hidden lg:block")}
        >
          <AppointmentOverview profile={profile} service={service} date={date} time={time} />
        </aside>
      </div>
      {step < 3 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4 sm:px-8">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold sm:text-sm">
                {service?.name || "Your next good hair day"}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">
                {service
                  ? `${duration(service.duration_minutes)} · ${money(service.price)}`
                  : "Select a service to get started"}
              </p>
            </div>
            <Button
              className="h-11 min-w-28 px-4 sm:min-w-40"
              disabled={!canProceed}
              onClick={next}
            >
              {step === 2 ? "Review booking" : "Continue"}
              <ArrowRight className="hidden sm:block" />
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}
