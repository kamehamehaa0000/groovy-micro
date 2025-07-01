// Event data interfaces
export interface UserCreatedEvent {
  userId: string
  email: string
  displayName: string
}

export interface UserUpdatedEvent {
  userId: string
  email?: string
  displayName?: string
  updatedFields: string[]
}
