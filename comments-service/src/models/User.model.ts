import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  _id: string
  displayName: string
  email?: string
  googleId?: string
}

const UserSchema: Schema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true }, // sparse allows for unique constraint to be ignored if the field is not present
    googleId: { type: String, unique: true, sparse: true },
  },
  { _id: false, timestamps: true }
)

export const User = mongoose.model<IUser>('User', UserSchema)
export default User
