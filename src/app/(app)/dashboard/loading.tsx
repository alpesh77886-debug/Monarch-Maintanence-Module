import { Skeleton, SkeletonCard } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): shown while the
// dashboard's own aggregation query runs. Shape matches the real page's
// stat-card row, bar-breakdown block, and case lists.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-24" />
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
