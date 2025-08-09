import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { ChevronLeft, ChevronRight, Heart, Music, Play } from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'

type Song = {
  id: number
  title: string
  artist: string
  genre: string
  cover: string
  duration: string
  plays: string
}

const songs: Song[] = [
  {
    id: 1,
    title: 'Hello',
    artist: 'kr$na',
    genre: 'Pop',
    cover:
      'https://indiater.com/wp-content/uploads/2021/06/Free-Music-Album-Cover-Art-Banner-Photoshop-Template.jpg',
    duration: '3:24',
    plays: '1.2M',
  },
  {
    id: 2,
    title: 'KKBN',
    artist: 'kr$na',
    genre: 'Pop',
    cover:
      'https://indiater.com/wp-content/uploads/2021/06/Free-Music-Album-Cover-Art-Banner-Photoshop-Template.jpg',
    duration: '2:56',
    plays: '890K',
  },
  {
    id: 3,
    title: 'Machayenge',
    artist: 'EMIWAY',
    genre: 'Hip-Hop',
    cover:
      'https://indiater.com/wp-content/uploads/2021/06/Free-Music-Album-Cover-Art-Banner-Photoshop-Template.jpg',
    duration: '4:12',
    plays: '2.1M',
  },
  {
    id: 4,
    title: 'Khatam',
    artist: 'EMIWAY',
    genre: 'Hip-Hop',
    cover:
      'https://indiater.com/wp-content/uploads/2021/06/Free-Music-Album-Cover-Art-Banner-Photoshop-Template.jpg',
    duration: '3:45',
    plays: '1.5M',
  },
  {
    id: 5,
    title: 'Mere Gully Mein',
    artist: 'DIVINE',
    genre: 'Rap',
    cover:
      'https://indiater.com/wp-content/uploads/2021/06/Free-Music-Album-Cover-Art-Banner-Photoshop-Template.jpg',
    duration: '3:18',
    plays: '3.2M',
  },
]

const FeaturedSong = () => {
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [liked, setLiked] = useState(false)

  const prevSong = useCallback(() => {
    setLiked(false)
    setCurrentSongIndex((i) => (i - 1 + songs.length) % songs.length)
  }, [])

  const nextSong = useCallback(() => {
    setLiked(false)
    setCurrentSongIndex((i) => (i + 1) % songs.length)
  }, [])

  // Keyboard navigation (Left/Right arrows)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevSong()
      if (e.key === 'ArrowRight') nextSong()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevSong, nextSong])

  const current = songs[currentSongIndex]

  return (
    <div className="w-full  px-4">
      <div className="flex items-center justify-between mb-4 ">
        <div className="flex items-center gap-2 ">
          <h2 className="text-xl font-semibold text-neutral-900">
            Featured Songs
          </h2>
          <span className="text-sm text-neutral-500">
            {currentSongIndex + 1}/{songs.length}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={prevSong}
            aria-label="Previous song"
            className="h-8 w-8 p-0 rounded-full border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={nextSong}
            aria-label="Next song"
            className="h-8 w-8 p-0 rounded-full border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="p-0 border border-neutral-200 bg-white rounded-xl shadow-none hover:shadow-sm transition-shadow">
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row items-center gap-6 p-4">
            <div className="shrink-0 aspect-square">
              <img
                src={current.cover}
                alt={`${current.title} cover by ${current.artist}`}
                className="w-28 h-28 rounded-lg border border-neutral-200 object-cover"
              />
            </div>

            <div className="flex-1 w-full flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div key={current.id} className="transition-all">
                <Badge className="mb-2 w-fit text-[11px] px-2 py-0.5 rounded-full border border-neutral-200 bg-transparent text-neutral-600">
                  {current.genre}
                </Badge>
                <h3 className="text-xl font-semibold text-neutral-900">
                  {current.title}
                </h3>
                <p className="text-sm text-neutral-500">{current.artist}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                  <span>{current.plays} plays</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Play"
                  className={`h-8 w-8 p-0 rounded-full border-neutral-200 hover:bg-neutral-50 `}
                  title={'play'}
                >
                  <Play className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default FeaturedSong
