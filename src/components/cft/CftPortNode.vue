<template>
  <g class="cft-port-node"
    @mousedown.stop="onMouseDown"
    @click.stop="onClick"
    @dblclick.stop="onDblClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousemove="onMouseMove"
  >
    <rect v-if="isSelected" :x="node.x - 17" :y="node.y - 17" width="34" height="34"
      rx="4" fill="none" stroke="#495057" stroke-width="1.5" opacity="0.4" stroke-dasharray="3 2"/>
    <polygon :points="trianglePoints"
      :fill="isSelected ? '#343a40' : '#495057'"
      :stroke="!isInput && hasMaxf ? (isValid ? 'var(--color-success)' : 'var(--color-danger)') : (isSelected ? '#212529' : '#343a40')"
      :stroke-width="!isInput && hasMaxf ? 2.5 : 1.5"
      stroke-linejoin="round"/>
    <text :x="node.x" :y="isInput ? node.y + 26 : node.y - 40" text-anchor="middle" class="port-name-text">{{ node.name }}</text>
    <text v-if="!isInput" :x="node.x" :y="node.y - 28" text-anchor="middle" class="port-prob-text">{{ probabilityText }}</text>
    <text v-if="!isInput && hasMaxf" :x="node.x" :y="node.y - 16" text-anchor="middle"
      :class="isValid ? 'port-maxf-text port-maxf-ok' : 'port-maxf-text port-maxf-err'">
      M: {{ formatProb(maxf!) }}
    </text>
    <text v-if="isInput && inputMaxf !== null" :x="node.x" :y="node.y - 22" text-anchor="middle" class="port-maxf-text port-maxf-ok">
      M: {{ formatProb(inputMaxf) }}
    </text>
    <circle :cx="node.x" :cy="isInput ? node.y - 12 : node.y + 12" r="3"
      :fill="connectMode ? '#198754' : '#adb5bd'"
      :stroke="connectMode ? '#198754' : '#868e96'"
      stroke-width="1" class="conn-point" @click.stop="onConnPointClick"/>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCftStore } from '../../stores/cft.js'
import { useDiagramStore } from '../../stores/diagram.js'
import { formatProb } from '../../utils/format.js'

const props = defineProps<{ node: { id: string; name: string; x: number; y: number; type: string } }>()

const store = useCftStore()
const diagramStore = useDiagramStore()
const isSelected = computed(() => store.selectedNodeId === props.node.id)
const isInput = computed(() => props.node.type === 'inputPort')
const connectMode = computed(() => store.connectMode)

const evaluatedProbability = computed(() => {
  if (!store.activeComponentId) return 0
  return store.evaluateOutputProbability(store.activeComponentId) ?? 0
})

const probabilityText = computed(() => `P: ${formatProb(evaluatedProbability.value)}`)

const tooltipProbability = computed(() => {
  if (isInput.value) return store.inputPortProviderProbability(props.node.id)
  return evaluatedProbability.value
})

const maxf = computed(() => {
  if (isInput.value) return null
  return diagramStore.slotMaxfMap?.[props.node.id] ?? null
})
const hasMaxf = computed(() => maxf.value !== null)
const isValid = computed(() => !hasMaxf.value || evaluatedProbability.value <= maxf.value!)

const inputMaxf = computed(() => {
  if (!isInput.value) return null
  return diagramStore.slotMaxfMap?.[props.node.id] ?? null
})

const trianglePoints = computed(() => {
  const { x, y } = props.node
  const s = 14; const h = 16
  if (isInput.value) {
    return `${x - s},${y - h / 2} ${x + s},${y - h / 2} ${x},${y + h / 2}`
  } else {
    return `${x - s},${y + h / 2} ${x + s},${y + h / 2} ${x},${y - h / 2}`
  }
})

let dragStart: { mx: number; my: number; ox: number; oy: number } | null = null

function onClick() {
  if (store.connectMode) { onConnPointClick(); return }
  store.selectNode(props.node.id, props.node.type)
}

function onDblClick(e: MouseEvent) {
  if (!isInput.value || store.connectMode) return
  const parents = store.referencingComponents
  if (parents.length === 0) return
  store.showParentListPopup(e.clientX, e.clientY, parents)
}

function onMouseEnter(e: MouseEvent) {
  store.showTooltip(e.clientX + 12, e.clientY + 12, props.node.name, isInput.value ? 'Input' : 'Output', tooltipProbability.value)
}
function onMouseLeave() { store.hideTooltip() }
function onMouseMove(e: MouseEvent) { store.moveTooltip(e.clientX + 12, e.clientY + 12) }

function onConnPointClick() {
  if (!store.connectMode) return
  if (isInput.value || !store.connectSourceId) {
    store.setConnectSource(props.node.id)
  } else {
    store.addEdge(store.connectSourceId, props.node.id, store.connectSourcePort, 0)
  }
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0 || store.connectMode) return
  store.selectNode(props.node.id, props.node.type)
  dragStart = { mx: e.clientX, my: e.clientY, ox: props.node.x, oy: props.node.y }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}
function onDragMove(e: MouseEvent) {
  if (!dragStart) return
  const zoom = (window as any).__cftZoom ?? 1
  const dx = (e.clientX - dragStart.mx) / zoom
  const dy = (e.clientY - dragStart.my) / zoom
  store.updateNode(props.node.id, {
    x: Math.round((dragStart.ox + dx) / 30) * 30,
    y: Math.round((dragStart.oy + dy) / 30) * 30,
  })
}
function onDragEnd() {
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}
</script>

<style scoped>
.cft-port-node { cursor: grab; }
.cft-port-node:active { cursor: grabbing; }
.port-name-text { font-size: 11px; font-weight: 600; fill: var(--color-text-primary); font-family: var(--font-sans); pointer-events: none; user-select: none; }
.port-prob-text { font-size: 10px; font-weight: 500; fill: var(--color-accent); font-family: var(--font-mono, monospace); pointer-events: none; user-select: none; }
.port-maxf-text { font-size: 10px; font-weight: 600; font-family: var(--font-mono, monospace); pointer-events: none; user-select: none; }
.port-maxf-ok { fill: var(--color-success); }
.port-maxf-err { fill: var(--color-danger); }
.conn-point { cursor: crosshair; transition: r 0.15s; }
.conn-point:hover { r: 5; }
</style>
