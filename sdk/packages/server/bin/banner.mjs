// The CLI's header: a short reveal animation, then the logo stays above everything the command prints.
// Static (no animation) when output isn't a terminal, in CI, or with SABLEYE_NO_BANNER=1; no colour with NO_COLOR.
const GLYPHS = {
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  Y: ['██╗   ██╗', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚██╔╝  ', '   ██║   ', '   ╚═╝   '],
}
export const ART = GLYPHS.S.map((_, row) => [...'SABLEYE'].map((c) => GLYPHS[c][row]).join(' '))

// Sableye's colours: violet body fading into its gem-cyan eyes (xterm-256 codes).
const RAMP = [57, 93, 99, 135, 141, 105, 111, 117, 123, 87]
const WIDTH = Math.max(...ART.map((l) => [...l].length))

/** One line of the logo, revealed up to column `upto`, with a bright edge at the reveal point. */
function paint(line, upto, color, edge) {
  let s = ''
  ;[...line].forEach((ch, i) => {
    if (i >= upto) return (s += ' ')
    if (!color || ch === ' ') return (s += ch)
    const code = edge && upto - i <= 2 ? 231 : RAMP[Math.floor((i / WIDTH) * RAMP.length)]
    s += `\x1b[38;5;${code}m${ch}`
  })
  return color ? `${s}\x1b[0m` : s
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Print the header. `animate: false` draws it at once. */
export async function banner({ version, tagline = 'USDT checkout on Whitechain', animate = true, out = process.stdout } = {}) {
  if (process.env.SABLEYE_NO_BANNER) return
  const tty = !!out.isTTY && !process.env.CI
  const color = tty && !process.env.NO_COLOR && (out.hasColors?.(256) ?? true)
  const dim = (s) => (color ? `\x1b[2m${s}\x1b[0m` : s)
  const sub = `  ${tagline}${version ? `  ·  v${version}` : ''}`
  if ((out.columns ?? 80) < WIDTH + 4) {
    out.write(`\n  ${color ? '\x1b[1;38;5;135m' : ''}SABLEYE${color ? '\x1b[0m' : ''}\n${dim(sub)}\n\n`)
    return
  }
  const draw = (upto, edge) => ART.map((l) => `  ${paint(l, upto, color, edge)}`).join('\n')
  if (!tty || !animate) {
    out.write(`\n${draw(WIDTH, false)}\n${dim(sub)}\n\n`)
    return
  }
  const show = () => out.write('\x1b[?25h')
  process.once('exit', show)
  out.write('\x1b[?25l\n')
  const frames = 18
  for (let f = 1; f <= frames; f++) {
    if (f > 1) out.write(`\x1b[${ART.length}A\r`)
    out.write(`${draw(Math.ceil((WIDTH * f) / frames), f < frames)}\n`)
    await sleep(f < frames ? 38 : 0)
  }
  // the tagline types in under the logo, then the logo stays as the header
  for (let i = 1; i <= sub.length; i += 3) {
    out.write(`\r${dim(sub.slice(0, i))}`)
    await sleep(8)
  }
  out.write(`\r${dim(sub)}\n\n`)
  show()
  process.removeListener('exit', show)
}
