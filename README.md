# Token Run

A runner game that lives inside Claude Code. The Claude mascot sprints across your
terminal, jumps cacti and grabs coins, because its tokens are draining and running
out ends the run.

Something to do while Claude is thinking.

```
 ◉  64 ▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱ tokens                    ☀ HI 02140  00873
                                ▂▄▆▆▄▂
            ▗▄▄▄▖
            ▐▛█▜▌         ●
            ▝▀▀▀▘                          ▗▄▖
     ▐▛███▜▌                               ▝▀▘
    ▝▜█████▛▘                   ▖█▗
▂▂▂▂▂▂▘▘▂▝▝▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂█▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂
```

## Install

In Claude Code:

```
/plugin marketplace add NipunBinjola/tokenrun
/plugin install tokenrun@tokenrun
```

Then type `/tokenrun`.

Token Run is a Claude Code *mod*: a plugin with a hooks module that draws its own
pane. It needs a Claude Code build with plugin hooks modules enabled.

## How to play

| Key | What it does |
| --- | --- |
| `SPACE` | start, jump, continue after a crash |
| `R` | on the continue screen: skip it and start a fresh run |
| `Esc` | close the game |

Keys reach the game while the pane is open and **your prompt is empty**, so typing a
message to Claude still works as normal. Clicking the game also gives it the keys.

### Tokens and coins

- A run starts with **100 tokens**, and they drain as you run (faster as the game speeds up).
- Coins refill them: small **2**, medium **5**, large **10**. Large coins only sit at the top
  of a full jump.
- Coins thin out the further you get, so late in a run every coin counts.
- Out of tokens ends the run. So does hitting a cactus.

### Continues

Crash into a cactus and you can **continue**: the first costs 25 tokens, the second 50,
and there is no third. A continue never takes you below the tokens you need to survive,
so it gets cheaper when you are low. You come back with a two-second shield.

## Settings

Under `/config`, Token Run has:

| Setting | Default |
| --- | --- |
| Small coin value | 2 |
| Medium coin value | 5 |
| Large coin value | 10 |
| Starting tokens | 100 |

## Notes

- Sounds play on macOS (through `afplay`); other systems play the game silently.
- The high score lasts while the plugin stays loaded.

## Develop

Load the plugin straight from this folder:

```
claude --plugin-dir /path/to/tokenrun
```

Check it with `claude plugin validate .` and run the tests with `claude plugin test .`.

## License

MIT
