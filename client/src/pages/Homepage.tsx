import RecentlyPlayedSongs from '../components/homepage/RecentlyPlayedSongs'
import HomepageSongs from '../components/homepage/HomepageSongs'
import HomepagePlaylists from '../components/homepage/HomepagePlaylists'
import HomepageAlbums from '../components/homepage/HomepageAlbums'
import FeaturedSong from '@/components/homepage/FeaturedSong'

export const HomePage = () => {
  return (
    <div className="p-4 flex flex-col gap-y-5 h-full w-full">
      <RecentlyPlayedSongs />
      <div className="flex w-full flex-wrap sm:flex-nowrap">
        <FeaturedSong />
        <FeaturedSong />
      </div>
      <HomepageSongs />
      <HomepageAlbums />
      <HomepagePlaylists />
    </div>
  )
}
