// Surface module: the game loop, drawing and keys run here, on the drawing thread.
type Kind =
  | 'sky' | 'cloud' | 'star' | 'ground' | 'dirt' | 'dust' | 'shadow'
  | 'mascot' | 'dead' | 'cactus' | 'coin' | 'face' | 'popup' | 'text'
type Cell = { ch: string; kind: Kind }
type Obstacle = { x: number; w: number; h: number; art: string[] } // art: top row first
type Phase = 'ready' | 'running' | 'continue' | 'over'
type Cloud = { x: number; row: number; art: string }
type Puff = { x: number; lift: number; age: number }
type Size = 'small' | 'medium' | 'large'
type Coin = { x: number; lift: number; size: Size }
type Popup = { x: number; lift: number; text: string; age: number }
export type Props = {
  presses: number
  restarts: number // R presses that skip a continue and start a fresh run
  values: Record<Size, number> // tokens each coin size is worth
  startTokens: number
}

let W = 60 // columns: the pane's width, read from the region each draw
const H = 12 // rows above the dirt: room for the high coins
const MC = 4 // mascot's left column
const TICK_MS = 40
const RESTART_DELAY = 20 // ticks (0.8s) after a crash before SPACE does anything
const CONTINUE_COSTS = [25, 50] // tokens for the first and second continue; no third
const SHIELD = 50 // ticks (2s) a continued mascot passes through cacti
const V0 = 0.95 // takeoff speed, rows per tick
const GRAVITY = 0.065
const DRAIN = 0.08 // tokens lost per tick at the starting speed (2 a second)
const ORANGE = 'rgb(215,119,87)'
const GREEN = 'rgb(107,170,117)'
const DEAD = 'rgb(160,90,90)'
const SAND = 'rgb(150,125,100)'
const DUST = 'rgb(190,165,140)'
const GOLD = 'rgb(240,140,50)'
const LOW = 'rgb(220,80,70)'
const GROUND = '▂▂▂▂▂▃▂▂▂▂▂▂▄▂▂▂▂▂▂▂▃▂▂▂▂▂▂▂▂▄▂▂'
const DIRT = '  ·   .    ˙  ·     .   ˙    ·  .     ˙   · '

// Claude's mascot: three rows, nine columns. Its feet swap as it runs.
const BODY = [' ▐▛███▜▌ ', '▝▜█████▛▘']
const FEET = ['  ▘▘ ▝▝  ', '  ▝▝ ▘▘  ']
const TUCK = '  ▝▀▀▀▘  ' // legs tucked while rising
const REACH = '  ▘   ▝  ' // legs stretched down while falling
const SQUASH = ' ▝▜▀▀▀▛▘ ' // legs bunched on the landing frame

const SMALL: Obstacle = { x: 0, w: 3, h: 2, art: ['▖█▗', ' █ '] }
const DOUBLE: Obstacle = { x: 0, w: 7, h: 2, art: ['▖█▗ ▖█▗', ' █   █ '] }
const BIG: Obstacle = { x: 0, w: 5, h: 3, art: ['  █  ', '▐▌█▐▌', ' ▀█▀ '] }

// Claude tokens: an orange rim around a dark face with the mascot's eyes.
// Each row's mask marks 'f' for face cells (orange on black), the rest rim.
const COIN: Record<Size, { w: number; h: number; art: string[][]; mask: string[] }> = {
  small: { w: 1, h: 1, art: [['●'], ['◐'], ['│'], ['◑']], mask: [' '] }, // spins
  medium: { w: 3, h: 2, art: [['▗▄▖', '▝▀▘']], mask: ['   ', '   '] },
  large: { w: 5, h: 3, art: [['▗▄▄▄▖', '▐▛█▜▌', '▝▀▀▀▘']], mask: ['     ', ' fff ', '     '] },
}
const COIN_LIFTS: Record<Size, number[]> = {
  small: [0, 1, 2, 3, 4], // some can be run into
  medium: [2, 3, 4, 5],
  large: [4, 5, 6], // only a full jump reaches these
}

const g = {
  phase: 'ready' as Phase,
  y: 0, // rows above the ground, fractional
  vy: 0,
  wasAir: false,
  ticks: 0,
  score: 0,
  best: 0,
  gap: 30, // columns until the next obstacle spawns
  cacti: [] as Obstacle[],
  clouds: [] as Cloud[],
  puffs: [] as Puff[],
  squash: 0, // frames of landing squash left
  sound: 0, // counts sounds posted to the hooks module
  tokens: 100,
  maxTokens: 100,
  values: { small: 2, medium: 5, large: 10 } as Record<Size, number>,
  coins: [] as Coin[],
  coinGap: 20,
  popups: [] as Popup[],
  reason: 'crash' as 'crash' | 'tokens',
  overAt: 0, // tick of the last crash
  isNewBest: false,
  continues: 0, // continues used this run
  shieldUntil: 0, // tick until which cacti cannot hurt
}

const reset = () => {
  g.phase = 'ready'
  g.y = 0
  g.vy = 0
  g.wasAir = false
  g.ticks = 0
  g.score = 0
  g.gap = 30
  g.cacti = []
  g.puffs = []
  g.squash = 0
  g.tokens = g.maxTokens
  g.coins = []
  g.coinGap = 20
  g.popups = []
  g.continues = 0
  g.shieldUntil = 0
  g.clouds = [
    { x: 12, row: 1, art: '▂▄▆▆▄▂' },
    { x: 38, row: 3, art: '▂▄▄▂' },
    { x: 55, row: 0, art: '▂▄▆▆▆▄▂' },
  ]
}

const speed = () => 1 + Math.min(0.5, g.score / 2000)

// Day turns to night every 700 points, as in Chrome's game.
const isNight = () => Math.floor(g.score / 700) % 2 === 1

// Sounds and the phase reach the hooks module in one post per frame (a later post in a
// frame replaces an undelivered one), sent by flush() after each tick and key.
let post: ((data: { sound?: string; n: number; phase: Phase }) => void) | undefined
let pendingSound: string | undefined
let postedPhase: Phase | undefined
const play = (sound: string) => {
  pendingSound = sound
}
const flush = () => {
  if (pendingSound === undefined && g.phase === postedPhase) return
  g.sound += 1
  post?.({ sound: pendingSound, n: g.sound, phase: g.phase })
  pendingSound = undefined
  postedPhase = g.phase
}

// R on the continue screen: bank the score, then start a fresh run at once.
const restart = () => {
  if (g.phase !== 'continue' || g.ticks - g.overAt < RESTART_DELAY) return
  end('crash', true)
  reset()
  g.phase = 'running'
}

const end = (reason: 'crash' | 'tokens', isSilent = false) => {
  if (g.phase !== 'continue') g.overAt = g.ticks
  g.phase = 'over'
  g.reason = reason
  g.isNewBest = Math.floor(g.score) > g.best
  g.best = Math.max(g.best, Math.floor(g.score))
  if (!isSilent) play('womp')
}

// The tokens a continued run needs to stay alive: the shield's run plus the way to the
// next two coins at today's spacing and speed. It grows as coins thin out.
const survivalFloor = () => Math.ceil(DRAIN * (SHIELD * speed() + 2 * coinSpacing()))

// What the next continue costs: its list price, cut so that paying never leaves the
// player below the survival floor. A player already below the floor continues free.
const nextContinue = () => {
  const price = CONTINUE_COSTS[g.continues]
  if (price === undefined) return { cost: 0, isAvailable: false }
  const cost = Math.max(0, Math.min(price, Math.floor(g.tokens) - survivalFloor()))
  return { cost, isAvailable: true }
}

const crash = () => {
  g.overAt = g.ticks
  play('womp')
  if (nextContinue().isAvailable) g.phase = 'continue'
  else end('crash', true)
}

const takeContinue = () => {
  const { cost } = nextContinue()
  g.tokens -= cost
  g.continues += 1
  g.phase = 'running'
  g.y = 0
  g.vy = 0
  g.shieldUntil = g.ticks + SHIELD
  // Clear the cacti right around the mascot so the run restarts on open ground.
  g.cacti = g.cacti.filter(c => c.x > MC + 24)
  if (cost > 0) g.popups.push({ x: MC + 10, lift: 3, text: `-${cost}`, age: 0 })
  play('boing')
}

// Tokens drain DRAIN per column run, whatever the speed, and an average coin is worth
// about 4 (55% small, 30% medium, 15% large), so a coin every ~51 columns breaks even.
// The spacing starts a little richer than that and grows past it: early on a missed coin
// hurts, later even a perfect run slowly loses tokens, so every coin counts.
const coinSpacing = () => 40 + Math.min(30, g.score / 70)

const spawnCoin = () => {
  const roll = Math.random()
  const size: Size = roll < 0.55 ? 'small' : roll < 0.85 ? 'medium' : 'large'
  const lifts = COIN_LIFTS[size]
  g.coins.push({ x: W, lift: lifts[Math.floor(Math.random() * lifts.length)], size })
}

const jump = () => {
  if (g.y === 0) {
    g.vy = V0
    g.squash = 0
    play('boing')
  }
}

const tick = () => {
  g.ticks += 1
  g.clouds = g.clouds.map(c => ({ ...c, x: c.x - (g.phase === 'running' ? 0.25 : 0.1) }))
  for (const c of g.clouds) if (c.x < -8) c.x = W + Math.random() * 20
  if (g.phase !== 'running') return

  const v = speed()
  g.score += v * 0.5

  if (g.y > 0 || g.vy > 0) {
    g.y = Math.max(0, g.y + g.vy)
    g.vy = g.y === 0 ? 0 : g.vy - GRAVITY
  }
  const isAir = g.y > 0
  if (g.wasAir && !isAir) {
    g.squash = 3
    g.puffs.push({ x: MC + 1, lift: 0, age: 0 }, { x: MC + 7, lift: 0, age: 0 })
  }
  if (!isAir && g.ticks % 5 === 0) g.puffs.push({ x: MC + 1, lift: 0, age: 0 })
  g.wasAir = isAir
  g.squash = Math.max(0, g.squash - 1)
  g.puffs = g.puffs.map(p => ({ ...p, x: p.x - v, age: p.age + 1 })).filter(p => p.age < 7)

  g.cacti = g.cacti.map(c => ({ ...c, x: c.x - v })).filter(c => c.x > -8)
  g.gap -= v
  if (g.gap <= 0) {
    const roll = Math.random()
    const kind = roll < 0.25 ? DOUBLE : roll < 0.5 ? BIG : SMALL
    g.cacti.push({ ...kind, x: W })
    g.gap = 26 + Math.random() * 30 + v * 8
  }

  g.coins = g.coins.map(c => ({ ...c, x: c.x - v })).filter(c => c.x > -6)
  g.coinGap -= v
  if (g.coinGap <= 0) {
    spawnCoin()
    g.coinGap = coinSpacing() * (0.75 + Math.random() * 0.5)
  }
  g.popups = g.popups.map(p => ({ ...p, x: p.x - v * 0.5, age: p.age + 1 })).filter(p => p.age < 14)

  // Tokens drain faster as the run speeds up.
  g.tokens = Math.max(0, g.tokens - DRAIN * v)

  const lift = Math.round(g.y)

  // A coin touching the mascot's whole sprite (nine columns, three rows) is collected.
  g.coins = g.coins.filter(c => {
    const { w, h } = COIN[c.size]
    const isTouching = c.x < MC + 9 && c.x + w > MC && c.lift < lift + 3 && c.lift + h > lift
    if (!isTouching) return true
    const value = g.values[c.size]
    g.tokens = Math.min(g.maxTokens, g.tokens + value)
    g.popups.push({ x: c.x, lift: c.lift + h, text: `+${value}`, age: 0 })
    play('coin')
    return false
  })

  // Hitbox: the mascot's body (seven columns) against each obstacle's width and height.
  if (g.ticks >= g.shieldUntil) {
    for (const c of g.cacti) {
      const isOverlapping = c.x < MC + 8 && c.x + c.w > MC + 1
      if (isOverlapping && lift < c.h) return crash()
    }
  }
  if (g.tokens <= 0) end('tokens')
}

const press = () => {
  if (g.phase === 'ready') g.phase = 'running'
  else if (g.phase === 'continue' || g.phase === 'over') {
    // A panicked double-tap at the crash must not spend tokens or restart the run.
    if (g.ticks - g.overAt < RESTART_DELAY) return
    if (g.phase === 'continue') return takeContinue()
    reset()
    g.phase = 'running'
  }
  jump()
}

const draw = (): Cell[][] => {
  const night = isNight()
  // The ground line is drawn in the feet row, bottom-aligned, so feet and cacti stand on it;
  // the dirt speckles sit one row below.
  const G = H - 1
  const rows: Cell[][] = Array.from({ length: H + 1 }, (_, r) =>
    Array.from({ length: W }, (): Cell => ({ ch: ' ', kind: r === G ? 'ground' : r === H ? 'dirt' : 'sky' })),
  )

  const set = (row: number, col: number, ch: string, kind: Kind) => {
    const x = Math.round(col)
    if (row >= 0 && row < H + 1 && x >= 0 && x < W && ch !== ' ') rows[row][x] = { ch, kind }
  }
  const put = (col: number, lift: number, line: number, ch: string, kind: Kind) =>
    set(H - 1 - lift - line, col, ch, kind)

  // Night sky: fixed stars; the clouds fade into it.
  if (night) {
    for (let i = 0; i < 14; i++) set((i * 5) % (H - 2), (i * 17 + 7) % W, i % 3 === 0 ? '✦' : '·', 'star')
  }
  for (const c of g.clouds) for (let i = 0; i < c.art.length; i++) set(c.row, c.x + i, c.art[i], 'cloud')

  // The ground scrolls with the distance run; the dirt below it scrolls slower.
  const shift = Math.floor(g.ticks * speed())
  for (let c = 0; c < W; c++) {
    rows[G][c] = { ch: GROUND[(c + shift) % GROUND.length], kind: 'ground' }
    const d = DIRT[(c + Math.floor(shift / 2)) % DIRT.length]
    if (d !== ' ') rows[H][c] = { ch: d, kind: 'dirt' }
  }

  const lift = Math.round(g.y)
  const isDead = g.phase === 'over' || g.phase === 'continue'
  // A shielded mascot blinks until the shield runs out.
  const isBlinkedOut = g.phase === 'running' && g.ticks < g.shieldUntil && Math.floor(g.ticks / 3) % 2 === 1

  // A shadow on the ground that shrinks as the mascot rises.
  if (!isDead) {
    const shadow = lift < 3 ? '▄▄▄▄▄▄▄' : lift < 5 ? '▄▄▄▄▄' : '▄▄▄'
    const from = MC + 1 + Math.floor((7 - shadow.length) / 2)
    if (lift > 0) for (let i = 0; i < shadow.length; i++) set(G, from + i, shadow[i], 'shadow')
  }

  for (const p of g.puffs) set(H - 1 - p.lift - Math.floor(p.age / 4), p.x, p.age < 3 ? '▒' : p.age < 5 ? '░' : '·', 'dust')

  const feet = isDead
    ? '  ▘▘ ▝▝  '
    : g.squash > 0
      ? SQUASH
      : lift > 0
        ? g.vy > 0
          ? TUCK
          : REACH
        : g.phase === 'ready'
          ? FEET[0]
          : FEET[Math.floor(g.ticks / 3) % 2]
  const kind: Kind = isDead ? 'dead' : 'mascot'
  for (let i = 0; i < 9 && !isBlinkedOut; i++) {
    put(MC + i, lift, 2, BODY[0][i], kind)
    put(MC + i, lift, 1, BODY[1][i], kind)
    put(MC + i, lift, 0, feet[i], kind)
  }
  if (isDead) {
    put(MC + 2, lift, 3, '✦', 'dead')
    put(MC + 6, lift, 4, '✧', 'dead')
  }

  for (const c of g.coins) {
    const coin = COIN[c.size]
    const art = coin.art[Math.floor(g.ticks / 4) % coin.art.length]
    for (let line = 0; line < coin.h; line++) {
      const row = art[coin.h - 1 - line]
      const mask = coin.mask[coin.h - 1 - line]
      for (let i = 0; i < coin.w; i++) put(c.x + i, c.lift, line, row[i], mask[i] === 'f' ? 'face' : 'coin')
    }
  }

  for (const c of g.cacti) {
    for (let line = 0; line < c.h; line++) {
      const art = c.art[c.h - 1 - line]
      for (let i = 0; i < c.w; i++) put(c.x + i, 0, line, art[i], 'cactus')
    }
  }

  for (const p of g.popups) {
    for (let i = 0; i < p.text.length; i++) put(p.x + i, p.lift + Math.floor(p.age / 3), 0, p.text[i], 'popup')
  }

  const say = (row: number, text: string) => {
    const start = Math.floor((W - text.length) / 2)
    // Spaces count here, so a box blanks the clouds behind it.
    for (let i = 0; i < text.length; i++) rows[row][start + i] = { ch: text[i], kind: 'text' }
  }
  // A box of centred lines, 28 columns inside.
  const box = (top: number, lines: string[]) => {
    const inner = 28
    say(top, `╭${'─'.repeat(inner)}╮`)
    lines.forEach((line, i) => {
      const left = Math.floor((inner - line.length) / 2)
      say(top + 1 + i, `│${' '.repeat(left)}${line}${' '.repeat(inner - line.length - left)}│`)
    })
    say(top + 1 + lines.length, `╰${'─'.repeat(inner)}╯`)
  }
  const pad = (n: number) => String(n).padStart(5, '0')
  if (g.phase === 'ready') {
    box(1, [
      'press SPACE to start',
      'grab coins to refill  ◉',
      '',
      `HI ${pad(g.best)}`,
    ])
  }
  const isWaiting = g.ticks - g.overAt < RESTART_DELAY
  if (g.phase === 'continue') {
    const { cost } = nextContinue()
    box(1, [
      'C O N T I N U E ?',
      '',
      cost > 0 ? `costs ${cost} ◉   you have ${Math.floor(g.tokens)}` : 'this one is on the house ◉',
      isWaiting ? '' : 'SPACE continue · R restart',
    ])
  }
  if (g.phase === 'over') {
    const used = g.continues === 0 ? '' : g.continues === 1 ? ' (1 continue)' : ` (${g.continues} continues)`
    box(1, [
      g.reason === 'tokens' ? 'OUT OF TOKENS  ◉' : 'G A M E   O V E R',
      '',
      `SCORE ${pad(Math.floor(g.score))}${used}`,
      `HI ${pad(g.best)}`,
      g.isNewBest
        ? '★ NEW HIGH SCORE ★'
        : '',
      isWaiting ? '' : 'SPACE to run again',
    ])
  }

  return rows
}

let seen = 0 // the hooks module's press count last acted on
let seenRestarts = 0

export default function TokenRun(props: Props, surface: ClientSurface<{ n: number }>) {
  g.values = props.values ?? g.values
  g.maxTokens = props.startTokens ?? g.maxTokens
  if (surface.state === undefined) {
    reset()
    seen = props.presses
    seenRestarts = props.restarts ?? 0
    postedPhase = undefined
    post = data => surface.post(data)
    surface.every(TICK_MS, () => {
      tick()
      flush()
      surface.setState({ n: (surface.state?.n ?? 0) + 1 })
    })
    surface.onKey(({ key, ctrl, meta }) => {
      if (ctrl || meta) return
      if (key === 'r') restart()
      else if (key === ' ' || key === 'space' || key === 'up' || key === 'return') press()
      else return
      flush()
      surface.setState({ n: (surface.state?.n ?? 0) + 1 })
    })
    surface.setState({ n: 0 })
  }

  // Space typed in the prompt reaches the hooks module, which counts it into the props.
  if (props.presses !== seen) {
    seen = props.presses
    press()
    flush()
  }
  if ((props.restarts ?? 0) !== seenRestarts) {
    seenRestarts = props.restarts ?? 0
    restart()
    flush()
  }

  // Use the pane's full width (kept in a sane range; the region is 100% wide).
  if (surface.columns > 0) W = Math.min(240, Math.max(40, surface.columns))

  const { Box, Text } = surface.elements
  const night = isNight()
  const COLORS: Partial<Record<Kind, string>> = {
    mascot: ORANGE,
    dead: DEAD,
    cactus: GREEN,
    ground: SAND,
    dirt: SAND,
    dust: DUST,
    coin: GOLD,
    face: GOLD,
    popup: GOLD,
  }
  const color = (k: Kind) => COLORS[k]
  const score = String(Math.floor(g.score)).padStart(5, '0')
  const best = String(g.best).padStart(5, '0')
  const METER = 20
  const filled = Math.max(0, Math.min(METER, Math.round((g.tokens / Math.max(1, g.maxTokens)) * METER)))
  const isLow = g.tokens < g.maxTokens * 0.2
  const blink = Math.floor(g.ticks / 6) % 2 === 0

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" width={W}>
        <Box>
          <Text color={isLow && blink ? LOW : GOLD} bold>
            ◉ {String(Math.floor(g.tokens)).padStart(3, ' ')}{' '}
          </Text>
          <Text color={isLow ? LOW : GOLD}>{'▰'.repeat(filled)}</Text>
          <Text dimColor>{'▱'.repeat(METER - filled)}</Text>
          <Text dimColor> tokens</Text>
        </Box>
        <Box>
          <Text dimColor>{night ? '☾ ' : '☀ '}</Text>
          <Text dimColor>HI {best}  </Text>
          <Text bold>{score}</Text>
        </Box>
      </Box>
      {draw().map((cells, r) => {
        const runs: { kind: Kind; text: string }[] = []
        for (const c of cells) {
          const last = runs[runs.length - 1]
          if (last && last.kind === c.kind) last.text += c.ch
          else runs.push({ kind: c.kind, text: c.ch })
        }

        return (
          <Box key={`r${r}`}>
            {runs.map((run, i) => (
              <Text
                key={`c${i}`}
                color={color(run.kind)}
                backgroundColor={run.kind === 'face' ? 'black' : undefined}
                dimColor={run.kind === 'cloud' || run.kind === 'star' || run.kind === 'shadow' || run.kind === 'dirt'}
                bold={run.kind === 'text' || run.kind === 'popup'}
              >
                {run.text}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
