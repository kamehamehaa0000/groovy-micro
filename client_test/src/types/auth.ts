export type UserRole = "LISTENER" | "ARTIST" | "ADMIN";

export interface UserSubscription {
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionFeatures {
  max_bitrate_kbps: number;
  lossless: boolean;
  ad_free: boolean;
  can_host_jam: boolean;
  max_jam_participants: number;
  [key: string]: any;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  isEmailVerified: boolean;
  createdAt: string;
  subscription: UserSubscription;
  plan: {
    name: string;
    features: SubscriptionFeatures;
  };
}

export interface AuthSuccessResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    avatarUrl: string | null;
    isEmailVerified: boolean;
  };
  accessToken: string;
}
