import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/vault/manage/')({
  beforeLoad: () => {
    // The manager always opens on a desk.
    throw redirect({ to: '/vault/manage/import' })
  },
})
