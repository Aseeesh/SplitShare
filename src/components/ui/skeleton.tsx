/** Shimmering placeholder blocks, shown by `loading.tsx` while a screen streams in. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800 ${className}`}
    />
  );
}

export function ScreenSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-52 rounded-3xl" />
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </main>
  );
}
