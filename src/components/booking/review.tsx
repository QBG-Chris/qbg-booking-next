"use client";

import {
  CalendarDays,
  Info,
  LoaderCircle,
  MapPin,
  NotebookPen,
  Phone,
  Scissors,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StylistIdentity } from "@/components/stylist-identity";
import { Detail } from "./appointment-overview";
import { address, displayDate, displayTime, duration, money } from "@/lib/booking";
import type { ClientDetails, Profile, Service } from "@/lib/models";
import type { RequestImageFiles } from "@/lib/request-images";
import { RequestImagePreviews } from "./request-image-upload";

export function Review({
  profile,
  service,
  date,
  time,
  details,
  consent,
  submitting,
  error,
  onConsent,
  onEdit,
  onConfirm,
  onChangeTime,
  images,
  bookingSent,
  onSkipPhotos,
}: {
  profile: Profile;
  service: Service;
  date: string;
  time: string;
  details: ClientDetails;
  consent: boolean;
  submitting: boolean;
  error: string;
  onConsent: (value: boolean) => void;
  onEdit: () => void;
  onConfirm: () => void;
  onChangeTime: () => void;
  images: RequestImageFiles;
  bookingSent: boolean;
  onSkipPhotos: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="rounded-xl py-0">
        <CardContent className="p-6">
          <StylistIdentity profile={profile} />
          <div className="mt-6 space-y-5">
            {address(profile) && <Detail icon={MapPin} label="Location" value={address(profile)} />}
            <Separator />
            <Detail
              icon={Scissors}
              label="Service"
              value={service.name}
              subtitle={`${duration(service.duration_minutes)} · ${money(service.price)}`}
            />
            <Detail
              icon={CalendarDays}
              label="Date & time"
              value={displayDate(date)}
              subtitle={displayTime(time)}
            />
            <Separator />
            <Detail
              icon={User}
              label="Client"
              value={`${details.firstName.trim()} ${details.lastName.trim()}`}
              subtitle={details.email}
            />
            <Detail icon={Phone} label="Phone" value={details.phone} />
            {details.notes.trim() && (
              <Detail icon={NotebookPen} label="Notes" value={details.notes.trim()} />
            )}
            <RequestImagePreviews images={images} />
            <Separator />
            <div className="flex justify-between text-sm">
              <span>Service total</span>
              <span className="text-lg font-semibold">{money(service.price)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-start gap-3">
        <Checkbox
          id="sms-consent"
          checked={consent}
          onCheckedChange={(checked) => onConsent(checked === true)}
          disabled={submitting || bookingSent}
          className="mt-1 size-5"
        />
        <div>
          <Label htmlFor="sms-consent" className="cursor-pointer text-sm leading-6">
            Keep me updated about my appointment
          </Label>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            By confirming this booking, you agree to receive SMS notifications regarding your
            appointment. Message and data rates may apply.
          </p>
        </div>
      </div>
      <Alert>
        <Info />
        <AlertTitle>Your stylist will review your request</AlertTitle>
        <AlertDescription>
          You’ll receive an update once your appointment is confirmed.
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>
            {bookingSent
              ? "Your booking is requested. Let’s finish your photos."
              : "Your request couldn’t be sent"}
          </AlertTitle>
          <AlertDescription>
            {error}
            {!bookingSent && (
              <Button variant="outline" onClick={onChangeTime} className="mt-3 h-10">
                Choose another time
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={submitting || bookingSent}
          onClick={onEdit}
          className="h-11 flex-1"
        >
          Edit
        </Button>
        <Button disabled={submitting || !consent} onClick={onConfirm} className="h-11 flex-2">
          {submitting && <LoaderCircle className="animate-spin" />}
          {submitting
            ? bookingSent
              ? "Uploading photos…"
              : "Sending request…"
            : bookingSent
              ? "Retry photos"
              : "Confirm booking"}
        </Button>
      </div>
      {bookingSent && !submitting && (
        <Button
          variant="ghost"
          onClick={onSkipPhotos}
          className="h-auto min-h-11 w-full whitespace-normal"
        >
          Continue without remaining photos
        </Button>
      )}
    </div>
  );
}
