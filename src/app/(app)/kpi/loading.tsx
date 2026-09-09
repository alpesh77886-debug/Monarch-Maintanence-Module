import { Skeleton } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): shown while the KPI
// page's own server-side aggregation query runs. Shape matches the real
// page's own top stat row + 8 report Groups.
export default function KpiLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-24" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
