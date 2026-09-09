import { Skeleton, SkeletonCard } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): shown by Next.js while
// the server component above fetches configured recurrence tiers.
export default function RecurrenceRulesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
