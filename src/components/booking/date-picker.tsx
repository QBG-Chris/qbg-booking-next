"use client";

import { CalendarDays, LoaderCircle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { displayDate, displayTime, localDate, parseLocalDate } from "@/lib/booking";
import type { Availability } from "@/lib/models";

export function DatePicker({
  date,
  time,
  slots,
  loading,
  error,
  schedule,
  onDate,
  onTime,
  onRetry,
}: {
  date: string;
  time: string;
  slots: string[];
  loading: boolean;
  error: string;
  schedule: Availability[];
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onRetry: () => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <div className="space-y-7">
      <Card className="rounded-xl py-0">
        <CardContent className="flex justify-center px-2 py-5">
          <Calendar
            mode="single"
            selected={date ? parseLocalDate(date) : undefined}
            defaultMonth={date ? parseLocalDate(date) : today}
            onSelect={(value) => {
              if (value) onDate(localDate(value));
            }}
            disabled={(day) =>
              day < today ||
              !schedule.some(
                (item) =>
                  item.day_of_week === (day.getDay() + 6) % 7 && item.start_at !== item.end_at,
              )
            }
            startMonth={today}
            className="[--cell-size:2.2rem] sm:[--cell-size:2.65rem]"
          />
        </CardContent>
      </Card>
      <section aria-label="Available times" aria-busy={loading}>
        <h2 className="font-semibold">Available times</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {date ? displayDate(date) : "Choose a date to see your stylist’s availability."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Times are shown in your local time.</p>
        <div className="mt-4" aria-live="polite">
          {loading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-9 text-sm text-muted-foreground"
            >
              <LoaderCircle className="size-5 animate-spin" />
              Checking available times…
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Availability couldn’t be loaded</AlertTitle>
              <AlertDescription>
                {error}
                <Button variant="outline" onClick={onRetry} className="mt-3 h-10">
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : !date ? (
            <Alert>
              <CalendarDays />
              <AlertTitle>Select a date first</AlertTitle>
              <AlertDescription>
                Your available appointment times will appear here.
              </AlertDescription>
            </Alert>
          ) : !slots.length ? (
            <Alert>
              <CalendarDays />
              <AlertTitle>No available times for this date</AlertTitle>
              <AlertDescription>
                Try another day to find a time that works for you.
              </AlertDescription>
            </Alert>
          ) : (
            <fieldset className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              <legend className="sr-only">Choose an appointment time</legend>
              {slots.map((slot) => (
                <label key={slot} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="time"
                    value={slot}
                    checked={time === slot}
                    onChange={() => onTime(slot)}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                  />
                  <span className="flex min-h-11 items-center justify-center rounded-lg border bg-card px-1 text-xs font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:border-primary">
                    {displayTime(slot)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </section>
    </div>
  );
}
