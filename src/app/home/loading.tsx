import { Skeleton } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): shown while the
// Module Hub's own aggregation query (5 counts + notifications, issued
// together per the Loop 37 convention) runs — this is the very first
// screen every user sees after signing in, and previously had no
// loading.tsx at all.
export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-bg2">
      <div className="h-14" style={{ background: "linear-gradient(135deg,#0f9f8e,#13b981)" }} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 pt-4 lg:max-w-4xl xl:max-w-5xl">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2 h-6 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[105px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
