import { Skeleton } from "@/components/ui/skeleton";

export default function BrandLoading() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
