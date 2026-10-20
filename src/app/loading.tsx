import { Shell } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Shell>
      <div role="status" className="space-y-6">
        <span className="sr-only">Getting your booking page ready…</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-60 max-w-2xl" />
      </div>
    </Shell>
  );
}
