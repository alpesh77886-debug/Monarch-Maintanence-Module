import { Skeleton, SkeletonCard } from "@/components/ui";

export default function PmLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-56" />

      <Skeleton className="h-24 w-full rounded-xl" />

      <section>
        <Skeleton className="h-4 w-16" />
        <div className="mt-2 flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="h-4 w-20" />
        <div className="mt-2 flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
