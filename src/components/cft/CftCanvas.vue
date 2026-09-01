<template>
  <div
    ref="canvasEl"
    class="cft-canvas flex-1 overflow-hidden relative"
    style="background: var(--color-canvas)"
    @mousedown="onCanvasMouseDown"
    @wheel.prevent="onWheel"
    @click="onCanvasClick"
  >
    <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="cft-grid-dots" :x="pan.x % (gridSize * zoom)" :y="pan.y % (gridSize * zoom)"
          :width="gridSize * zoom" :height="gridSize * zoom" patternUnits="userSpaceOnUse">
          <circle :cx="gridSize * zoom / 2" :cy="gridSize * zoom / 2" r="1" fill="#dee2e6"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cft-grid-dots)"/>
    </svg>

    <svg
      class="absolute inset-0 w-full h-full"
      :style="{ cursor: isPanning ? 'grabbing' : (store.connectMode ? 'crosshair' : 'default') }"
    >
      <defs>
        <filter id="cft-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
        <g v-for="sc in store.activeSubComponents" :key="sc.id">
          <g class="cft-subcomp" @mousedown.stop="onSubCompMouseDown($event, sc)" @click.stop="onSubCompClick(sc)" @dblclick.stop="onSubCompDblClick(sc)">
            <rect v-if="store.selectedNodeId === sc.id"
              :x="sc.x - 3" :y="sc.y - 3" :width="sc.width + 6" :height="sc.height + 6"
              rx="5" fill="none" stroke="#495057" stroke-width="1.5" opacity="0.4" stroke-dasharray="3 2"/>
            <rect :x="sc.x" :y="sc.y" :width="sc.width" :height="sc.height"
              rx="4" :fill="store.selectedNodeId === sc.id ? '#f1f3f5' : '#ffffff'"
              :stroke="store.selectedNodeId === sc.id ? '#212529' : '#868e96'"
              stroke-width="1.5" stroke-dasharray="6 3"/>
            <text :x="sc.x + sc.width / 2" :y="sc.y + 16" text-anchor="middle" class="sc-stereotype-text">«sub»</text>
            <text :x="sc.x + sc.width / 2" :y="sc.y + sc.height / 2 + 5" text-anchor="middle" class="sc-name-text">{{ getSubCompName(sc) }}</text>

            <g v-for="(port, i) in getSubCompPorts(sc).outputs" :key="'out-' + i"
              class="sc-port-group"
              @mouseenter="showScTooltip($event, sc, port)"
              @mouseleave="hideTooltip"
              @mousemove="moveTooltip">
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).outputs.length + 1)"
                :cy="sc.y" r="3"
                :fill="store.connectMode ? '#198754' : '#adb5bd'"
                :stroke="store.connectMode ? '#198754' : '#868e96'"
                stroke-width="1" class="conn-point"/>
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).outputs.length + 1)"
                :cy="sc.y" r="8" fill="transparent" style="cursor: crosshair"
                @click.stop="onSubCompConnClick(sc, port.index, 'output')"/>
              <text v-if="getScMaxf(sc) !== null"
                :x="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).outputs.length + 1)"
                :y="sc.y - 6" text-anchor="middle" class="sc-maxf-text">
                M: {{ formatProb(getScMaxf(sc)!) }}
              </text>
            </g>
            <g v-for="(port, i) in getSubCompPorts(sc).inputs" :key="'in-' + i" class="sc-port-group">
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).inputs.length + 1)"
                :cy="sc.y + sc.height" r="3"
                :fill="store.connectMode ? '#198754' : '#adb5bd'"
                :stroke="store.connectMode ? '#198754' : '#868e96'"
                stroke-width="1" class="conn-point"/>
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).inputs.length + 1)"
                :cy="sc.y + sc.height" r="8" fill="transparent" style="cursor: crosshair"
                @click.stop="onSubCompConnClick(sc, port.index, 'input')"/>
            </g>
          </g>
        </g>

        <CftGateNode v-for="gate in store.activeGates" :key="gate.id" :gate="gate"/>
        <CftEventNode v-for="node in store.activeEvents" :key="node.id" :node="node"/>
        <CftPortNode v-for="node in [...store.activeInputPorts, ...store.activeOutputPorts]" :key="node.id" :node="node"/>
        <CftEdge v-for="edge in store.activeEdges" :key="edge.id" :edge="edge"/>
      </g>
    </svg>

    <transition name="fade">
      <div v-if="isEmpty" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" class="mb-4 opacity-40 mx-auto">
            <rect x="6" y="6" width="36" height="36" rx="6" stroke="#495057" stroke-width="2" stroke-dasharray="6 3"/>
            <rect x="17" y="12" width="14" height="8" rx="2" stroke="#495057" stroke-width="1.5"/>
            <line x1="24" y1="20" x2="24" y2="26" stroke="#495057" stroke-width="1.5"/>
            <circle cx="24" cy="30" r="4" stroke="#495057" stroke-width="1.5"/>
          </svg>
          <p class="text-text-muted text-sm font-medium">Empty fault tree</p>
          <p class="text-text-muted text-xs mt-1 opacity-60">Add <span class="text-accent font-semibold">events</span>, <span class="text-accent font-semibold">gates</span>, and <span class="text-accent font-semibold">ports</span> using the toolbar</p>
        </div>
      </div>
    </transition>

    <div class="absolute bottom-4 right-4 flex flex-col gap-1">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <button class="zoom-btn text-xs" @click="resetZoom" title="Reset zoom">⟳</button>
      <button class="zoom-btn" @click="zoomOut" title="Zoom out">−</button>
    </div>

    <transition name="fade">
      <div v-if="store.connectMode" class="absolute top-4 left-1/2 -translate-x-1/2 bg-panel border border-accent-muted rounded-full px-4 py-1.5 text-xs text-accent-hover font-medium shadow-lg flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
        {{ store.connectSourceId ? 'Click target element...' : 'Click source element...' }}
        <button class="ml-2 text-text-muted hover:text-danger text-xs" @click="store.cancelConnect()">✕</button>
      </div>
    </transition>

    <div
      v-if="store.tooltip.visible"
      class="cft-tooltip fixed pointer-events-none z-[9999] bg-panel border border-panel-border rounded-lg shadow-xl px-3 py-2 min-w-[140px]"
      :style="{ left: store.tooltip.x + 'px', top: store.tooltip.y + 'px' }"
    >
      <div class="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-0.5">{{ store.tooltip.side }} Port</div>
      <div class="text-xs font-semibold text-text-primary">{{ store.tooltip.name }}</div>
      <div v-if="store.tooltip.probability !== null" class="mt-1 pt-1 border-t border-panel-border flex items-center justify-between gap-4">
        <span class="text-[10px] text-text-muted uppercase">Prob:</span>
        <span class="text-[10px] font-mono text-accent font-bold">{{ formatProb(store.tooltip.probability) }}</span>
      </div>
    </div>

    <div
      v-if="store.parentListPopup.visible"
      class="fixed z-[10000] bg-panel border border-panel-border rounded-xl shadow-2xl overflow-hidden min-w-[200px]"
      :style="{ left: store.parentListPopup.x + 'px', top: store.parentListPopup.y + 'px' }"
      @click.stop
    >
      <div class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-panel-border">
        Parent Components
      </div>
      <div class="p-1.5">
        <button
          v-for="parent in store.parentListPopup.parents"
          :key="parent.id"
          class="w-full text-left px-3 py-2 text-[13px] text-text-primary hover:bg-surface-hover rounded-lg cursor-pointer transition-colors"
          @click="openParentCft(parent.id)"
        >
          {{ parent.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useCftStore } from '../../stores/cft.js'
import { useDiagramStore } from '../../stores/diagram.js'
import { formatProb } from '../../utils/format.js'
import CftGateNode from './CftGateNode.vue'
import CftEventNode from './CftEventNode.vue'
import CftPortNode from './CftPortNode.vue'
import CftEdge from './CftEdge.vue'

const store = useCftStore()
const diagramStore = useDiagramStore()
const canvasEl = ref<HTMLElement | null>(null)

const zoom = ref(1)
const pan = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
const gridSize = 30

const isEmpty = computed(() => {
  const cft = store.activeCft
  if (!cft) return true
  return cft.nodes.length === 0 && cft.gates.length === 0 && cft.subComponents.length === 0
})

function updateGlobalZoom() {
  ;(window as any).__cftZoom = zoom.value
}
updateGlobalZoom()

function getSubCompName(sc: { refComponentId: string; name: string }) {
  const comp = diagramStore.components.find(c => c.id === sc.refComponentId)
  return comp ? comp.name : sc.name
}

function getSubCompPorts(sc: { id: string }) {
  return store.getSubComponentPorts(sc.id)
}

function getScMaxf(sc: { id: string }): number | null {
  return diagramStore.slotMaxfMap?.[sc.id] ?? null
}

function showScTooltip(e: MouseEvent, sc: { refComponentId: string }, port: { name: string }) {
  const prob = store.evaluateOutputProbability(sc.refComponentId)
  store.showTooltip(e.clientX + 12, e.clientY + 12, port.name, 'output', prob)
}

function hideTooltip() { store.hideTooltip() }
function moveTooltip(e: MouseEvent) { store.moveTooltip(e.clientX + 12, e.clientY + 12) }

let didPan = false
function onCanvasClick(e: MouseEvent) {
  if (store.parentListPopup.visible) { store.hideParentListPopup(); return }
  if (didPan) { didPan = false; return }
  const target = e.target as HTMLElement
  if (target === canvasEl.value || target.tagName === 'svg' || (target.tagName === 'rect' && target.getAttribute('fill')?.startsWith('url('))) {
    store.deselect()
    if (store.connectMode) store.cancelConnect()
  }
}

function openParentCft(parentId: string) {
  store.hideParentListPopup()
  store.openCft(parentId)
}

let panStart: { mx: number; my: number; px: number; py: number } | null = null
function onCanvasMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  const isCanvasBg = target === canvasEl.value || target.tagName === 'svg' || (target.tagName === 'rect' && target.getAttribute('fill')?.startsWith('url('))
  if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isCanvasBg && !store.connectMode)) {
    isPanning.value = true
    didPan = false
    panStart = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    window.addEventListener('mousemove', onPanMove)
    window.addEventListener('mouseup', onPanEnd)
    e.preventDefault()
  }
}
function onPanMove(e: MouseEvent) {
  if (!panStart) return
  didPan = true
  pan.x = panStart.px + (e.clientX - panStart.mx)
  pan.y = panStart.py + (e.clientY - panStart.my)
}
function onPanEnd() {
  isPanning.value = false
  panStart = null
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const rect = canvasEl.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const newZoom = Math.min(3, Math.max(0.2, zoom.value * delta))
  pan.x = mx - (mx - pan.x) * (newZoom / zoom.value)
  pan.y = my - (my - pan.y) * (newZoom / zoom.value)
  zoom.value = newZoom
  updateGlobalZoom()
}
function zoomIn() { zoom.value = Math.min(3, zoom.value * 1.2); updateGlobalZoom() }
function zoomOut() { zoom.value = Math.max(0.2, zoom.value / 1.2); updateGlobalZoom() }
function resetZoom() { zoom.value = 1; pan.x = 0; pan.y = 0; updateGlobalZoom() }

function onSubCompClick(sc: { id: string }) {
  if (store.connectMode) return
  store.selectNode(sc.id, 'subComponent')
}
function onSubCompDblClick(sc: { refComponentId: string }) {
  if (store.connectMode) return
  store.openCft(sc.refComponentId)
}
function onSubCompConnClick(sc: { id: string }, portIndex = 0, side = 'input') {
  if (!store.connectMode) return
  if (!store.connectSourceId) {
    store.setConnectSource(sc.id, portIndex)
  } else {
    store.addEdge(store.connectSourceId, sc.id, store.connectSourcePort, portIndex)
  }
}

let scDragStart: { mx: number; my: number; ox: number; oy: number } | null = null
function onSubCompMouseDown(e: MouseEvent, sc: { id: string; x: number; y: number }) {
  if (e.button !== 0 || store.connectMode) return
  store.selectNode(sc.id, 'subComponent')
  scDragStart = { mx: e.clientX, my: e.clientY, ox: sc.x, oy: sc.y }
  window.addEventListener('mousemove', onSubCompDragMove)
  window.addEventListener('mouseup', onSubCompDragEnd)
  e.preventDefault()
}
function onSubCompDragMove(e: MouseEvent) {
  if (!scDragStart) return
  const z = (window as any).__cftZoom ?? 1
  const dx = (e.clientX - scDragStart.mx) / z
  const dy = (e.clientY - scDragStart.my) / z
  const sc = store.activeSubComponents.find(s => s.id === store.selectedNodeId)
  if (sc) {
    store.updateSubComponent(sc.id, {
      x: Math.round((scDragStart.ox + dx) / 30) * 30,
      y: Math.round((scDragStart.oy + dy) / 30) * 30,
    })
  }
}
function onSubCompDragEnd() {
  scDragStart = null
  window.removeEventListener('mousemove', onSubCompDragMove)
  window.removeEventListener('mouseup', onSubCompDragEnd)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const el = document.activeElement as HTMLElement
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return
    store.removeSelected()
  }
  if (e.key === 'Escape') {
    if (store.parentListPopup.visible) { store.hideParentListPopup(); return }
    if (store.connectMode) store.cancelConnect()
    else store.deselect()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  delete (window as any).__cftZoom
})
</script>

<style scoped>
.cft-canvas { min-height: 0; }
.sc-stereotype-text { font-size: 9px; font-style: italic; fill: var(--color-text-muted); font-family: var(--font-sans); pointer-events: none; user-select: none; }
.sc-name-text { font-size: 12px; font-weight: 600; fill: var(--color-text-primary); font-family: var(--font-sans); pointer-events: none; user-select: none; }
.sc-maxf-text { font-size: 9px; font-weight: 500; fill: var(--color-success); font-family: var(--font-mono, monospace); pointer-events: none; user-select: none; }
.conn-point { cursor: crosshair; transition: r 0.15s; }
.conn-point:hover { r: 5; }
.cft-subcomp { cursor: grab; }
.cft-subcomp:active { cursor: grabbing; }
</style>
