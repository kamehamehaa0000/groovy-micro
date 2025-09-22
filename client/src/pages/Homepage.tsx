import RecentlyPlayedSongs from '../components/homepage/RecentlyPlayedSongs'
import HomepageSongs from '../components/homepage/HomepageSongs'
import HomepagePlaylists from '../components/homepage/HomepagePlaylists'
import HomepageAlbums from '../components/homepage/HomepageAlbums'
// import FeaturedSong from '@/components/homepage/FeaturedSong'
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const HomePage = () => {
  return (
    <div className="p-4 flex flex-col gap-y-5 h-full w-full">
      <RecentlyPlayedSongs />
      {/* <div className="flex w-full flex-wrap sm:flex-nowrap">
        <FeaturedSong />
        <FeaturedSong />
      </div> */}
      {/* <Tabs defaultValue="songs" className="w-full">
        <TabsList className="grid grid-cols-3 w-lg">
          <TabsTrigger value="songs">Songs</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
        </TabsList>
        <TabsContent value="songs">
          <HomepageSongs />
        </TabsContent>
        <TabsContent value="albums">
          <HomepageAlbums />
        </TabsContent>
        <TabsContent value="playlists">
          <HomepagePlaylists />
        </TabsContent>
      </Tabs> */}

      <HomepageSongs />
      <HomepageAlbums />
      <HomepagePlaylists />
    </div>
  )
}
