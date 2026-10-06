import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/collection')({
  component: CollectionLayout,
})

function CollectionLayout() {
  return <Outlet />
}
