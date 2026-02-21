/**
 * Fact-check report types (Phase 2).
 */

export type VerdictType = 'true' | 'false' | 'misleading' | 'unverified' | 'satire'

export interface Claim {
  text: string
  confidence: number
  sources: string[]
}

export interface DebateArtifact {
  agent_pro: string
  agent_con: string
  judge_verdict: string
  judge_confidence: number
  sources: string[]
  created_at: string
}

export interface Report {
  id: string
  url?: string
  text?: string
  verdict: VerdictType
  confidence: number
  summary: string
  claims: Claim[]
  debate: DebateArtifact
  category?: string
  created_at: string
  updated_at: string
  user_id?: string
  feedback_count: number
}

export interface CreateReportRequest {
  url?: string
  text?: string
  // Phase 5: attachments (image/audio/video file IDs)
  attachment_ids?: string[]
}
