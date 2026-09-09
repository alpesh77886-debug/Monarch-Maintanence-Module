import { Skeleton, SkeletonCard } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): shown by Next.js while
// the server component above fetches the case queue — this is the single
// most-visited screen in the app (Case Queue), previously had no
// loading.tsx at all (a blank screen during the fetch instead of this
// shape-matched placeholder), per the same Loop 67 precedent every other
// list route already follows.
export default function CasesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
