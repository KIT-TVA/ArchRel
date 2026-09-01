<template>
  <div
    ref="canvasEl"
    class="diagram-canvas flex-1 overflow-hidden relative"
    style="background: var(--color-canvas)"
    @mousedown="onCanvasMouseDown"
    @wheel.prevent="onWheel"
    @click="onCanvasClick"
  >
    <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid-dots" :x="pan.x % (gridSize * zoom)" :y="pan.y % (gridSize * zoom)"
          :width="gridSize * zoom" :height="gridSize * zoom" patternUnits="userSpaceOnUse">
          <circle :cx="gridSize * zoom / 2" :cy="gridSize * zoom / 2" r="1" fill="#dee2e6"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-dots)"/>
    </svg>

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
        <ComponentNode
          v-for="comp in store.rootComponents"
          :key="comp.id"
          :comp="comp"
        />

        <ConnectionLine
          v-for="iface in store.interfaces"
          :key="iface.id"
          :iface="iface"
        />
      </g>
    </svg>

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

    <div class="absolute bottom-4 right-4 flex flex-col gap-1">
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <button class="zoom-btn text-xs" @click="resetZoom" title="Reset zoom">⟳</button>
      <button class="zoom-btn" @click="zoomOut" title="Zoom out">−</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'
import ComponentNode from './ComponentNode.vue'
import ConnectionLine from './ConnectionLine.vue'

const store = useDiagramStore()
const canvasEl = ref<HTMLElement | null>(null)

const zoom = ref(1)
const pan = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
const gridSize = 30

function updateGlobalZoom() {
  ;(window as any).__archrelZoom = zoom.value
}
updateGlobalZoom()

let didPan = false
function onCanvasClick(e: MouseEvent) {
  if (didPan) { didPan = false; return }
  const target = e.target as HTMLElement
  if (target === canvasEl.value || target.tagName === 'svg') {
    store.deselect()
  }
}

let panStart: { mx: number; my: number; px: number; py: number } | null = null
function onCanvasMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  const isCanvasBg = target === canvasEl.value || target.tagName === 'svg' || (target.tagName === 'rect' && target.getAttribute('fill')?.startsWith('url('))
  if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isCanvasBg)) {
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
function zoomIn()    { zoom.value = Math.min(3, zoom.value * 1.2); updateGlobalZoom() }
function zoomOut()   { zoom.value = Math.max(0.2, zoom.value / 1.2); updateGlobalZoom() }
function resetZoom() { zoom.value = 1; pan.x = 0; pan.y = 0; updateGlobalZoom() }

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if ((document.activeElement as HTMLElement)?.tagName === 'INPUT') return
    if (store.selectedType === 'component') store.removeComponent(store.selectedId!)
    else if (store.selectedType === 'interface') store.removeInterface(store.selectedId!)
  }
  if (e.key === 'Escape') store.deselect()
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

defineExpose({ zoom })
</script>

<style scoped>
.diagram-canvas { min-height: 0; }
</style>
