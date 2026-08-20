// The look, shared by the table and the hand, plus the next-piece preview both
// of them draw.
//
// Only flexbox, margins and viewport units: no CSS grid, no `gap`, no
// `aspect-ratio`, none of which a 2018 TV browser understands. Anything that has
// to hold a ratio (the wells) is sized in pixels from JS instead.

import { PIECES } from './tetris-rules.js'

var STYLE_ID = 'tetris-style'

var CSS = [
  '*{box-sizing:border-box}',
  'html,body{margin:0;padding:0;height:100%;background:#080c1a;color:#e2e8f0;',
  'font-family:Arial,Helvetica,sans-serif;-webkit-user-select:none;user-select:none;',
  '-webkit-tap-highlight-color:transparent;overflow:hidden}',

  // Shared shell
  '.tt-wrap{display:flex;flex-direction:column;height:100%;padding:1.5vmin}',
  '.tt-status{flex:0 0 auto;text-align:center;font-size:3.2vmin;line-height:1.3;',
  'min-height:4.4vmin;font-weight:bold}',
  '.tt-sub{font-size:2.2vmin;color:#94a3b8;font-weight:normal}',

  // Table: a row of wells
  '.tt-wells{flex:1 1 auto;display:flex;flex-direction:row;align-items:center;',
  'justify-content:center;min-height:0}',
  '.tt-well{display:flex;flex-direction:column;align-items:center;margin:0 1vmin}',
  '.tt-grid{display:flex;flex-direction:column;background:#0f172a;',
  'border:0.35vmin solid #1e293b;border-radius:1vmin;overflow:hidden}',
  '.tt-row{display:flex;flex-direction:row}',
  '.tt-cell{display:block}',
  '.tt-out .tt-grid{opacity:0.35}',
  '.tt-name{margin-top:1vmin;font-size:2.4vmin;font-weight:bold;text-align:center;',
  'max-width:22vmin;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
  '.tt-score{font-size:2vmin;color:#94a3b8;text-align:center}',
  '.tt-turnleader{color:#facc15}',

  // Next-piece preview
  '.tt-preview{display:flex;flex-direction:column;justify-content:center}',
  '.tt-prow{display:flex;flex-direction:row}',
  '.tt-pcell{display:block;border-radius:0.4vmin}',

  // Hand: header then a control pad
  '.tt-pad{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;margin-top:1vmin}',
  '.tt-padrow{flex:1 1 0;display:flex;flex-direction:row;min-height:0}',
  '.tt-btn{flex:1 1 0;margin:0.8vmin;min-height:44px;min-width:44px;border:none;',
  'border-radius:2vmin;background:#1e293b;color:#f8fafc;font-family:inherit;',
  'font-size:7vmin;font-weight:bold;line-height:1;display:flex;align-items:center;',
  'justify-content:center;cursor:pointer;touch-action:manipulation}',
  '.tt-btn:active{background:#334155}',
  '.tt-btn[disabled]{opacity:0.3;cursor:default}',
  '.tt-btn-drop{background:#1d4ed8;font-size:4.4vmin}',
  '.tt-btn-drop:active{background:#2563eb}',
  '.tt-btn-rotate{background:#7c3aed}',
  '.tt-btn-rotate:active{background:#8b5cf6}',
  '.tt-head{flex:0 0 auto;display:flex;flex-direction:row;align-items:center;',
  'justify-content:space-between;margin-bottom:0.5vmin}',
  '.tt-headtext{flex:1 1 auto;text-align:left;min-width:0}',

  // A phone held sideways has plenty of width and little height, so the pad
  // gets shorter buttons and the text shrinks with the short edge.
  '@media (max-height:480px){.tt-status{font-size:4.5vmin}.tt-btn{font-size:9vmin}',
  '.tt-btn-drop{font-size:5.5vmin}}',
].join('')

// "1 lines" is the kind of small wrong thing a player reads every round.
export function lineCount(n) {
  return n + (n === 1 ? ' line' : ' lines')
}

export function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  var style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

// A 4x4 next-piece preview. Returns update(type, cellPx): pass '' to clear it.
export function mountPreview(parent) {
  var box = document.createElement('div')
  box.className = 'tt-preview'

  var cells = []
  var painted = [] // what we last wrote; the browser rewrites '#22d3ee' as
  // 'rgb(34, 211, 238)', so reading style back never matches
  var sized = -1

  for (var y = 0; y < 4; y++) {
    var row = document.createElement('div')
    row.className = 'tt-prow'
    for (var x = 0; x < 4; x++) {
      var cell = document.createElement('div')
      cell.className = 'tt-pcell'
      row.appendChild(cell)
      cells.push(cell)
      painted.push(null)
    }
    box.appendChild(row)
  }
  parent.appendChild(box)

  return function update(type, cellPx) {
    var size = cellPx || 12
    var filled = {}

    if (type && PIECES[type]) {
      var def = PIECES[type]
      // Centre the piece's box inside the 4x4 preview.
      var offset = Math.floor((4 - def.size) / 2)
      for (var i = 0; i < def.cells.length; i++) {
        var cx = def.cells[i][0] + offset
        var cy = def.cells[i][1] + offset
        filled[cy * 4 + cx] = def.color
      }
    }

    for (var n = 0; n < cells.length; n++) {
      var color = filled[n] || 'transparent'
      var cell = cells[n]
      if (sized !== size) {
        cell.style.width = size + 'px'
        cell.style.height = size + 'px'
        cell.style.margin = Math.max(1, Math.round(size * 0.08)) + 'px'
      }
      if (painted[n] !== color) {
        cell.style.backgroundColor = color
        painted[n] = color
      }
    }
    sized = size
  }
}
