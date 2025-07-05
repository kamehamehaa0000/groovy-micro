export interface UserCreatedEventData {
  userId: string
  email: string
  displayName: string
  googleId?: string
}

export interface UserUpdatedEventData {
  userId: string
  displayName?: string
  updatedFields: string[]
}

export interface UserDeletedEventData {
  userId: string
}
