import { Skeleton, SkeletonCard } from "@/components/ui";

export default function MyWorkLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-4 w-52" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
