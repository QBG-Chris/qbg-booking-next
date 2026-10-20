"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { ClientDetails } from "@/lib/models";
import type { RequestImageFiles, RequestImageKind } from "@/lib/request-images";
import { RequestImageUpload } from "./request-image-upload";
import { PhoneInput } from "./phone-input";

export type DetailErrors = Partial<Record<keyof ClientDetails, string>>;

export function DetailsForm({
  details,
  errors,
  onChange,
  onSubmit,
  images,
  onImageChange,
}: {
  details: ClientDetails;
  errors: DetailErrors;
  onChange: (key: keyof ClientDetails, value: string) => void;
  onSubmit: () => void;
  images: RequestImageFiles;
  onImageChange: (kind: RequestImageKind, file?: File) => void;
}) {
  const fields = [
    {
      key: "firstName",
      label: "First name",
      placeholder: "Enter your first name",
      autoComplete: "given-name",
      type: "text",
    },
    {
      key: "lastName",
      label: "Last name",
      placeholder: "Enter your last name",
      autoComplete: "family-name",
      type: "text",
    },
    {
      key: "email",
      label: "Email",
      placeholder: "you@example.com",
      autoComplete: "email",
      type: "email",
    },
    {
      key: "phone",
      label: "Phone number",
      placeholder: "+1 (000) 000-0000",
      autoComplete: "tel",
      type: "tel",
    },
  ] as const;
  return (
    <Card className="rounded-xl py-0">
      <CardContent className="p-5 sm:p-6">
        <form
          id="client-details"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-5"
        >
          {fields.map((field) => (
            <div className="space-y-2" key={field.key}>
              <Label htmlFor={field.key}>
                {field.label}
                <span aria-hidden="true" className="text-primary">
                  *
                </span>
              </Label>
              {field.key === "phone" ? (
                <PhoneInput
                  id={field.key}
                  name={field.key}
                  value={details.phone}
                  onChange={(value) => onChange("phone", value)}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  required
                  maxLength={100}
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "phone-error" : "phone-help"}
                  className="h-11"
                />
              ) : (
                <Input
                  id={field.key}
                  name={field.key}
                  type={field.type}
                  value={details[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  required
                  maxLength={field.key === "email" ? 254 : 100}
                  aria-invalid={!!errors[field.key]}
                  aria-describedby={errors[field.key] ? `${field.key}-error` : undefined}
                  className="h-11"
                />
              )}
              {field.key === "phone" && (
                <p id="phone-help" className="text-xs leading-6 text-muted-foreground">
                  For appointment updates. Enter a US phone number, with or without +1.
                </p>
              )}
              {errors[field.key] && (
                <p id={`${field.key}-error`} role="alert" className="text-xs text-destructive">
                  {errors[field.key]}
                </p>
              )}
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Anything else?
              <span className="text-xs font-normal text-muted-foreground">Optional</span>
            </Label>
            <Textarea
              id="notes"
              name="notes"
              value={details.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              placeholder="Tell your stylist a little about what you have in mind…"
              rows={4}
              maxLength={2000}
              aria-invalid={!!errors.notes}
              aria-describedby={errors.notes ? "notes-error" : undefined}
            />
            {errors.notes && (
              <p id="notes-error" role="alert" className="text-xs text-destructive">
                {errors.notes}
              </p>
            )}
          </div>
          <RequestImageUpload images={images} onChange={onImageChange} />
        </form>
      </CardContent>
    </Card>
  );
}
