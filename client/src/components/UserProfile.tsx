import { BiUser } from 'react-icons/bi'
import { useAuthStore } from '../store/auth-store'
import { Link } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import Avatar from 'boring-avatars'
import { useChangeDisplayNameModalStore } from '@/store/modal-store'

export const UserProfile = () => {
  const { user, isAuthenticated, logout } = useAuthStore()
  const { open: openChangeDisplayNameModal } = useChangeDisplayNameModalStore()
  if (!isAuthenticated) {
    return (
      <Link to="/login">
        <BiUser className="w-4 h-4 mr-2" />
        Sign In
      </Link>
    )
  }

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="relative h-10 w-10 rounded-full">
          <Avatar
            size={40}
            name={(user as any)._id}
            variant="marble"
            colors={['#0a0310', '#49007e', '#ff005b', '#ff7d10', '#ffb238']}
            className="m-0"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.displayName}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={openChangeDisplayNameModal}
          className="cursor-pointer text-xs"
        >
          Change Display Name
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout} className="cursor-pointer text-xs">
          Sign-Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
