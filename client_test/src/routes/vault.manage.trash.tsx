import { createFileRoute } from '@tanstack/react-router'
import { TrashDesk } from '../Components/vault/manage/TrashDesk'

/** The trash desk of the vault manager. */
export const Route = createFileRoute('/vault/manage/trash')({
  component: TrashDesk,
})
