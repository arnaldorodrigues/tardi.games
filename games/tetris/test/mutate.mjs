// Breaks the rules on purpose and checks the suite notices.
//
// A green suite proves nothing until it has been seen to go red. Each mutation
// below is a plausible bug; if the suite still passes with one applied, the
// suite has a hole and the right response is a new assertion, not a shrug.
//
// This is how the wall-collision hole was found: removing the right-wall check
// was masked by board[y][x] reading undefined for an out-of-range column, so the
// bug only showed above the ceiling where that lookup is skipped. Nothing
// covered it until a mutation survived.
//
//   npm run test:mutate

import { check, readRules } from './rules.test.mjs'

const MUTATIONS = [
  {
    name: "clearLines: don't put an empty row back",
    from: '      board.unshift(emptyRow())',
    to: '      ',
  },
  {
    name: 'addGarbage: a fresh hole on every row',
    from: '    var row = []',
    to: '    hole = Math.floor(Math.random() * COLS); var row = []',
  },
  {
    name: 'collides: drop the right-wall check',
    from: 'if (cx < 0 || cx >= COLS) return true',
    to: 'if (cx < 0) return true',
  },
  {
    name: 'collides: drop the floor check',
    from: 'if (cy >= ROWS) return true',
    to: 'if (false) return true',
  },
  {
    name: 'createBag: deal without shuffling',
    from: '      for (var i = queue.length - 1; i > 0; i--) {',
    to: '      for (var i = -1; i > 0; i--) {',
  },
  {
    name: 'attack: pay out for a single row',
    from: 'var ATTACK = [0, 0, 1, 2, 4]',
    to: 'var ATTACK = [0, 1, 1, 2, 4]',
  },
  {
    name: 'gravity: never speed up',
    from: '  var ms = 800 - level * 65',
    to: '  var ms = 800',
  },
  {
    name: 'gravity: no floor, so it runs away',
    from: '  return ms < 120 ? 120 : ms',
    to: '  return ms',
  },
  {
    name: 'lock: ignore a top out',
    from: '      inside = false',
    to: '      inside = true',
  },
  {
    name: 'tryRotate: no wall kicks',
    from: 'var KICKS = [0, -1, 1, -2, 2]',
    to: 'var KICKS = [0]',
  },
  {
    name: 'dropDistance: always stop one short',
    from: '  while (!collides(board, piece, piece.cells, piece.x, piece.y + d + 1)) d++',
    to: '  while (!collides(board, piece, piece.cells, piece.x, piece.y + d + 1)) { d++; break }',
  },
]

const source = readRules()

// The suite has to be green to start with, or "it went red" means nothing.
const baseline = await check(source, { quiet: true })
if (baseline.failed > 0) {
  console.error('The suite is already failing on the real rules, so mutation')
  console.error('testing would be meaningless. Fix these first:')
  baseline.failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}
console.log('baseline: ' + baseline.passed + ' passed, 0 failed\n')

let survivors = 0

for (const m of MUTATIONS) {
  if (!source.includes(m.from)) {
    console.log('SKIP    ' + m.name)
    console.log('        target text is gone, so this mutation needs updating')
    survivors++ // an un-appliable mutation is a hole too: nothing was checked
    continue
  }

  const mutated = source.replace(m.from, m.to)
  const r = await check(mutated, { quiet: true })

  if (r.failed > 0) {
    console.log('caught  ' + m.name + '  (' + r.failed + ' failing)')
  } else {
    survivors++
    console.log('SURVIVED  ' + m.name)
    console.log('          the suite passed with this bug in place: add a test')
  }
}

console.log(
  '\n' + (MUTATIONS.length - survivors) + '/' + MUTATIONS.length + ' mutations caught'
)
process.exit(survivors === 0 ? 0 : 1)
