// The hand's control pad.
//
// It draws no well. The platform only promises a hand the MOST RECENT table
// message, so a board rendered here would stutter and lie; the TV is where the
// board lives. What the pad shows instead is the player's own line count and
// next piece, both of which only change when a piece locks, so a dropped message
// costs nothing.
//
// Left, right and soft drop repeat while held, because tapping once per cell is
// not a way to play tetris.

import { injectStyle, mountPreview } from './shared/skin.js'

var REPEAT_DELAY = 200 // held this long before it starts repeating
var REPEAT_EVERY = 60

var KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'rotate',
  ArrowDown: 'soft',
  ' ': 'drop',
  Spacebar: 'drop',
}

// `send(action)` fires on every press and on every repeat.
export function mountHand(root, send) {
  injectStyle()

  var wrap = document.createElement('div')
  wrap.className = 'tt-wrap'

  var head = document.createElement('div')
  head.className = 'tt-head'

  var headText = document.createElement('div')
  headText.className = 'tt-headtext'
  head.appendChild(headText)

  var status = document.createElement('div')
  status.className = 'tt-status'
  status.style.textAlign = 'left'
  headText.appendChild(status)

  var previewBox = document.createElement('div')
  var preview = mountPreview(previewBox)
  head.appendChild(previewBox)
  wrap.appendChild(head)

  var pad = document.createElement('div')
  pad.className = 'tt-pad'

  var top = document.createElement('div')
  top.className = 'tt-padrow'
  var rotate = makeButton('⟳', 'tt-btn tt-btn-rotate', 'Rotate', 'rotate', send, false)
  var drop = makeButton('DROP', 'tt-btn tt-btn-drop', 'Hard drop', 'drop', send, false)
  top.appendChild(rotate)
  top.appendChild(drop)
  pad.appendChild(top)

  var bottom = document.createElement('div')
  bottom.className = 'tt-padrow'
  var left = makeButton('◀', 'tt-btn', 'Move left', 'left', send, true)
  var down = makeButton('▼', 'tt-btn', 'Soft drop', 'soft', send, true)
  var right = makeButton('▶', 'tt-btn', 'Move right', 'right', send, true)
  bottom.appendChild(left)
  bottom.appendChild(down)
  bottom.appendChild(right)
  pad.appendChild(bottom)

  wrap.appendChild(pad)
  root.appendChild(wrap)

  var buttons = [rotate, drop, left, down, right]
  var live = false

  // A keyboard is not how anyone plays this in a living room, but it is how the
  // dev harness gets played on a laptop.
  document.addEventListener('keydown', function (event) {
    var action = KEYS[event.key]
    if (!action || !live || event.repeat) return
    event.preventDefault()
    send(action)
  })

  return function update(statusText, subText, nextType, enabled) {
    live = enabled

    status.innerHTML = ''
    status.appendChild(document.createTextNode(statusText))
    if (subText) {
      var sub = document.createElement('div')
      sub.className = 'tt-sub'
      sub.textContent = subText
      status.appendChild(sub)
    }

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !enabled
    }

    var short = Math.min(window.innerWidth, window.innerHeight)
    preview(enabled ? nextType : '', Math.max(8, Math.round(short * 0.045)))
  }
}

function makeButton(label, className, ariaLabel, action, send, repeats) {
  var button = document.createElement('button')
  button.className = className
  button.textContent = label
  button.setAttribute('aria-label', ariaLabel)
  button.setAttribute('type', 'button')

  var delayTimer = null
  var repeatTimer = null

  function press(event) {
    // A touch also fires a mouse event afterwards; without this the tap counts
    // twice and the piece jumps two cells.
    if (event) event.preventDefault()
    if (button.disabled) return

    send(action)
    if (!repeats) return

    stop()
    delayTimer = setTimeout(function () {
      repeatTimer = setInterval(function () {
        if (button.disabled) return stop()
        send(action)
      }, REPEAT_EVERY)
    }, REPEAT_DELAY)
  }

  function stop() {
    if (delayTimer) clearTimeout(delayTimer)
    if (repeatTimer) clearInterval(repeatTimer)
    delayTimer = null
    repeatTimer = null
  }

  button.addEventListener('touchstart', press)
  button.addEventListener('touchend', stop)
  button.addEventListener('touchcancel', stop)
  button.addEventListener('mousedown', press)
  button.addEventListener('mouseup', stop)
  button.addEventListener('mouseleave', stop)

  return button
}
