<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="store.activeComponentId" class="fixed inset-0 z-50 flex flex-col bg-canvas" @keydown.escape.stop="onEscape">
        <!-- CFT Toolbar -->
        <CftToolbar />

        <!-- Main content: Canvas + Properties Panel -->
        <div class="flex flex-1 min-h-0">
          <CftCanvas />
          <CftPropertiesPanel />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { useCftStore } from '../../stores/cft.js'
import CftToolbar from './CftToolbar.vue'
import CftCanvas from './CftCanvas.vue'
import CftPropertiesPanel from './CftPropertiesPanel.vue'

const store = useCftStore()

function onEscape() {
  if (store.connectMode) {
    store.cancelConnect()
  } else if (store.selectedNodeId) {
    store.deselect()
  } else {
    store.closeCft()
  }
}
</script>

<style scoped>
/* Modal transition */
.modal-fade-enter-active {
  transition: opacity 0.25s ease;
}
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
