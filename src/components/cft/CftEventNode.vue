<template>
  <g class="cft-event-node" 
    @mousedown.stop="onMouseDown" 
    @click.stop="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousemove="onMouseMove"
  >
    <!-- Selection ring -->
    <circle
      v-if="isSelected"
      :cx="node.x" :cy="node.y"
      r="24"
      fill="none"
      stroke="#495057"
      stroke-width="1.5"
      opacity="0.4"
      stroke-dasharray="3 2"
    />

    <!-- Event circle -->
    <circle
      :cx="node.x" :cy="node.y"
      r="18"
      :fill="isSelected ? '#f1f3f5' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#495057'"
      stroke-width="1.5"
    />

    <!-- Probability text inside -->
    <text
      :x="node.x"
      :y="node.y + 1"
      text-anchor="middle"
      dominant-baseline="middle"
      class="event-prob-text"
    >{{ probLabel }}</text>

    <!-- Name label below -->
    <text
      :x="node.x"
      :y="node.y + 30"
      text-anchor="middle"
      class="event-name-text"
    >{{ node.name }}</text>

    <!-- Connection point indicator (top) -->
    <circle
      :cx="node.x" :cy="node.y - 18"
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
const connectMode = computed(() => store.connectMode)

const probLabel = computed(() => {
  const p = props.node.probability ?? 0
  if (p === 0) return '0'
  if (p < 0.001) return p.toExponential(1)
  return p.toFixed(3)
})

let dragStart = null

function onClick() {
  if (store.connectMode) {
    onConnPointClick()
    return
  }
  store.selectNode(props.node.id, 'event')
}

function onMouseEnter(e) {
  store.showTooltip(e.clientX + 12, e.clientY + 12, props.node.name, 'Event', props.node.probability)
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
  store.selectNode(props.node.id, 'event')
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
    y: Math.round((dragStart.oy + dy) / 30) * 30
  })
}

function onDragEnd() {
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}
</script>

<style scoped>
.cft-event-node {
  cursor: grab;
}
.cft-event-node:active {
  cursor: grabbing;
}
.event-prob-text {
  font-size: 10px;
  font-weight: 500;
  font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
  fill: var(--color-text-secondary);
  pointer-events: none;
  user-select: none;
}
.event-name-text {
  font-size: 11px;
  font-weight: 500;
  fill: var(--color-text-primary);
  font-family: var(--font-sans);
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
