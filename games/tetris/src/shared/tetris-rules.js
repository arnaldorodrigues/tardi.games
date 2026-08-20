// Tetris rules: pure functions over a well, shared by the table and the hand.
// No DOM and no timers here, so the table can own the whole simulation and the
// hand can reuse the piece shapes to draw its next-piece preview.
//
// Written in ES5 (var, function, no template literals) because the build targets
// 2018 TV browsers. See @juxhouse/tardi-core's compatibility note.

export var COLS = 10
export var ROWS = 20

// Each piece is 4 cells in a square box, so a rotation is a turn of the box.
// Coordinates are [x, y] from the box's top-left corner.
export var PIECES = {
  I: {
    size: 4,
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    color: '#22d3ee',
  },
  O: {
    size: 2,
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    color: '#facc15',
  },
  T: {
    size: 3,
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    color: '#c084fc',
  },
  S: {
    size: 3,
    cells: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    color: '#4ade80',
  },
  Z: {
    size: 3,
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    color: '#f87171',
  },
  J: {
    size: 3,
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    color: '#60a5fa',
  },
  L: {
    size: 3,
    cells: [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    color: '#fb923c',
  },
}

export var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

// Garbage rows sent to every opponent, by lines cleared at once. Clearing one
// row costs an opponent nothing, which is what makes stacking for a tetris worth
// the risk of topping out.
var ATTACK = [0, 0, 1, 2, 4]

export var GARBAGE = 'G'
var GARBAGE_COLOR = '#64748b'

// The colour a cell renders as. '' is an empty cell.
export function colorOf(mark) {
  if (mark === GARBAGE) return GARBAGE_COLOR
  if (PIECES[mark]) return PIECES[mark].color
  return ''
}

export function attackFor(linesCleared) {
  return ATTACK[linesCleared] || 0
}

export function newBoard() {
  var board = []
  for (var y = 0; y < ROWS; y++) {
    var row = []
    for (var x = 0; x < COLS; x++) row.push('')
    board.push(row)
  }
  return board
}

// A piece in play: its type, its rotated cells, and where its box sits.
export function spawn(type) {
  var def = PIECES[type]
  return {
    type: type,
    size: def.size,
    cells: def.cells.slice(),
    x: Math.floor((COLS - def.size) / 2),
    y: def.size === 4 ? -2 : -1, // start above the ceiling so a full row can still land
  }
}

// A turn of the box: [x, y] -> [size - 1 - y, x].
export function rotated(piece) {
  var out = []
  for (var i = 0; i < piece.cells.length; i++) {
    var x = piece.cells[i][0]
    var y = piece.cells[i][1]
    out.push([piece.size - 1 - y, x])
  }
  return out
}

// Absolute board coordinates of a piece's 4 cells.
export function cellsOf(piece, cells, x, y) {
  var use = cells || piece.cells
  var px = x === undefined ? piece.x : x
  var py = y === undefined ? piece.y : y
  var out = []
  for (var i = 0; i < use.length; i++) {
    out.push([px + use[i][0], py + use[i][1]])
  }
  return out
}

// True when any of the piece's cells is off the sides, below the floor, or on a
// filled cell. Above the ceiling (y < 0) is allowed: that is where pieces spawn.
export function collides(board, piece, cells, x, y) {
  var at = cellsOf(piece, cells, x, y)
  for (var i = 0; i < at.length; i++) {
    var cx = at[i][0]
    var cy = at[i][1]
    if (cx < 0 || cx >= COLS) return true
    if (cy >= ROWS) return true
    if (cy >= 0 && board[cy][cx] !== '') return true
  }
  return false
}

// Moves the piece by (dx, dy) if that lands somewhere legal. Returns true if it
// moved.
export function tryMove(board, piece, dx, dy) {
  if (collides(board, piece, piece.cells, piece.x + dx, piece.y + dy)) return false
  piece.x += dx
  piece.y += dy
  return true
}

// Rotates the piece, nudging it sideways if the turn would clip a wall or the
// stack. Without these kicks a piece against a wall simply refuses to turn.
var KICKS = [0, -1, 1, -2, 2]

export function tryRotate(board, piece) {
  var turned = rotated(piece)
  for (var i = 0; i < KICKS.length; i++) {
    var x = piece.x + KICKS[i]
    if (!collides(board, piece, turned, x, piece.y)) {
      piece.cells = turned
      piece.x = x
      return true
    }
  }
  return false
}

// How far down the piece can fall from where it is.
export function dropDistance(board, piece) {
  var d = 0
  while (!collides(board, piece, piece.cells, piece.x, piece.y + d + 1)) d++
  return d
}

// Writes the piece into the board. Returns false if any part of it locked above
// the ceiling, which is a top out.
export function lock(board, piece) {
  var at = cellsOf(piece)
  var inside = true
  for (var i = 0; i < at.length; i++) {
    var cx = at[i][0]
    var cy = at[i][1]
    if (cy < 0) {
      inside = false
      continue
    }
    board[cy][cx] = piece.type
  }
  return inside
}

// Removes every full row, dropping what was above it. Returns the row count.
export function clearLines(board) {
  var cleared = 0
  for (var y = ROWS - 1; y >= 0; y--) {
    if (isFull(board[y])) {
      board.splice(y, 1)
      board.unshift(emptyRow())
      cleared++
      y++ // the row that fell into this slot has not been checked yet
    }
  }
  return cleared
}

// Pushes `count` garbage rows in from the bottom. Each row has one open column,
// and every row in one batch shares that column so it stays diggable. Returns
// false if the stack was pushed through the ceiling, which is a top out.
export function addGarbage(board, count) {
  if (count <= 0) return true

  var hole = Math.floor(Math.random() * COLS)
  var survived = true

  for (var n = 0; n < count; n++) {
    if (!isEmptyRow(board[0])) survived = false
    board.shift()
    var row = []
    for (var x = 0; x < COLS; x++) row.push(x === hole ? '' : GARBAGE)
    board.push(row)
  }
  return survived
}

// A 7-bag randomiser: every 7 pieces contains each shape exactly once, so a
// player is never starved of the piece they are stacking for.
export function createBag() {
  var queue = []

  return function next() {
    if (queue.length === 0) {
      queue = TYPES.slice()
      for (var i = queue.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1))
        var tmp = queue[i]
        queue[i] = queue[j]
        queue[j] = tmp
      }
    }
    return queue.pop()
  }
}

// Gravity in milliseconds per row, from total lines cleared. Bottoms out so the
// game stays playable over a network rather than becoming a reflex test.
export function gravityFor(lines) {
  var level = Math.floor(lines / 10)
  var ms = 800 - level * 65
  return ms < 120 ? 120 : ms
}

export function levelFor(lines) {
  return Math.floor(lines / 10) + 1
}

function isFull(row) {
  for (var x = 0; x < COLS; x++) if (row[x] === '') return false
  return true
}

function isEmptyRow(row) {
  for (var x = 0; x < COLS; x++) if (row[x] !== '') return false
  return true
}

function emptyRow() {
  var row = []
  for (var x = 0; x < COLS; x++) row.push('')
  return row
}
