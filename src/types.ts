export type UserRole = 'admin' | 'user'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export type SessionMode = 'free' | 'tutor'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  status: UserStatus
}

export interface AccessRequest {
  id: string
  status: UserStatus
  created_at: string
  resolved_at: string | null
  user: { id: string; email: string; display_name: string | null } | null
  resolver: { id: string; email: string } | null
}
