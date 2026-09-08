import { Skeleton, SkeletonCard } from "@/components/ui";

export default function MoreLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-6 w-20" />
        <Skeleton className="mt-2 h-4 w-44" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
