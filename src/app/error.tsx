"use client";

import Link from "next/link";
import { Shell } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Shell className="max-w-xl">
      <Alert variant="destructive">
        <AlertTitle>We couldn’t load this page</AlertTitle>
        <AlertDescription>
          Please try again in a moment. If this is a local setup, check your backend environment
          settings or run the demo preview.
        </AlertDescription>
      </Alert>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} className="h-11">
          Try again
        </Button>
        <Link href="/" className={`${buttonVariants({ variant: "outline" })} h-11`}>
          Go home
        </Link>
      </div>
    </Shell>
  );
}
