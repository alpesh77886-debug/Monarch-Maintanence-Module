import { Skeleton, SkeletonCard } from "@/components/ui";

// Loop 67: shown by Next.js while the server component above fetches spare
// requests — a shape-matched placeholder instead of a blank screen or a
// generic spinner, per the Prompt's own perceived-performance guidance.
export default function SparesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
