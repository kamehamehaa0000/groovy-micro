import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/subscriptions/')({
  beforeLoad: () => {
    // The desk always opens on a desk.
    throw redirect({ to: '/admin/subscriptions/plans' })
  },
})
