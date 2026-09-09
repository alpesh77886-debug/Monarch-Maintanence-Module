import { Skeleton, SkeletonCard } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): shown by Next.js while
// the server component above fetches the case's full detail (identity,
// lifecycle, all tab content in one Promise.all). Previously had no
// loading.tsx - a blank screen during that fetch on the app's second most-
// visited screen (Case Detail, the "cockpit"), per the same Loop 67
// precedent every other route already follows.
export default function CaseDetailLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-20" />
      <div className="rounded-xl border border-line2 bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-24" />
        <Skeleton className="mt-3 h-4 w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
