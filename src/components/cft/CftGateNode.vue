<template>
  <g class="cft-gate-node"
    @mousedown.stop="onMouseDown"
    @click.stop="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousemove="onMouseMove"
  >
    <!-- Selection highlight -->
    <rect v-if="isSelected" :x="gate.x - 3" :y="gate.y - 3" :width="gate.width + 6" :height="gate.height + 6"
      rx="5" fill="none" stroke="#495057" stroke-width="1.5" opacity="0.4" stroke-dasharray="3 2"/>
    <!-- Gate rectangle -->
    <rect :x="gate.x" :y="gate.y" :width="gate.width" :height="gate.height"
      rx="3" :fill="isSelected ? '#f1f3f5' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#495057'" stroke-width="1.5"/>
    <!-- Gate symbol — AND/OR only (Def 17) -->
    <text :x="gate.x + gate.width / 2" :y="gate.y + gate.height / 2 + 1"
      text-anchor="middle" dominant-baseline="middle" class="gate-symbol-text">{{ gateSymbol }}</text>
    <!-- maxf label above gate output -->
    <text v-if="outputMaxf !== null" :x="gate.x + gate.width / 2" :y="gate.y - 6"
      text-anchor="middle" class="gate-maxf-text">M: {{ formatProb(outputMaxf) }}</text>
    <!-- Output connection point (top center) -->
    <circle :cx="gate.x + gate.width / 2" :cy="gate.y" r="3"
      :fill="connectMode ? '#198754' : '#adb5bd'"
      :stroke="connectMode ? '#198754' : '#868e96'"
      stroke-width="1" class="conn-point" @click.stop="onConnPointClick('output')"/>
    <!-- Input connection points (bottom, evenly distributed) -->
    <circle v-for="(_, i) in inputCount" :key="'input-' + i"
      :cx="gate.x + gate.width * (i + 1) / (inputCount + 1)"
      :cy="gate.y + gate.height" r="3"
      :fill="connectMode ? '#198754' : '#adb5bd'"
      :stroke="connectMode ? '#198754' : '#868e96'"
      stroke-width="1" class="conn-point" @click.stop="onConnPointClick('input', i)"/>
    <!-- Resize handles when selected -->
    <template v-if="isSelected">
      <rect v-for="handle in resizeHandles" :key="handle.cursor"
        :x="handle.x - 4" :y="handle.y - 4" width="8" height="8"
        rx="2" fill="#ffffff" stroke="#495057" stroke-width="1.5"
        :style="{ cursor: handle.cursor }"
        @mousedown.stop="onResizeMouseDown($event, handle.dir)"/>
    </template>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCftStore } from '../../stores/cft.js'
import { useDiagramStore } from '../../stores/diagram.js'
import { formatProb } from '../../utils/format.js'

const props = defineProps<{ gate: { id: string; type: string; x: number; y: number; width: number; height: number; inputCount?: number } }>()

const store = useCftStore()
const diagramStore = useDiagramStore()
const isSelected = computed(() => store.selectedNodeId === props.gate.id)
const connectMode = computed(() => store.connectMode)
const inputCount = computed(() => props.gate.inputCount ?? 2)
const outputMaxf = computed(() => diagramStore.slotMaxfMap?.[props.gate.id] ?? null)

const gateSymbol = computed(() => {
  switch (props.gate.type) {
    case 'AND': return '&'
    case 'OR':  return '≥1'
    default:    return '?'
  }
})

const resizeHandles = computed(() => {
  const { x, y, width, height } = props.gate
  return [
    { x: x + width, y: y + height, cursor: 'se-resize', dir: 'se' },
    { x, y: y + height, cursor: 'sw-resize', dir: 'sw' },
    { x: x + width, y, cursor: 'ne-resize', dir: 'ne' },
    { x, y, cursor: 'nw-resize', dir: 'nw' },
  ]
})

let dragStart: { mx: number; my: number; ox: number; oy: number; ow?: number; oh?: number; type: string; dir?: string } | null = null

function onClick() {
  if (store.connectMode) { onConnPointClick('any'); return }
  store.selectNode(props.gate.id, 'gate')
}

function onMouseEnter(e: MouseEvent) {
  store.showTooltip(e.clientX + 12, e.clientY + 12, `${props.gate.type} Gate`, 'Logic', null)
}
function onMouseLeave() { store.hideTooltip() }
function onMouseMove(e: MouseEvent) { store.moveTooltip(e.clientX + 12, e.clientY + 12) }

function onConnPointClick(slot: string, portIndex = 0) {
  if (!store.connectMode) return
  if (!store.connectSourceId) {
    if (slot === 'input') return
    store.setConnectSource(props.gate.id, portIndex)
  } else {
    if (slot === 'output') {
      const storedNode = store.activeCft?.nodes.find((n: { id: string; type: string }) => n.id === store.connectSourceId)
      if (storedNode?.type === 'outputPort') {
        store.addEdge(props.gate.id, store.connectSourceId, portIndex, store.connectSourcePort)
      } else {
        store.setConnectSource(props.gate.id, portIndex)
      }
    } else {
      store.addEdge(store.connectSourceId, props.gate.id, store.connectSourcePort, portIndex)
    }
  }
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0 || store.connectMode) return
  store.selectNode(props.gate.id, 'gate')
  dragStart = { mx: e.clientX, my: e.clientY, ox: props.gate.x, oy: props.gate.y, type: 'move' }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onResizeMouseDown(e: MouseEvent, dir: string) {
  if (e.button !== 0) return
  dragStart = { mx: e.clientX, my: e.clientY, ox: props.gate.x, oy: props.gate.y, ow: props.gate.width, oh: props.gate.height, type: 'resize', dir }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!dragStart) return
  const zoom = (window as any).__cftZoom ?? 1
  const dx = (e.clientX - dragStart.mx) / zoom
  const dy = (e.clientY - dragStart.my) / zoom
  if (dragStart.type === 'move') {
    store.updateGate(props.gate.id, {
      x: Math.round((dragStart.ox + dx) / 30) * 30,
      y: Math.round((dragStart.oy + dy) / 30) * 30,
    })
  } else {
    const dir = dragStart.dir!
    let { ox, oy, ow, oh } = dragStart
    let nx = ox!, ny = oy!, nw = ow!, nh = oh!
    const MIN = 60
    if (dir.includes('e')) nw = Math.max(MIN, Math.round((ow! + dx) / 30) * 30)
    if (dir.includes('s')) nh = Math.max(MIN, Math.round((oh! + dy) / 30) * 30)
    if (dir.includes('w')) { nw = Math.max(MIN, Math.round((ow! - dx) / 30) * 30); nx = Math.round((ox! + ow! - nw) / 30) * 30 }
    if (dir.includes('n')) { nh = Math.max(MIN, Math.round((oh! - dy) / 30) * 30); ny = Math.round((oy! + oh! - nh) / 30) * 30 }
    store.updateGate(props.gate.id, { x: nx, y: ny, width: nw, height: nh })
  }
}
function onDragEnd() {
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}
</script>

<style scoped>
.cft-gate-node { cursor: grab; }
.cft-gate-node:active { cursor: grabbing; }
.gate-symbol-text { font-size: 16px; font-weight: 700; fill: var(--color-text-primary); font-family: var(--font-sans); pointer-events: none; user-select: none; }
.gate-maxf-text { font-size: 9px; font-weight: 500; fill: var(--color-success); font-family: var(--font-mono, monospace); pointer-events: none; user-select: none; }
.conn-point { cursor: crosshair; transition: r 0.15s; }
.conn-point:hover { r: 5; }
</style>
