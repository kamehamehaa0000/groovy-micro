import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type Song } from '../../store/player-store'
import { HiOutlineMenu } from 'react-icons/hi'

interface SortableSongItemProps {
  song: Song
  onPlay: () => void
}

export const SortableSongItem: React.FC<SortableSongItemProps> = ({
  song,
  onPlay,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group relative"
    >
      <div
        className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden cursor-pointer"
        onClick={onPlay}
      >
        <img
          src={song.metadata.album.coverUrl ?? song.coverArtUrl}
          alt={song.metadata.title}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onPlay}>
        <p className="text-sm font-medium truncate text-gray-900 group-hover:text-gray-700">
          {song.metadata.title ?? 'Unknown Title'}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {song.metadata.artist.displayName}
        </p>
      </div>
      <button
        {...attributes}
        {...listeners}
        className="p-2 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
      >
        <HiOutlineMenu />
      </button>
    </div>
  )
}
