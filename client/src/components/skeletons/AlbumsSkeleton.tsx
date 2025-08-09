const AlbumsSkeleton = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index + 'loading-public-albums'}
          className="animate-pulse bg-white rounded-lg shadow-sm p-3"
        >
          <div className="w-full aspect-square bg-gray-200 rounded-md mb-2"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default AlbumsSkeleton
