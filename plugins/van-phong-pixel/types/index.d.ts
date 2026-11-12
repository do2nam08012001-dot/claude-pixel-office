export type Film = {
  slug: string
  skill: string
  title: string
  stage: 'idle' | 'inputs' | 'research' | 'plan' | 'render' | 'qa' | 'deliver' | 'done'
  render?: number
  plan?: number
  research?: number
  eta?: number | null
  blocked?: boolean
  approval?: boolean
  message?: string
  updated: number
}
export type Poll = { at: number; error: string }

declare module 'claude-code' {
  interface PluginState {
    'van-phong-pixel': { films: Shaped<Film[]>; poll: Poll; focus: string }
  }
}
