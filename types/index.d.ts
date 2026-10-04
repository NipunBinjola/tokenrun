export type Presses = number

declare module 'claude-code' {
  interface PluginState {
    'tokenrun': { isOpen: boolean; presses: Presses; restarts: Presses }
  }
}
