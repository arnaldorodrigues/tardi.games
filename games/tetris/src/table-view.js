// The table's display: one well per player, side by side, plus each player's
// name, score and next piece.
//
// Two things matter here. The wells must hold a 10x20 ratio at any iframe size,
// which JS does in pixels because `aspect-ratio` does not exist on an old TV
// browser. And a repaint must be cheap: 200 cells per well times four players is
// 800 elements, so each cell keeps the colour it was last painted and only the
// cells that actually changed are touched.

import { COLS, ROWS, colorOf } from './shared/tetris-rules.js'
import { injectStyle, mountPreview, lineCount } from './shared/skin.js'

var EMPTY = '#0f172a'

export function mountTable(root) {
  injectStyle()

  var wrap = document.createElement('div')
  wrap.className = 'tt-wrap'

  var status = document.createElement('div')
  status.className = 'tt-status'
  wrap.appendChild(status)

  var wellsRow = document.createElement('div')
  wellsRow.className = 'tt-wells'
  wrap.appendChild(wellsRow)

  root.appendChild(wrap)

  var views = [] // one per well currently on screen
  var cellPx = 0

  window.addEventListener('resize', layout)

  // Rebuilds the row of wells. Called when the player list changes, which is
  // rare, so throwing the DOM away and starting over is fine.
  function setWells(count) {
    while (views.length > count) {
      wellsRow.removeChild(views.pop().el)
    }
    while (views.length < count) {
      views.push(makeWell(wellsRow))
    }
    cellPx = 0 // force a resize pass: the wells just changed width
    layout()
  }

  // Sizes every well so `count` of them fit the row at a 10x20 ratio.
  function layout() {
    if (views.length === 0) return

    var availW = wellsRow.clientWidth
    var availH = wellsRow.clientHeight
    if (availW === 0 || availH === 0) return

    var perWellW = availW / views.length - vmin(2.5)
    var size = Math.floor(Math.min(availH / ROWS, perWellW / COLS))
    if (size < 2) size = 2
    applySize(size)

    // The name, score and preview under each well take whatever height they
    // take: the font is in vmin and the preview scales with the cell, so there
    // is no honest way to predict it. Measure the rendered well and shrink until
    // it fits, or the wells overflow their row and ride up over the title.
    for (var guard = 0; guard < 8 && size > 2; guard++) {
      var tallest = 0
      for (var i = 0; i < views.length; i++) {
        if (views[i].el.offsetHeight > tallest) tallest = views[i].el.offsetHeight
      }
      if (tallest <= availH) break

      var next = Math.floor(size * (availH / tallest)) - 1
      size = next < 2 ? 2 : next
      applySize(size)
    }

    cellPx = size
  }

  function applySize(size) {
    for (var i = 0; i < views.length; i++) {
      var view = views[i]
      view.grid.style.width = size * COLS + 'px'
      view.grid.style.height = size * ROWS + 'px'
      for (var n = 0; n < view.cells.length; n++) {
        view.cells[n].style.width = size + 'px'
        view.cells[n].style.height = size + 'px'
      }
      view.preview(view.nextType, Math.max(6, Math.floor(size * 0.62)))
    }
  }

  // `wells` is one entry per player:
  //   { nick, lines, level, alive, next, board, piece, ghostY }
  function update(statusText, statusSub, wells) {
    status.innerHTML = ''
    status.appendChild(document.createTextNode(statusText))
    if (statusSub) {
      var sub = document.createElement('div')
      sub.className = 'tt-sub'
      sub.textContent = statusSub
      status.appendChild(sub)
    }

    if (views.length !== wells.length) setWells(wells.length)

    for (var i = 0; i < wells.length; i++) {
      paint(views[i], wells[i])
    }
  }

  function paint(view, well) {
    var colors = composite(well)

    for (var n = 0; n < colors.length; n++) {
      if (view.painted[n] !== colors[n]) {
        view.cells[n].style.backgroundColor = colors[n]
        view.painted[n] = colors[n]
      }
    }

    var name = well.nick || 'Player'
    if (view.nameText !== name) {
      view.name.textContent = name
      view.nameText = name
    }

    var score = well.alive
      ? lineCount(well.lines) + '  ·  L' + well.level
      : 'OUT  ·  ' + lineCount(well.lines)
    if (view.scoreText !== score) {
      view.score.textContent = score
      view.scoreText = score
    }

    var outClass = well.alive ? 'tt-well' : 'tt-well tt-out'
    if (view.el.className !== outClass) view.el.className = outClass

    var next = well.alive ? well.next : ''
    if (view.nextType !== next) {
      view.nextType = next
      view.preview(next, Math.max(6, Math.floor(cellPx * 0.62)))
    }
  }

  return { update: update, layout: layout }
}

// Flattens a well's locked board, its falling piece and that piece's landing
// shadow into one colour per cell.
function composite(well) {
  var out = []
  for (var y = 0; y < ROWS; y++) {
    for (var x = 0; x < COLS; x++) {
      var mark = well.board[y][x]
      out.push(mark === '' ? EMPTY : colorOf(mark))
    }
  }

  if (!well.piece) return out

  var piece = well.piece
  var color = colorOf(piece.type)

  // The shadow goes down first so the piece itself paints over it.
  if (well.ghostY !== null && well.ghostY !== undefined && well.ghostY !== piece.y) {
    paintCells(out, piece, piece.x, well.ghostY, ghostOf(color))
  }
  paintCells(out, piece, piece.x, piece.y, color)

  return out
}

function paintCells(out, piece, px, py, color) {
  for (var i = 0; i < piece.cells.length; i++) {
    var x = px + piece.cells[i][0]
    var y = py + piece.cells[i][1]
    if (y < 0 || y >= ROWS || x < 0 || x >= COLS) continue
    out[y * COLS + x] = color
  }
}

// The landing shadow: the piece's own colour, mixed most of the way down to the
// empty-cell colour, so it reads as a hint and never as a real block.
function ghostOf(hex) {
  var r = parseInt(hex.slice(1, 3), 16)
  var g = parseInt(hex.slice(3, 5), 16)
  var b = parseInt(hex.slice(5, 7), 16)
  return 'rgb(' + mix(r, 15) + ',' + mix(g, 23) + ',' + mix(b, 42) + ')'
}

function mix(channel, floor) {
  return Math.round(floor + (channel - floor) * 0.28)
}

function makeWell(parent) {
  var el = document.createElement('div')
  el.className = 'tt-well'

  var grid = document.createElement('div')
  grid.className = 'tt-grid'

  var cells = []
  var painted = []
  for (var y = 0; y < ROWS; y++) {
    var row = document.createElement('div')
    row.className = 'tt-row'
    for (var x = 0; x < COLS; x++) {
      var cell = document.createElement('div')
      cell.className = 'tt-cell'
      cell.style.backgroundColor = EMPTY
      row.appendChild(cell)
      cells.push(cell)
      painted.push(EMPTY)
    }
    grid.appendChild(row)
  }
  el.appendChild(grid)

  var name = document.createElement('div')
  name.className = 'tt-name'
  el.appendChild(name)

  var score = document.createElement('div')
  score.className = 'tt-score'
  el.appendChild(score)

  var previewBox = document.createElement('div')
  previewBox.style.marginTop = '0.6vmin'
  el.appendChild(previewBox)

  parent.appendChild(el)

  return {
    el: el,
    grid: grid,
    cells: cells,
    painted: painted,
    name: name,
    score: score,
    nameText: null,
    scoreText: null,
    nextType: null,
    preview: mountPreview(previewBox),
  }
}

// One vmin in pixels, for the JS-side sizing maths.
function vmin(units) {
  var min = Math.min(window.innerWidth, window.innerHeight)
  return (min * units) / 100
}
