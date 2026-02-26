<template>
  <div
    ref="canvasEl"
    class="diagram-canvas flex-1 overflow-hidden relative"
    style="background: var(--color-canvas)"
    @mousedown="onCanvasMouseDown"
    @wheel.prevent="onWheel"
    @click="onCanvasClick"
  >
    <!-- Dot grid background -->
    <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid-dots" :x="pan.x % (gridSize * zoom)" :y="pan.y % (gridSize * zoom)"
          :width="gridSize * zoom" :height="gridSize * zoom" patternUnits="userSpaceOnUse">
          <circle :cx="gridSize * zoom / 2" :cy="gridSize * zoom / 2" r="1" fill="#dee2e6"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-dots)"/>
    </svg>

    <!-- Main SVG canvas -->
    <svg
      class="absolute inset-0 w-full h-full"
      :style="{ cursor: isPanning ? 'grabbing' : 'default' }"
    >
      <defs>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
        <!-- Interface connections (rendered below components) -->
        <ConnectionLine
          v-for="iface in store.interfaces"
          :key="iface.id"
          :iface="iface"
        />

        <!-- Root-level components -->
        <ComponentNode
          v-for="comp in store.rootComponents"
          :key="comp.id"
          :comp="comp"
        />
      </g>
    </svg>

    <!-- Empty state hint -->
    <transition name="fade">
      <div v-if="store.components.length === 0" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" class="mb-4 opacity-40 mx-auto">
            <rect x="4" y="12" width="28" height="22" rx="4" stroke="#495057" stroke-width="2"/>
            <rect x="1" y="17" width="6" height="5" rx="1" fill="#495057" opacity="0.6"/>
            <rect x="1" y="24" width="6" height="5" rx="1" fill="#495057" opacity="0.6"/>
            <circle cx="40" cy="23" r="7" stroke="#495057" stroke-width="2"/>
            <line x1="32" y1="23" x2="33" y2="23" stroke="#495057" stroke-width="2"/>
          </svg>
          <p class="text-text-muted text-sm font-medium">Your canvas is empty</p>
          <p class="text-text-muted text-xs mt-1 opacity-60">Click <span class="text-accent font-semibold">Add Component</span> in the toolbar to start</p>
        </div>
      </div>
    </transition>

    <!-- Zoom controls -->
    <div class="absolute bottom-4 right-4 flex flex-col gap-1">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <button class="zoom-btn text-xs" @click="resetZoom" title="Reset zoom">⟳</button>
      <button class="zoom-btn" @click="zoomOut" title="Zoom out">−</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'
import ComponentNode from './ComponentNode.vue'
import ConnectionLine from './ConnectionLine.vue'

const store = useDiagramStore()
const canvasEl = ref(null)

const zoom = ref(1)
const pan = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
const gridSize = 30

// Expose zoom globally so ComponentNode can access it for drag scaling
function updateGlobalZoom() {
  window.__archrelZoom = zoom.value
}
updateGlobalZoom()

function onCanvasClick(e) {
  // Deselect when clicking canvas background (but not after panning)
  if (didPan) { didPan = false; return }
  if (e.target === canvasEl.value || e.target.tagName === 'svg') {
    store.deselect()
  }
}

// Pan
let panStart = null
let didPan = false
function onCanvasMouseDown(e) {
  // Left-click on canvas background, middle-click anywhere, or Alt+left-click
  const isCanvasBg = e.target === canvasEl.value || e.target.tagName === 'svg' || e.target.tagName === 'rect' && e.target.getAttribute('fill')?.startsWith('url(')
  if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isCanvasBg)) {
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
  // Zoom towards cursor
  pan.x = mx - (mx - pan.x) * (newZoom / zoom.value)
  pan.y = my - (my - pan.y) * (newZoom / zoom.value)
  zoom.value = newZoom
  updateGlobalZoom()
}
function zoomIn()    { zoom.value = Math.min(3, zoom.value * 1.2); updateGlobalZoom() }
function zoomOut()   { zoom.value = Math.max(0.2, zoom.value / 1.2); updateGlobalZoom() }
function resetZoom() { zoom.value = 1; pan.x = 0; pan.y = 0; updateGlobalZoom() }

// Keyboard shortcuts
function onKeyDown(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement.tagName === 'INPUT') return
    if (store.selectedType === 'component') store.removeComponent(store.selectedId)
    else if (store.selectedType === 'interface') store.removeInterface(store.selectedId)
  }
  if (e.key === 'Escape') store.deselect()
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// Expose zoom for parent
defineExpose({ zoom })
</script>

<style scoped>
.diagram-canvas {
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
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
