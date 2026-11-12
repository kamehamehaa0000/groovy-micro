import { createFileRoute } from '@tanstack/react-router'
import { CollectionDesk } from '../Components/vault/manage/CollectionDesk'

/** The collection desk of the vault manager. */
export const Route = createFileRoute('/vault/manage/collection')({
  component: CollectionDesk,
})
