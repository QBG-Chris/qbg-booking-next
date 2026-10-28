import Link from "next/link";
import { ArrowLeft, Scissors } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/models";
import { profileAppearance } from "@/lib/theme";

export function Shell({
  children,
  title,
  backHref,
  onBack,
  className,
  profile,
}: {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  onBack?: () => void;
  className?: string;
  profile?: Profile;
}) {
  const { theme, style } = profileAppearance(profile);
  return (
    <div
      data-theme={theme}
      className={cn(theme, "min-h-dvh bg-background text-foreground")}
      style={style}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center gap-3 px-5 sm:px-8">
          {onBack ? (
            <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
              <ArrowLeft />
            </Button>
          ) : backHref ? (
            <Link href={backHref} className="rounded-lg p-2 hover:bg-muted" aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
          ) : null}
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="BlendIQ home">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Scissors className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold tracking-tight">
                BlendIQ<span className="text-primary">.</span>
              </span>
              {title && (
                <span className="block truncate text-xs text-muted-foreground">{title}</span>
              )}
            </span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Badge variant="outline" className="hidden sm:inline-flex">
              Online booking
            </Badge>
          </div>
        </div>
      </header>
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <div className="border-b bg-secondary px-5 py-2 text-center text-xs text-secondary-foreground">
          Demo preview · Sample appointments only. No booking requests are sent.
        </div>
      )}
      <main id="main" className={cn("mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12", className)}>
        {children}
      </main>
    </div>
  );
}

export function Heading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-7">
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </p>
      )}
      <h1
        tabIndex={-1}
        className="text-3xl leading-tight font-semibold tracking-tight outline-none sm:text-4xl"
      >
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
