/**
 * Deepfake detection types (Phase 5).
 */

export interface ModelScores {
  baseline: number     // CNN/autoencoder or SVM score
  hf_model?: number    // HuggingFace model score (image only)
  vlm: number          // Gemini VLM score
}

export interface DeepfakeImageResult {
  is_deepfake: boolean
  confidence: number      // Combined score 0–1
  model_scores: ModelScores
  reasoning: string       // Gemini's explanation
  faces_detected: number
}

export interface DeepfakeAudioResult {
  is_synthetic: boolean
  confidence: number
  model_scores: Pick<ModelScores, 'baseline' | 'vlm'>
  reasoning: string
  duration_seconds?: number
}

export interface DeepfakeVideoResult {
  is_deepfake: boolean
  confidence: number
  model_scores: ModelScores
  reasoning: string
  frames_analyzed: number
  flagged_frames: number
}

export interface ScamCheckResult {
  is_scam: boolean
  confidence: number
  model_scores: {
    roberta: number
    xgboost: number
  }
  scam_type?: string   // 'phishing' | 'advance_fee' | 'impersonation' | etc.
  reasoning: string
}
