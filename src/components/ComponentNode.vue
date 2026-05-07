<template>
  <g @mousedown.stop="onMouseDown" @click.stop="onClick" class="component-node">
    <!-- Shadow / glow for selected -->
    <rect
      v-if="isSelected"
      :x="comp.x - 3" :y="comp.y - 3"
      :width="comp.width + 6" :height="comp.height + 6"
      fill="none"
      stroke="#495057"
      stroke-width="1.5"
      opacity="0.5"
      filter="url(#glow)"
    />

    <!-- Main rectangle -->
    <rect
      :x="comp.x" :y="comp.y"
      :width="comp.width" :height="comp.height"
      :fill="isSelected ? '#f1f3f5' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="1.5"
    />

    <!-- UML component icon (small rect with two tabs on the left) -->
    <!-- Main body of the icon -->
    <rect
      :x="comp.x + comp.width - 20" :y="comp.y + 7"
      width="14" height="18"
      :fill="isSelected ? '#f1f3f5' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="1.2"
    />
    <!-- Upper tab -->
    <rect
      :x="comp.x + comp.width - 24" :y="comp.y + 10"
      width="8" height="4"
      :fill="isSelected ? '#f1f3f5' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="1.2"
    />
    <!-- Lower tab -->
    <rect
      :x="comp.x + comp.width - 24" :y="comp.y + 18"
      width="8" height="4"
      :fill="isSelected ? '#f1f3f5' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="1.2"
    />

    <!-- Stereotype label -->
    <text
      :x="comp.x + comp.width / 2"
      :y="comp.y + 22"
      text-anchor="middle"
      class="stereotype-text"
    >«component»</text>

    <!-- Component name: top when has children, centered otherwise -->
    <text
      :x="comp.x + comp.width / 2"
      :y="hasChildren ? comp.y + 36 : comp.y + comp.height / 2 + 5"
      text-anchor="middle"
      class="comp-name"
      :class="{ 'comp-name-selected': isSelected }"
    >{{ comp.name }}</text>

    <!-- Separator line under header when has children -->
    <line
      v-if="hasChildren"
      :x1="comp.x" :y1="comp.y + 44"
      :x2="comp.x + comp.width" :y2="comp.y + 44"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="0.8"
      opacity="0.5"
    />

    <!-- Failure rate (centered at bottom) -->
    <g>
      <text
        :x="comp.x + comp.width / 2"
        :y="comp.y + comp.height - (exceedsMaxf ? 22 : 12)"
        text-anchor="middle"
        class="failure-text"
        :class="{ 'failure-text-active': exceedsMaxf }"
      >f = {{ +(comp.failureRate || 0).toPrecision(4) }}</text>
      <text
        v-if="exceedsMaxf"
        :x="comp.x + comp.width / 2"
        :y="comp.y + comp.height - 10"
        text-anchor="middle"
        class="failure-text failure-text-active"
        style="font-size: 9px;"
      >maxf = {{ +(store.allComponentMaxf[comp.id]).toPrecision(4) }}</text>
    </g>

    <!-- Children sub-components (rendered inside) -->
    <ComponentNode
      v-for="child in children"
      :key="child.id"
      :comp="child"
      :parentBounds="childBounds"
    />

    <!-- Resize handles (8 handles: 4 corners + 4 edges) - visible on selection -->
    <template v-if="isSelected">
      <rect
        v-for="handle in resizeHandles"
        :key="handle.cursor"
        :x="handle.x - 5" :y="handle.y - 5"
        width="10" height="10"
        rx="3"
        fill="#ffffff"
        stroke="#495057"
        stroke-width="1.5"
        :style="{ cursor: handle.cursor }"
        @mousedown.stop="onResizeMouseDown($event, handle.dir)"
      />
    </template>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'

const props = defineProps({
  comp: { type: Object, required: true },
  parentBounds: { type: Object, default: null }, // { x, y, w, h } - constrains movement
})

const store = useDiagramStore()
const isSelected = computed(() => store.selectedId === props.comp.id)
const children = computed(() => store.childrenOf(props.comp.id))
const hasChildren = computed(() => children.value.length > 0)
const exceedsMaxf = computed(() => {
  const maxf = store.allComponentMaxf?.[props.comp.id]
  if (maxf === undefined) return false
  return (props.comp.failureRate || 0) > maxf
})

// Badge width no longer needed since it's just centered text now

// Bounds for children to stay inside this component
const CHILD_PADDING = 10
const HEADER_H = 50
const childBounds = computed(() => ({
  x: props.comp.x + CHILD_PADDING,
  y: props.comp.y + HEADER_H,
  w: props.comp.width - CHILD_PADDING * 2,
  h: props.comp.height - HEADER_H - CHILD_PADDING,
}))

const resizeHandles = computed(() => {
  const { x, y, width, height } = props.comp
  const cx = x + width / 2
  const cy = y + height / 2
  return [
    { x, y, cursor: 'nw-resize', dir: 'nw' },
    { x: cx, y, cursor: 'n-resize', dir: 'n' },
    { x: x + width, y, cursor: 'ne-resize', dir: 'ne' },
    { x: x + width, y: cy, cursor: 'e-resize', dir: 'e' },
    { x: x + width, y: y + height, cursor: 'se-resize', dir: 'se' },
    { x: cx, y: y + height, cursor: 's-resize', dir: 's' },
    { x, y: y + height, cursor: 'sw-resize', dir: 'sw' },
    { x, y: cy, cursor: 'w-resize', dir: 'w' },
  ]
})

let dragStart = null

function onClick() {
  store.selectItem(props.comp.id, 'component')
}

// Clamp position within parent bounds
function clampToParent(x, y, w, h) {
  const b = props.parentBounds
  if (!b) return { x, y }
  return {
    x: Math.max(b.x, Math.min(b.x + b.w - w, x)),
    y: Math.max(b.y, Math.min(b.y + b.h - h, y)),
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return
  store.selectItem(props.comp.id, 'component')
  dragStart = {
    mx: e.clientX,
    my: e.clientY,
    ox: props.comp.x,
    oy: props.comp.y,
    type: 'move',
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onResizeMouseDown(e, dir) {
  if (e.button !== 0) return
  dragStart = {
    mx: e.clientX,
    my: e.clientY,
    ox: props.comp.x,
    oy: props.comp.y,
    ow: props.comp.width,
    oh: props.comp.height,
    type: 'resize',
    dir,
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e) {
  if (!dragStart) return
  const zoom = window.__archrelZoom ?? 1
  const dx = (e.clientX - dragStart.mx) / zoom
  const dy = (e.clientY - dragStart.my) / zoom

  if (dragStart.type === 'move') {
    let newX = Math.round((dragStart.ox + dx) / 10) * 10
    let newY = Math.round((dragStart.oy + dy) / 10) * 10
    const clamped = clampToParent(newX, newY, props.comp.width, props.comp.height)
    const actualDx = clamped.x - props.comp.x
    const actualDy = clamped.y - props.comp.y
    store.updateComponent(props.comp.id, {
      x: clamped.x,
      y: clamped.y,
    })
    // Move all children by the same delta
    moveChildrenRecursive(props.comp.id, actualDx, actualDy)
  } else {
    const dir = dragStart.dir
    let { ox, oy, ow, oh } = dragStart
    let nx = ox, ny = oy, nw = ow, nh = oh
    const MIN = 80
    if (dir.includes('e')) nw = Math.max(MIN, Math.round((ow + dx) / 10) * 10)
    if (dir.includes('s')) nh = Math.max(MIN, Math.round((oh + dy) / 10) * 10)
    if (dir.includes('w')) { nw = Math.max(MIN, Math.round((ow - dx) / 10) * 10); nx = Math.round((ox + ow - nw) / 10) * 10 }
    if (dir.includes('n')) { nh = Math.max(MIN, Math.round((oh - dy) / 10) * 10); ny = Math.round((oy + oh - nh) / 10) * 10 }
    
    // If inside a parent, clamp resize too
    if (props.parentBounds) {
      const b = props.parentBounds
      nx = Math.max(b.x, nx)
      ny = Math.max(b.y, ny)
      if (nx + nw > b.x + b.w) nw = b.x + b.w - nx
      if (ny + nh > b.y + b.h) nh = b.y + b.h - ny
    }
    
    store.updateComponent(props.comp.id, { x: nx, y: ny, width: nw, height: nh })
  }
}

function onDragEnd() {
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

// Recursively move all descendants by (dx, dy)
function moveChildrenRecursive(parentId, dx, dy) {
  if (dx === 0 && dy === 0) return
  const kids = store.components.filter(c => c.parentId === parentId)
  kids.forEach(child => {
    store.updateComponent(child.id, {
      x: child.x + dx,
      y: child.y + dy,
    })
    moveChildrenRecursive(child.id, dx, dy)
  })
}
</script>

<style scoped>
.component-node {
  cursor: grab;
}
.component-node:active {
  cursor: grabbing;
}
.stereotype-text {
  font-size: 10px;
  fill: var(--color-text-muted);
  font-family: var(--font-sans);
  font-style: italic;
  pointer-events: none;
  user-select: none;
}
.comp-name {
  font-size: 13px;
  font-weight: 600;
  fill: var(--color-text-primary);
  font-family: var(--font-sans);
  pointer-events: none;
  user-select: none;
}
.comp-name-selected {
  fill: #212529;
}
.failure-text {
  font-size: 11px;
  font-weight: 500;
  font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
  font-style: italic;
  fill: var(--color-text-secondary);
  pointer-events: none;
  user-select: none;
}
.failure-text-active {
  fill: var(--color-danger);
}
</style>
