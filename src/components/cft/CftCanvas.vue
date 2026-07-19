<template>
  <div
    ref="canvasEl"
    class="cft-canvas flex-1 overflow-hidden relative"
    style="background: var(--color-canvas)"
    @mousedown="onCanvasMouseDown"
    @wheel.prevent="onWheel"
    @click="onCanvasClick"
  >
    <!-- Dot grid background -->
    <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="cft-grid-dots" :x="pan.x % (gridSize * zoom)" :y="pan.y % (gridSize * zoom)"
          :width="gridSize * zoom" :height="gridSize * zoom" patternUnits="userSpaceOnUse">
          <circle :cx="gridSize * zoom / 2" :cy="gridSize * zoom / 2" r="1" fill="#dee2e6"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cft-grid-dots)"/>
    </svg>

    <!-- Main SVG canvas -->
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
        <!-- Sub-component references -->
        <g v-for="sc in store.activeSubComponents" :key="sc.id">
          <g class="cft-subcomp" @mousedown.stop="onSubCompMouseDown($event, sc)" @click.stop="onSubCompClick(sc)" @dblclick.stop="onSubCompDblClick(sc)">
            <!-- Selection ring -->
            <rect
              v-if="store.selectedNodeId === sc.id"
              :x="sc.x - 3" :y="sc.y - 3"
              :width="sc.width + 6" :height="sc.height + 6"
              rx="5"
              fill="none"
              stroke="#495057"
              stroke-width="1.5"
              opacity="0.4"
              stroke-dasharray="3 2"
            />
            <!-- Sub-component rectangle -->
            <rect
              :x="sc.x" :y="sc.y"
              :width="sc.width" :height="sc.height"
              rx="4"
              :fill="store.selectedNodeId === sc.id ? '#f1f3f5' : '#ffffff'"
              :stroke="store.selectedNodeId === sc.id ? '#212529' : '#868e96'"
              stroke-width="1.5"
              stroke-dasharray="6 3"
            />
            <!-- Stereotype -->
            <text
              :x="sc.x + sc.width / 2"
              :y="sc.y + 16"
              text-anchor="middle"
              class="sc-stereotype-text"
            >«sub»</text>
            <!-- Name -->
            <text
              :x="sc.x + sc.width / 2"
              :y="sc.y + sc.height / 2 + 5"
              text-anchor="middle"
              class="sc-name-text"
            >{{ getSubCompName(sc) }}</text>
            <!-- Connection points (top = outputs, distributed) -->
            <g
              v-for="(port, i) in getSubCompPorts(sc).outputs"
              :key="'out-' + i"
              class="sc-port-group"
              @mouseenter="showTooltip($event, sc, port, 'output')"
              @mouseleave="hideTooltip"
              @mousemove="moveTooltip"
            >
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).outputs.length + 1)"
                :cy="sc.y"
                r="3"
                :fill="store.connectMode ? '#198754' : '#adb5bd'"
                :stroke="store.connectMode ? '#198754' : '#868e96'"
                stroke-width="1"
                class="conn-point"
              />
              <!-- Hit area for hover/click -->
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).outputs.length + 1)"
                :cy="sc.y"
                r="8"
                fill="transparent"
                style="cursor: crosshair"
                @click.stop="onSubCompConnClick(sc, port.index, 'output')"
              />
              <!-- maxf label above output connection point -->
              <text
                v-if="getScMaxf(sc) !== null"
                :x="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).outputs.length + 1)"
                :y="sc.y - 6"
                text-anchor="middle"
                class="sc-maxf-text"
              >M: {{ getScMaxf(sc).toFixed(4) }}</text>
            </g>
            <!-- Connection points (bottom = inputs, distributed) -->
            <g 
              v-for="(port, i) in getSubCompPorts(sc).inputs" 
              :key="'in-' + i" 
              class="sc-port-group"
              @mouseenter="showTooltip($event, sc, port, 'input')"
              @mouseleave="hideTooltip"
              @mousemove="moveTooltip"
            >
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).inputs.length + 1)"
                :cy="sc.y + sc.height"
                r="3"
                :fill="store.connectMode ? '#198754' : '#adb5bd'"
                :stroke="store.connectMode ? '#198754' : '#868e96'"
                stroke-width="1"
                class="conn-point"
              />
              <!-- Hit area for hover/click -->
              <circle
                :cx="sc.x + sc.width * (i + 1) / (getSubCompPorts(sc).inputs.length + 1)"
                :cy="sc.y + sc.height"
                r="8"
                fill="transparent"
                style="cursor: crosshair"
                @click.stop="onSubCompConnClick(sc, port.index, 'input')"
              />
            </g>
          </g>
        </g>

        <!-- Gate nodes -->
        <CftGateNode
          v-for="gate in store.activeGates"
          :key="gate.id"
          :gate="gate"
        />

        <!-- Event nodes -->
        <CftEventNode
          v-for="node in store.activeEvents"
          :key="node.id"
          :node="node"
        />

        <!-- Port nodes -->
        <CftPortNode
          v-for="node in [...store.activeInputPorts, ...store.activeOutputPorts]"
          :key="node.id"
          :node="node"
        />

        <!-- Edges (rendered on top) -->
        <CftEdge
          v-for="edge in store.activeEdges"
          :key="edge.id"
          :edge="edge"
        />
      </g>
    </svg>

    <!-- Empty state hint -->
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

    <!-- Zoom controls -->
    <div class="absolute bottom-4 right-4 flex flex-col gap-1">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <button class="zoom-btn text-xs" @click="resetZoom" title="Reset zoom">⟳</button>
      <button class="zoom-btn" @click="zoomOut" title="Zoom out">−</button>
    </div>

    <!-- Connect mode indicator -->
    <transition name="fade">
      <div v-if="store.connectMode" class="absolute top-4 left-1/2 -translate-x-1/2 bg-panel border border-accent-muted rounded-full px-4 py-1.5 text-xs text-accent-hover font-medium shadow-lg flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
        {{ store.connectSourceId ? 'Click target element...' : 'Click source element...' }}
        <button class="ml-2 text-text-muted hover:text-danger text-xs" @click="store.cancelConnect()">✕</button>
      </div>
    </transition>

    <!-- Cursor Tooltip -->
    <div
      v-if="store.tooltip.visible"
      class="cft-tooltip fixed pointer-events-none z-[9999] bg-panel border border-panel-border rounded shadow-xl px-2 py-1.5 min-w-[130px]"
      :style="{ left: store.tooltip.x + 'px', top: store.tooltip.y + 'px' }"
    >
      <div class="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-0.5">{{ store.tooltip.side }} Port</div>
      <div class="text-xs font-semibold text-text-primary">{{ store.tooltip.name }}</div>
      <div v-if="store.tooltip.probability !== null" class="mt-1 pt-1 border-t border-panel-border flex items-center justify-between gap-4">
        <span class="text-[10px] text-text-muted uppercase">Prob:</span>
        <span class="text-[10px] font-mono text-accent font-bold">{{ formatProb(store.tooltip.probability) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useCftStore } from '../../stores/cft.js'
import { useDiagramStore } from '../../stores/diagram.js'
import CftGateNode from './CftGateNode.vue'
import CftEventNode from './CftEventNode.vue'
import CftPortNode from './CftPortNode.vue'
import CftEdge from './CftEdge.vue'

const store = useCftStore()
const diagramStore = useDiagramStore()
const canvasEl = ref(null)

const zoom = ref(1)
const pan = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
const gridSize = 30

const isEmpty = computed(() => {
  const cft = store.activeCft
  if (!cft) return true
  return cft.nodes.length === 0 && cft.gates.length === 0 && cft.subComponents.length === 0
})

// Expose zoom globally for CFT drag handlers
function updateGlobalZoom() {
  window.__cftZoom = zoom.value
}
updateGlobalZoom()

function getSubCompName(sc) {
  const comp = diagramStore.components.find(c => c.id === sc.refComponentId)
  return comp ? comp.name : sc.name
}

function getSubCompPorts(sc) {
  return store.getSubComponentPorts(sc.id)
}

function getScMaxf(sc) {
  return diagramStore.slotMaxfMap?.[sc.id] ?? null
}

function formatProb(p) {
  if (p === 0) return '0'
  if (p < 0.0001) return p.toExponential(2)
  return p.toFixed(4)
}

function showTooltip(e, sc, port, side) {
  // Pass the current component as the parent context for hierarchical evaluation
  const context = [{ scId: sc.id, cftId: store.activeComponentId }]
  const prob = store.evaluateProbability(sc.refComponentId, port.id, 0, context)
  store.showTooltip(e.clientX + 12, e.clientY + 12, port.name, side, prob)
}

function hideTooltip() {
  store.hideTooltip()
}

function moveTooltip(e) {
  store.moveTooltip(e.clientX + 12, e.clientY + 12)
}

function onCanvasClick(e) {
  if (didPan) { didPan = false; return }
  if (e.target === canvasEl.value || e.target.tagName === 'svg' || (e.target.tagName === 'rect' && e.target.getAttribute('fill')?.startsWith('url('))) {
    store.deselect()
    if (store.connectMode) {
      store.cancelConnect()
    }
  }
}

// Pan
let panStart = null
let didPan = false
function onCanvasMouseDown(e) {
  const isCanvasBg = e.target === canvasEl.value || e.target.tagName === 'svg' || (e.target.tagName === 'rect' && e.target.getAttribute('fill')?.startsWith('url('))
  if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isCanvasBg && !store.connectMode)) {
    isPanning.value = true
    didPan = false
    panStart = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    window.addEventListener('mousemove', onPanMove)
    window.addEventListener('mouseup', onPanEnd)
    e.preventDefault()
  }
}
function onPanMove(e) {
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

// Zoom
function onWheel(e) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const rect = canvasEl.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const newZoom = Math.min(3, Math.max(0.2, zoom.value * delta))
  pan.x = mx - (mx - pan.x) * (newZoom / zoom.value)
  pan.y = my - (my - pan.y) * (newZoom / zoom.value)
  zoom.value = newZoom
  updateGlobalZoom()
}
function zoomIn()    { zoom.value = Math.min(3, zoom.value * 1.2); updateGlobalZoom() }
function zoomOut()   { zoom.value = Math.max(0.2, zoom.value / 1.2); updateGlobalZoom() }
function resetZoom() { zoom.value = 1; pan.x = 0; pan.y = 0; updateGlobalZoom() }

// Sub-component drag
let scDragStart = null
function onSubCompClick(sc) {
  if (store.connectMode) return
  store.selectNode(sc.id, 'subComponent')
}
function onSubCompDblClick(sc) {
  if (store.connectMode) return
  store.openCft(sc.refComponentId)
}
function onSubCompConnClick(sc, portIndex = 0, side = 'input') {
  if (!store.connectMode) return
  if (!store.connectSourceId) {
    store.setConnectSource(sc.id, portIndex)
  } else {
    store.addEdge(store.connectSourceId, sc.id, store.connectSourcePort, portIndex)
  }
}
function onSubCompMouseDown(e, sc) {
  if (e.button !== 0 || store.connectMode) return
  store.selectNode(sc.id, 'subComponent')
  scDragStart = {
    mx: e.clientX,
    my: e.clientY,
    ox: sc.x,
    oy: sc.y,
  }
  window.addEventListener('mousemove', onSubCompDragMove)
  window.addEventListener('mouseup', onSubCompDragEnd)
  e.preventDefault()
}
function onSubCompDragMove(e) {
  if (!scDragStart) return
  const z = window.__cftZoom ?? 1
  const dx = (e.clientX - scDragStart.mx) / z
  const dy = (e.clientY - scDragStart.my) / z
  const sc = store.activeSubComponents.find(s => s.id === store.selectedNodeId)
  if (sc) {
    store.updateSubComponent(sc.id, { 
      x: Math.round((scDragStart.ox + dx) / 30) * 30, 
      y: Math.round((scDragStart.oy + dy) / 30) * 30 
    })
  }
}
function onSubCompDragEnd() {
  scDragStart = null
  window.removeEventListener('mousemove', onSubCompDragMove)
  window.removeEventListener('mouseup', onSubCompDragEnd)
}

// Keyboard shortcuts
function onKeyDown(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return
    store.removeSelected()
  }
  if (e.key === 'Escape') {
    if (store.connectMode) {
      store.cancelConnect()
    } else {
      store.deselect()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  delete window.__cftZoom
})
</script>

<style scoped>
.cft-canvas {
  min-height: 0;
}
.empty-state {
  text-align: center;
  padding: 32px;
  border-radius: 16px;
  border: 1px dashed #dee2e6;
  background: rgba(248, 249, 250, 0.8);
}
.zoom-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-panel-border);
  background: var(--color-panel);
  color: var(--color-text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.zoom-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
  border-color: var(--color-accent-muted);
}
.sc-stereotype-text {
  font-size: 9px;
  font-style: italic;
  fill: var(--color-text-muted);
  font-family: var(--font-sans);
  pointer-events: none;
  user-select: none;
}
.sc-name-text {
  font-size: 12px;
  font-weight: 600;
  fill: var(--color-text-primary);
  font-family: var(--font-sans);
  pointer-events: none;
  user-select: none;
}
.sc-maxf-text {
  font-size: 9px;
  font-weight: 500;
  fill: var(--color-success);
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
.cft-subcomp {
  cursor: grab;
}
.cft-subcomp:active {
  cursor: grabbing;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
