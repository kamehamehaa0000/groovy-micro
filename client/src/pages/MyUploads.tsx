import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import UserUploadedAlbums from './UserUploadedAlbums'
import UserUploadedSongs from './UserUploadedSongs'

const MyUploads = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl  font-bold m-4">My Uploads</h1>

      <Tabs defaultValue="songs" className="w-full p-3">
        <TabsList className="">
          <TabsTrigger value="songs">Songs</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
        </TabsList>

        <TabsContent value="songs" className="mt-6">
          <UserUploadedSongs />
        </TabsContent>
        <TabsContent value="albums" className="mt-6">
          <UserUploadedAlbums />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default MyUploads
