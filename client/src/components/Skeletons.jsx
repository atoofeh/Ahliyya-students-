import { Card, Skeleton } from './ui';

/** Shaped loading placeholders. Prefer these over a centred spinner for page content. */
export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <Card className={`space-y-3 p-4 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </Card>
  );
}

export function SkeletonRows({ rows = 6, cols = 4 }) {
  return (
    <Card className="divide-y divide-surface-100 dark:divide-surface-700/60">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? 'w-1/3' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </Card>
  );
}

export function SkeletonStat() {
  return (
    <Card className="flex items-center gap-3.5 p-4">
      <Skeleton className="h-11 w-11 rounded-xl" />
      <div className="flex-1 space-y-2"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-5 w-12" /></div>
    </Card>
  );
}

/** Whole-page fallback for lazily loaded routes. */
export function SkeletonPage() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    </div>
  );
}
