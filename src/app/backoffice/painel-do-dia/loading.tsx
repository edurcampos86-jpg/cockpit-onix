import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PainelDoDiaLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-8 py-6 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="grid grid-cols-1 gap-6 px-8 lg:grid-cols-3">
        <SkeletonCard lines={3} />
        <div className="lg:col-span-2 grid grid-cols-1 gap-6 md:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </div>

      <div className="px-8">
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}

function SkeletonCard({ lines }: { lines: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
