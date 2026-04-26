<template>
  <g class="cft-port-node" 
    @mousedown.stop="onMouseDown" 
    @click.stop="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousemove="onMouseMove"
  >
    <!-- Selection ring -->
    <rect
      v-if="isSelected"
      :x="node.x - 17" :y="node.y - 17"
      width="34" height="34"
      rx="4"
      fill="none"
      stroke="#495057"
      stroke-width="1.5"
      opacity="0.4"
      stroke-dasharray="3 2"
    />

    <!-- Port triangle -->
    <polygon
      :points="trianglePoints"
      :fill="isSelected ? '#343a40' : '#495057'"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="1.5"
      stroke-linejoin="round"
    />

    <!-- Name label -->
    <text
      :x="node.x"
      :y="isInput ? node.y + 26 : node.y - 28"
      text-anchor="middle"
      class="port-name-text"
    >{{ node.name }}</text>

    <!-- Probability label (output only, below name) -->
    <text
      v-if="!isInput"
      :x="node.x"
      :y="node.y - 14"
      text-anchor="middle"
      class="port-prob-text"
    >{{ probabilityText }}</text>

    <!-- Connection point -->
    <circle
      :cx="node.x"
      :cy="isInput ? node.y - 12 : node.y + 12"
      r="3"
      :fill="connectMode ? '#198754' : '#adb5bd'"
      :stroke="connectMode ? '#198754' : '#868e96'"
      stroke-width="1"
      class="conn-point"
      @click.stop="onConnPointClick"
    />
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { useCftStore } from '../../stores/cft.js'

const props = defineProps({
  node: { type: Object, required: true },
})

const store = useCftStore()
const isSelected = computed(() => store.selectedNodeId === props.node.id)
const isInput = computed(() => props.node.type === 'inputPort')
const connectMode = computed(() => store.connectMode)

const probabilityText = computed(() => {
  const p = store.evaluateProbability(store.activeComponentId, props.node.id, 0)
  return `P: ${Number(p.toFixed(4))}`
})

// Solid triangle: input points DOWN (inward), output points UP (outward)
const trianglePoints = computed(() => {
  const { x, y } = props.node
  const s = 14 // half-width
  const h = 16 // height
  if (isInput.value) {
    // Pointing down (inward) ▽
    return `${x - s},${y - h / 2} ${x + s},${y - h / 2} ${x},${y + h / 2}`
  } else {
    // Pointing up (outward) △
    return `${x - s},${y + h / 2} ${x + s},${y + h / 2} ${x},${y - h / 2}`
  }
})

let dragStart = null

function onClick() {
  if (store.connectMode) {
    onConnPointClick()
    return
  }
  store.selectNode(props.node.id, props.node.type)
}

function onMouseEnter(e) {
  const p = store.evaluateProbability(store.activeComponentId, props.node.id, 0)
  store.showTooltip(e.clientX + 12, e.clientY + 12, props.node.name, isInput.value ? 'Input' : 'Output', p)
}

function onMouseLeave() {
  store.hideTooltip()
}

function onMouseMove(e) {
  store.moveTooltip(e.clientX + 12, e.clientY + 12)
}

function onConnPointClick() {
  if (!store.connectMode) return
  if (!store.connectSourceId) {
    store.setConnectSource(props.node.id)
  } else {
    store.addEdge(store.connectSourceId, props.node.id, store.connectSourcePort, 0)
  }
}

function onMouseDown(e) {
  if (e.button !== 0 || store.connectMode) return
  store.selectNode(props.node.id, props.node.type)
  dragStart = {
    mx: e.clientX,
    my: e.clientY,
    ox: props.node.x,
    oy: props.node.y,
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e) {
  if (!dragStart) return
  const zoom = window.__cftZoom ?? 1
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
.cft-port-node {
  cursor: grab;
}
.cft-port-node:active {
  cursor: grabbing;
}
.port-name-text {
  font-size: 11px;
  font-weight: 600;
  fill: var(--color-text-primary);
  font-family: var(--font-sans);
  pointer-events: none;
  user-select: none;
}
.port-prob-text {
  font-size: 10px;
  font-weight: 500;
  fill: var(--color-accent);
  font-family: var(--font-mono, monospace);
  pointer-events: none;
  user-select: none;
}
.conn-point {
  cursor: crosshair;
  transition: r 0.15s;
}
.conn-point:hover {
  r: 5;
}
</style>
