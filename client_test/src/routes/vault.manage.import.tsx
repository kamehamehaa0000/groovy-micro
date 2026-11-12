import { createFileRoute } from '@tanstack/react-router'
import { ImportDesk } from '../Components/vault/manage/ImportDesk'

/** The import desk of the vault manager. */
export const Route = createFileRoute('/vault/manage/import')({
  component: ImportDesk,
})
