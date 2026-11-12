import { createFileRoute } from '@tanstack/react-router'
import { ArtistsDesk } from '../Components/vault/manage/ArtistsDesk'

/** The artists desk of the vault manager. */
export const Route = createFileRoute('/vault/manage/artists')({
  component: ArtistsDesk,
})
