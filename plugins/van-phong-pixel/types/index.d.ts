export type Role = 'fetch' | 'research' | 'plan' | 'build' | 'check' | 'deliver'
export type Step = { id: string; label: string; role: Role }
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
  /** legacy video status (v1) */
  stage?: 'idle' | 'inputs' | 'research' | 'plan' | 'render' | 'qa' | 'deliver' | 'done'
  render?: number
  plan?: number
  research?: number
  eta?: number | null
  blocked?: boolean
  approval?: boolean
  message?: string
  updated: number
  /** where it was read from: drive | local */
  source?: string
}
export type Poll = { at: number; error: string }

declare module 'claude-code' {
  interface PluginState {
    'van-phong-pixel': { films: Shaped<Film[]>; poll: Poll; focus: string }
  }
}
