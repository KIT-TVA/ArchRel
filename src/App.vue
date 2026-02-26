<template>
  <div class="flex flex-col h-full">
    <AppToolbar :zoom="canvasZoom"/>
    <div class="flex flex-1 min-h-0">
      <DiagramCanvas ref="canvasRef" @zoom-change="canvasZoom = $event"/>
      <PropertiesPanel/>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import AppToolbar from './components/AppToolbar.vue'
import DiagramCanvas from './components/DiagramCanvas.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'

const canvasRef = ref(null)
const canvasZoom = ref(1)

// Poll zoom from canvas (simpler than an event)
watch(canvasRef, (canvas) => {
  if (!canvas) return
  setInterval(() => {
    canvasZoom.value = window.__archrelZoom ?? 1
  }, 100)
}, { immediate: false })
</script>
