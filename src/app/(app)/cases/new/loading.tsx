import { Skeleton } from "@/components/ui";

// Loop 89 (§24/§38 "Performance UX investigation"): this route is a
// client component with no data fetch of its own, so this fallback is
// only ever visible for the brief chunk-load moment - still better than
// a blank screen, and consistent with every other route now having one.
export default function NewCaseLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-20" />
      <div>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-3 w-24" />
        <Skeleton className="mt-2 h-1 w-full rounded-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
