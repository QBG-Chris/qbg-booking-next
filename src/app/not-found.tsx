import Link from "next/link";
import { Shell } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Shell className="max-w-xl py-16 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
        Let’s try that again
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Stylist not found</h1>
      <p className="my-6 text-sm leading-7 text-muted-foreground">
        Check the booking name or ask your stylist for their personal booking link.
      </p>
      <Link href="/" className={`${buttonVariants()} h-11 px-5`}>
        Find my stylist
      </Link>
    </Shell>
  );
}
