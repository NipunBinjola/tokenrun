import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'tokenrun'
const isOpen = atom({ plugin: 'tokenrun', key: 'isOpen' } as const, false)
const presses = atom({ plugin: 'tokenrun', key: 'presses' } as const, 0)
const restarts = atom({ plugin: 'tokenrun', key: 'restarts' } as const, 0)

// Tokens each coin size refills, and the tokens a run starts with (also the meter's cap).
const values = { small: 2, medium: 5, large: 10 }
const startTokens = 100

export const register: Register = on => {
  // Whether the game is asking to continue: only then does R in the prompt belong to it.
  let isAsking = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tokenrun',
      description: 'Token Run: jump cacti and grab coins before your tokens run out (space jumps, esc closes)',
    })

    return next(e)
  })

  on('command.run', { command: 'tokenrun' }, async $ => {
    await update($, isOpen, () => true)
    await $.ui.open({ id: PANE, title: 'Token Run', closeOnEscape: true, rows: 17 })

    return { text: 'Token Run: SPACE (with an empty prompt) jumps, Esc closes.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, isOpen, () => false)
    isAsking = false

    return next(e)
  })

  // While the pane is open, a Space typed into an empty prompt plays the game instead.
  on('prompt.edit', async ($, e, next) => {
    const isSpace = e.key?.key === 'space' || e.key?.key === ' '
    if (isSpace && e.text === '' && (await read($, isOpen))) {
      await update($, presses, n => n + 1)

      return { text: e.text, cursor: e.cursor }
    }
    const isR = e.key?.key === 'r' || e.key?.key === 'R'
    if (isR && isAsking && e.text === '' && (await read($, isOpen))) {
      await update($, restarts, n => n + 1)

      return { text: e.text, cursor: e.cursor }
    }

    return next(e)
  })

  // The game posts a sound name each time the mascot jumps or crashes.
  on('ui.message', async ($, e) => {
    const data = e.data as { sound?: string; phase?: string } | null
    if (data?.phase !== undefined) isAsking = data.phase === 'continue'
    const sound = data?.sound
    if (sound === 'boing' || sound === 'womp' || sound === 'coin') {
      // The jump is the sound heard most, so it is the quiet one.
      const gain = sound === 'womp' ? 0.5 : 0.25
      await $.audio.play({ asset: `sounds/${sound}.wav` }, { shouldLoop: false, gain } as never).catch(() => undefined)
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Client } = $.ui.resolve(e)
    const count = await read($, presses)
    const restartCount = await read($, restarts)

    return (
      <Box flexDirection="column">
        <Client key="game" module="./game.tsx" width="100%" props={{ presses: count, restarts: restartCount, values, startTokens }} />
        <Text dimColor>SPACE jump (empty prompt) · Esc close</Text>
      </Box>
    )
  })
}
