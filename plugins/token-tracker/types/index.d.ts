export type RateLimitRow = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number | null
  rateLimits: RateLimitRow[]
  updatedAt: number
}
declare module 'claude-code' {
  interface PluginState {
    'token-tracker': { snapshot: Shaped<Snapshot | null> }
  }
}
