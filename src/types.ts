export type UserRole = 'admin' | 'user'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export type SessionMode = 'free' | 'tutor'
export type SessionStatus = 'active' | 'completed' | 'interrupted'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  status: UserStatus
  recording_consent_at: string | null
}

export interface AccessRequest {
  id: string
  status: UserStatus
  created_at: string
  resolved_at: string | null
  user: { id: string; email: string; display_name: string | null } | null
  resolver: { id: string; email: string } | null
}

export interface SessionSummary {
  id: string
  title: string | null
  mode: SessionMode
  status: SessionStatus
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  has_audio: boolean
  audio_mime: string | null
  summary: unknown
  created_at: string
}

export interface SessionTurn {
  turn_index: number
  sender: 'user' | 'assistant'
  content: string
  created_at: string
}
