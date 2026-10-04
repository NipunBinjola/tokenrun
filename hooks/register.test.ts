import { expect, test } from 'claude-code/testing'

test('space starts the game and the mascot runs', async $ => {
  const ui = await $.ui.mount({
    plugin: 'tokenrun',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tokenrun',
    props: {} as never,
  })

  expect(await ui.find({ type: 'Text', text: /press SPACE to start/, in: 'game' })).toBeDefined()
  await ui.key({ key: ' ', in: 'game' })
  await ui.advance(200)
  expect(await ui.find({ type: 'Text', text: /press SPACE to start/, in: 'game' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /▝▜█████▛▘/, in: 'game' })).toBeDefined()
  await ui.unmount()
})

test('the mascot hits a cactus it does not jump', async $ => {
  const ui = await $.ui.mount({
    plugin: 'tokenrun',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tokenrun',
    props: {} as never,
  })

  await ui.key({ key: ' ', in: 'game' })
  await ui.advance(20000)
  expect(await ui.find({ type: 'Text', text: /G A M E/, in: 'game' })).toBeDefined()
  await ui.key({ key: ' ', in: 'game' })
  expect(await ui.find({ type: 'Text', text: /G A M E/, in: 'game' })).toBeUndefined()
  await ui.unmount()
})

test('space in an empty prompt is consumed while the pane is open', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tokenrun' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  await $.command.run({ command: 'tokenrun' } as never)
  const kept = await $.prompt.edit({
    origin: { kind: 'composer' },
    key: { key: 'space' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: ' ',
  })
  expect(kept.text).toBe('')
})

test('a space caught in the prompt starts the game in the pane', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tokenrun' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const ui = await $.ui.mount({
    plugin: 'tokenrun',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tokenrun',
    props: {} as never,
  })
  await $.command.run({ command: 'tokenrun' } as never)
  expect(await ui.find({ type: 'Text', text: /press SPACE to start/, in: 'game' })).toBeDefined()
  await $.prompt.edit({
    origin: { kind: 'composer' },
    key: { key: 'space' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: ' ',
  })
  await ui.advance(200)
  expect(await ui.find({ type: 'Text', text: /press SPACE to start/, in: 'game' })).toBeUndefined()
  await ui.unmount()
})

test('the mascot boings on a jump and womps on a crash', async ($, on) => {
  const played: string[] = []
  on('audio.play', (_, e) => {
    played.push(JSON.stringify(e))

    return { value: undefined } as never
  })
  const ui = await $.ui.mount({
    plugin: 'tokenrun',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tokenrun',
    props: {} as never,
  })
  await ui.key({ key: ' ', in: 'game' })
  await ui.advance(100)
  expect(played.join()).toContain('sounds/boing.wav')
  await ui.advance(30000)
  expect(played.join()).toContain('sounds/womp.wav')
  await ui.unmount()
})

test('a space right after a crash does not spend a continue', async $ => {
  const ui = await $.ui.mount({
    plugin: 'tokenrun',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tokenrun',
    props: {} as never,
  })
  const offer = () => ui.find({ type: 'Text', text: /C O N T I N U E/, in: 'game' })
  await ui.key({ key: ' ', in: 'game' })
  // Run without jumping until a cactus ends it, one tick at a time.
  for (let i = 0; i < 2000 && !(await offer()); i++) await ui.advance(40)
  expect(await offer()).toBeDefined()
  await ui.key({ key: ' ', in: 'game' })
  expect(await offer()).toBeDefined()
  await ui.advance(1000)
  await ui.key({ key: ' ', in: 'game' })
  expect(await offer()).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /G A M E/, in: 'game' })).toBeUndefined()
  await ui.unmount()
})

test('the continue waits, and R starts a fresh run', async $ => {
  const ui = await $.ui.mount({
    plugin: 'tokenrun',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tokenrun',
    props: {} as never,
  })
  const offer = () => ui.find({ type: 'Text', text: /C O N T I N U E/, in: 'game' })
  await ui.key({ key: ' ', in: 'game' })
  for (let i = 0; i < 2000 && !(await offer()); i++) await ui.advance(40)
  await ui.advance(10000)
  expect(await offer()).toBeDefined()
  await ui.key({ key: 'r', in: 'game' })
  expect(await offer()).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /G A M E/, in: 'game' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /▝▜█████▛▘/, in: 'game' })).toBeDefined()
  await ui.unmount()
})
