// Headless checks of the tetris rules module. No DOM and no platform: the rules
// are pure, so they can be proven on their own.
//
//   npm test           run the suite
//   npm run test:mutate  break the rules on purpose and prove the suite notices
//
// The source is loaded as a data: URL rather than imported, for two reasons.
// tetris-rules.js is ESM inside a package with no "type": "module", so a plain
// import of it fails; and loading from a string is what lets the mutation run
// swap in a deliberately broken copy without touching the file on disk.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const RULES_PATH = join(HERE, '..', 'src', 'shared', 'tetris-rules.js')

export function readRules() {
  return readFileSync(RULES_PATH, 'utf8')
}

export async function load(source) {
  // tetris-rules.js imports nothing, so it stands alone as a module.
  return import('data:text/javascript,' + encodeURIComponent(source))
}

let passed = 0
let failed = 0
const failures = []
let quiet = process.argv.includes('--quiet')

function test(name, fn) {
  try {
    fn()
    passed++
    if (!quiet) console.log('  ok   ' + name)
  } catch (err) {
    failed++
    failures.push(name)
    if (!quiet) console.log('  FAIL ' + name + '\n       ' + err.message.split('\n')[0])
  }
}

// Every assertion below runs against whatever module `R` is: the real rules, or
// a mutated copy when the mutation run calls check().
export async function check(source, options) {
  passed = 0
  failed = 0
  failures.length = 0
  quiet = (options && options.quiet) || process.argv.includes('--quiet')
  const R = await load(source)
  body(R)
  return { passed, failed, failures: failures.slice() }
}

function body(R) {

  // Builds a board from rows of '.' and '#'; bottom-aligned.
  function boardFrom(rows) {
    const board = R.newBoard()
    const offset = R.ROWS - rows.length
    rows.forEach((row, y) => {
      for (let x = 0; x < R.COLS; x++) {
        board[offset + y][x] = row[x] === '#' ? 'J' : ''
      }
    })
    return board
}

const filledCount = (board) =>
  board.reduce((n, row) => n + row.filter((c) => c !== '').length, 0)

test('board is 10 wide and 20 tall, and starts empty', () => {
  const board = R.newBoard()
  assert.equal(board.length, 20)
  assert.equal(board[0].length, 10)
  assert.equal(filledCount(board), 0)
})

test('every piece is exactly 4 cells', () => {
  R.TYPES.forEach((type) => {
    assert.equal(R.PIECES[type].cells.length, 4, type + ' is not 4 cells')
  })
})

test('a piece spawns clear of an empty board', () => {
  R.TYPES.forEach((type) => {
    const piece = R.spawn(type)
    assert.equal(R.collides(R.newBoard(), piece, piece.cells, piece.x, piece.y), false, type)
  })
})

test('four rotations return a piece to its starting shape', () => {
  R.TYPES.forEach((type) => {
    const piece = R.spawn(type)
    const start = JSON.stringify(piece.cells.slice().sort())
    for (let i = 0; i < 4; i++) piece.cells = R.rotated(piece)
    assert.equal(JSON.stringify(piece.cells.slice().sort()), start, type)
  })
})

test('rotation keeps a piece at 4 cells and never off the board rows', () => {
  const piece = R.spawn('T')
  for (let i = 0; i < 4; i++) {
    piece.cells = R.rotated(piece)
    assert.equal(piece.cells.length, 4)
    piece.cells.forEach(([x, y]) => {
      assert.ok(x >= 0 && x < piece.size && y >= 0 && y < piece.size, 'cell left the box')
    })
  }
})

test('a piece cannot move through the left or right wall', () => {
  const board = R.newBoard()
  const piece = R.spawn('O')
  let moves = 0
  while (R.tryMove(board, piece, -1, 0)) moves++
  assert.ok(moves > 0, 'never moved at all')
  assert.equal(piece.x, 0)
  assert.equal(R.tryMove(board, piece, -1, 0), false, 'walked through the left wall')

  while (R.tryMove(board, piece, 1, 0)) {}
  assert.equal(piece.x + 2, R.COLS, 'stopped in the wrong place at the right wall')
})

test('the walls still hold while a piece is above the ceiling', () => {
  // Spawn height is above row 0, where there is no board row to collide with, so
  // this is the only thing standing between a fresh piece and open space.
  const board = R.newBoard()
  const piece = R.spawn('O')
  piece.y = -2
  let steps = 0
  while (R.tryMove(board, piece, 1, 0) && steps < 100) steps++
  assert.ok(steps < 100, 'a piece above the ceiling walked off the board forever')
  assert.equal(piece.x + 2, R.COLS, 'stopped in the wrong place at the right wall')

  while (R.tryMove(board, piece, -1, 0) && steps < 200) steps++
  assert.equal(piece.x, 0, 'stopped in the wrong place at the left wall')
})

test('a piece cannot fall through the floor', () => {
  const board = R.newBoard()
  const piece = R.spawn('O')
  while (R.tryMove(board, piece, 0, 1)) {}
  assert.equal(piece.y + 2, R.ROWS)
})

test('dropDistance lands the piece exactly on the floor', () => {
  const board = R.newBoard()
  const piece = R.spawn('I')
  const distance = R.dropDistance(board, piece)
  piece.y += distance
  assert.equal(R.collides(board, piece, piece.cells, piece.x, piece.y), false, 'landed inside the floor')
  assert.equal(R.collides(board, piece, piece.cells, piece.x, piece.y + 1), true, 'stopped short of the floor')
})

test('dropDistance stops on top of the stack, not on the floor', () => {
  const board = boardFrom(['##########'])
  const piece = R.spawn('O')
  piece.y += R.dropDistance(board, piece)
  assert.equal(piece.y + 2, R.ROWS - 1, 'fell into the stack')
})

test('a piece collides with a filled cell', () => {
  const board = R.newBoard()
  board[5][4] = 'J'
  const piece = R.spawn('O')
  assert.equal(R.collides(board, piece, piece.cells, 4, 5), true)
  assert.equal(R.collides(board, piece, piece.cells, 0, 5), false)
})

test('a wall kick lets a piece rotate while flat against the wall', () => {
  const board = R.newBoard()
  const piece = R.spawn('I')
  while (R.tryMove(board, piece, -1, 0)) {}
  const before = JSON.stringify(piece.cells)
  assert.equal(R.tryRotate(board, piece), true, 'refused to rotate against the wall')
  assert.notEqual(JSON.stringify(piece.cells), before, 'claimed to rotate but did not')
  assert.equal(R.collides(board, piece, piece.cells, piece.x, piece.y), false, 'kicked into the wall')
})

test('a rotation that would clip the wall gets kicked back on board', () => {
  // Only cells are collision-checked, never the piece's box, so a piece whose
  // box has an empty column can sit with that column hanging off the board.
  // Rotating there swings a cell into the wall, and only a kick saves it. A
  // piece that rotates wholly inside an on-board box never needs one, which is
  // why the I-piece case above does not actually exercise kicking.
  const board = R.newBoard()
  const piece = R.spawn('T')
  assert.equal(R.tryRotate(board, piece), true, 'could not stand the T up')
  while (R.tryMove(board, piece, -1, 0)) {}

  const before = piece.x
  assert.equal(R.tryRotate(board, piece), true, 'refused a rotation a kick could save')
  assert.ok(piece.x > before, 'rotated without kicking, so it clipped the wall')
  assert.equal(
    R.collides(board, piece, piece.cells, piece.x, piece.y), false,
    'kicked itself into the wall'
  )
})

test('rotation is refused when no kick can fit', () => {
  // A full board leaves nowhere for any rotation to land.
  const board = boardFrom(Array(R.ROWS).fill('##########'))
  const piece = R.spawn('T')
  piece.y = 5
  assert.equal(R.tryRotate(board, piece), false)
})

test('locking writes exactly 4 cells and reports landing inside', () => {
  const board = R.newBoard()
  const piece = R.spawn('O')
  piece.y = 10
  assert.equal(R.lock(board, piece), true)
  assert.equal(filledCount(board), 4)
})

test('locking above the ceiling reports a top out', () => {
  const board = R.newBoard()
  const piece = R.spawn('O')
  piece.y = -2
  assert.equal(R.lock(board, piece), false, 'a piece locked off the top was not a top out')
})

test('a full row clears and the board stays 20 rows tall', () => {
  const board = boardFrom(['##########'])
  assert.equal(R.clearLines(board), 1)
  assert.equal(board.length, R.ROWS)
  assert.equal(filledCount(board), 0)
})

test('an incomplete row does not clear', () => {
  const board = boardFrom(['#########.'])
  assert.equal(R.clearLines(board), 0)
  assert.equal(filledCount(board), 9)
})

test('four rows clear at once', () => {
  const board = boardFrom(['##########', '##########', '##########', '##########'])
  assert.equal(R.clearLines(board), 4)
  assert.equal(filledCount(board), 0)
})

test('clearing a row drops what was above it, and only that', () => {
  //  '..#.......'  survivor, should end up one row lower
  //  '##########'  clears
  const board = boardFrom(['..#.......', '##########'])
  assert.equal(R.clearLines(board), 1)
  assert.equal(filledCount(board), 1, 'lost or gained blocks while clearing')
  assert.equal(board[R.ROWS - 1][2], 'J', 'the survivor did not fall into the cleared row')
})

test('non-adjacent full rows both clear', () => {
  const board = boardFrom(['##########', '.........#', '##########'])
  assert.equal(R.clearLines(board), 2)
  assert.equal(filledCount(board), 1)
  assert.equal(board[R.ROWS - 1][9], 'J', 'the leftover row did not fall to the floor')
})

test('garbage rises from the bottom with exactly one hole', () => {
  const board = R.newBoard()
  assert.equal(R.addGarbage(board, 3), true)
  for (let y = R.ROWS - 3; y < R.ROWS; y++) {
    const holes = board[y].filter((c) => c === '').length
    assert.equal(holes, 1, 'row ' + y + ' had ' + holes + ' holes')
  }
  assert.equal(filledCount(board), 3 * (R.COLS - 1))
})

test('one batch of garbage shares a single hole column, so it is diggable', () => {
  const board = R.newBoard()
  R.addGarbage(board, 4)
  const holeColumns = new Set()
  for (let y = R.ROWS - 4; y < R.ROWS; y++) holeColumns.add(board[y].indexOf(''))
  assert.equal(holeColumns.size, 1)
})

test('garbage pushes the existing stack up rather than overwriting it', () => {
  const board = boardFrom(['#.........'])
  R.addGarbage(board, 2)
  assert.equal(board[R.ROWS - 3][0], 'J', 'the old stack did not rise')
})

test('garbage that pushes a block through the ceiling is a top out', () => {
  const rows = Array(R.ROWS).fill('.........#')
  const board = boardFrom(rows)
  assert.equal(R.addGarbage(board, 1), false)
})

test('no garbage requested is a no-op', () => {
  const board = R.newBoard()
  assert.equal(R.addGarbage(board, 0), true)
  assert.equal(filledCount(board), 0)
})

test('attack table rewards clearing more rows at once', () => {
  assert.equal(R.attackFor(0), 0)
  assert.equal(R.attackFor(1), 0)
  assert.equal(R.attackFor(2), 1)
  assert.equal(R.attackFor(3), 2)
  assert.equal(R.attackFor(4), 4)
})

test('the 7-bag deals each piece exactly once per 7', () => {
  const next = R.createBag()
  for (let round = 0; round < 20; round++) {
    const drawn = []
    for (let i = 0; i < 7; i++) drawn.push(next())
    assert.equal(new Set(drawn).size, 7, 'round ' + round + ' repeated a piece: ' + drawn)
  }
})

test('the bag is actually shuffled, not a fixed order', () => {
  const orders = new Set()
  for (let i = 0; i < 40; i++) {
    const next = R.createBag()
    orders.add(Array.from({ length: 7 }, next).join(''))
  }
  assert.ok(orders.size > 1, 'every bag came out in the same order')
})

test('gravity speeds up with lines and then holds at a playable floor', () => {
  assert.ok(R.gravityFor(0) > R.gravityFor(10), 'level 2 was not faster than level 1')
  assert.ok(R.gravityFor(10) > R.gravityFor(50), 'it stopped speeding up too early')
  assert.equal(R.gravityFor(100000), 120, 'gravity ran away past the floor')
  assert.ok(R.gravityFor(0) <= 800)
})

test('level counts from 1', () => {
  assert.equal(R.levelFor(0), 1)
  assert.equal(R.levelFor(9), 1)
  assert.equal(R.levelFor(10), 2)
})

test('colorOf gives every piece and garbage a colour, and empty none', () => {
  R.TYPES.forEach((type) => assert.match(R.colorOf(type), /^#[0-9a-f]{6}$/i, type))
  assert.match(R.colorOf(R.GARBAGE), /^#[0-9a-f]{6}$/i)
  assert.equal(R.colorOf(''), '')
})

// A full piece cycle: drop pieces until a row clears, the way the table does it.
test('a played-out well clears a row and keeps its block count honest', () => {
  const board = R.newBoard()
  // Five O pieces fill columns 0-9 of the bottom two rows exactly.
  for (let i = 0; i < 5; i++) {
    const piece = R.spawn('O')
    piece.x = i * 2
    piece.y += R.dropDistance(board, piece)
    assert.equal(R.lock(board, piece), true)
  }
  assert.equal(filledCount(board), 20, 'the pieces did not tile the floor')
  assert.equal(R.clearLines(board), 2)
  assert.equal(filledCount(board), 0)
})

}

// Running this file directly checks the real rules.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('tetris-rules')
  const r = await check(readRules())
  console.log('\n' + r.passed + ' passed, ' + r.failed + ' failed')
  process.exit(r.failed === 0 ? 0 : 1)
}
