import { Skeleton } from '../ui/skeleton'

export const PlaylistSkeleton = () => (
  <div className="space-y-2 pt-1">
    {[...Array(5)].map((_, i) => (
      <div
        key={i + 'user-sidebar-playlist'}
        className="flex items-center space-x-3 px-3 py-1.5"
      >
        <Skeleton className="w-2.5 h-2.5 rounded-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    ))}
  </div>
)
