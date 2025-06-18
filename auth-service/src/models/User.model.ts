import mongoose, { Schema, Document } from 'mongoose'
import bcrypt from 'bcrypt'

export interface IUser extends Document {
  displayName: string
  email?: string
  password?: string
  googleId?: string
  isEmailVerified: boolean
  refreshTokens: Array<{ token: string; expires: Date; ipAddress?: string }>
  comparePassword(candidatePassword: string): Promise<boolean>
}
const RefreshTokenSchema = new Schema({
  token: { type: String, required: true },
  expires: { type: Date, required: true },
  //   ipAddress: { type: String }, // Optional: for added security
})

const UserSchema: Schema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true }, // sparse allows for unique constraint to be ignored if the field is not present
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    isEmailVerified: { type: Boolean, default: false },
    refreshTokens: [RefreshTokenSchema],
  },
  { timestamps: true }
)

UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next()
  }
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false
  return bcrypt.compare(candidatePassword, this.password)
}

export const User = mongoose.model<IUser>('User', UserSchema)

export default User
