export type Role = 'fetch' | 'research' | 'plan' | 'build' | 'check' | 'deliver'
/** est: estimated seconds for the step (optional) */
export type Step = { id: string; label: string; role: Role; est?: number }
export type Film = {
  slug: string
  title: string
  /** group label shown on the row (legacy: the video skill) */
  group?: string
  skill?: string
  /** generic workflow (v2) */
  workflow?: Step[]
  step?: string
  progress?: number
  done?: boolean
  /** start/end (ms) of each step id, written by office-status / the video repos */
  history?: Record<string, { start: number; end?: number }>
  /** legacy video status (v1) */
  stage?: 'idle' | 'inputs' | 'research' | 'plan' | 'render' | 'qa' | 'deliver' | 'done'
  render?: number
  plan?: number
  research?: number
  /** finish time estimated by the job itself (ms); shown smoothed */
  finishAt?: number
  /** last file the job touched (heartbeat) */
  activity?: string
  beat?: number
  /** last time Claude itself made a tool call in the cloud session */
  claudeAt?: number
  /** Claude's turn stopped on an API error (reported by the office plugin in the cloud); cleared when Claude acts again */
  claudeStop?: { reason: string; until: number | null; at: number }
  /** seconds Claude was stopped, per stage (left out of step times) */
  paused?: Record<string, number>
  /** seconds left in the current step */
  eta?: number | null
  blocked?: boolean
  approval?: boolean
  message?: string
  updated: number
  /** where it was read from: drive | local */
  source?: string
}
export type Poll = { at: number; error: string }
/** a job followed by this session */
export type Owned = { slug: string; title: string; skill?: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'van-phong-pixel': { films: Shaped<Film[]>; poll: Poll; focus: string; owned: Owned[]; others: Shaped<Film[]>; openOthers: boolean; paneOpen: boolean }
  }
}
