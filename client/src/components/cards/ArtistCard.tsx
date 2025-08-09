import Avatar from 'boring-avatars'
import { Link } from 'react-router'

export const ArtistCompactCard = ({
  artist,
}: {
  artist: { _id: string; displayName: string }
}) => {
  return (
    <div className="max-w-3xs bg-white rounded-lg shadow-md px-2 py-1.5 mx-auto flex items-center justify-start gap-2">
      <Avatar
        name={artist._id}
        colors={['#0a0310', '#49007e', '#ff005b', '#ff7d10', '#ffb238']}
        variant="marble"
        size={40}
      />{' '}
      <Link
        to={`/artists/artist/${artist._id}`}
        className="text-xs font-semibold"
      >
        {artist.displayName}
      </Link>
    </div>
  )
}

export default ArtistCompactCard
