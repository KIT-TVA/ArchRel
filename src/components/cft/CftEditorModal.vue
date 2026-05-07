<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="store.activeComponentId" class="fixed inset-0 z-50 flex flex-col bg-canvas" @keydown.escape.stop="onEscape">
        <!-- CFT Toolbar -->
        <CftToolbar @close="tryClose" />

        <!-- Main content: Canvas + Properties Panel -->
        <div class="flex flex-1 min-h-0">
          <CftCanvas />
          <CftPropertiesPanel />
        </div>
      </div>
    </transition>
  </Teleport>

  <!-- CFT Validation Error modal -->
  <Teleport to="body">
    <div v-if="showCftErrorModal && cftValidationResult?.errors?.length"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showCftErrorModal = false" @keydown.escape="showCftErrorModal = false">
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.5)">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
          <div class="flex items-center gap-3 text-danger">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                transform="rotate(45 8 8)" />
            </svg>
            <span class="font-semibold text-text-primary text-base">CFT Validation Failed</span>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer text-lg leading-none"
            @click="showCftErrorModal = false">✕</button>
        </div>
        <!-- Content -->
        <div class="flex-1 overflow-auto p-6">
          <p class="text-[13px] text-text-secondary mb-4">
            The CFT cannot be closed because its computed failure probability exceeds the component's allocated maximum failure probability (maxf). Fix the fault tree and try again.
          </p>
          <ul class="list-disc pl-5 text-[13px] text-danger space-y-2">
            <li v-for="(error, i) in cftValidationResult.errors" :key="i">{{ error }}</li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useCftStore, SYSTEM_CFT_KEY } from '../../stores/cft.js'
import CftToolbar from './CftToolbar.vue'
import CftCanvas from './CftCanvas.vue'
import CftPropertiesPanel from './CftPropertiesPanel.vue'

const store = useCftStore()

const showCftErrorModal = ref(false)
const cftValidationResult = ref(null)

function tryClose() {
  // System CFT has no component to validate against
  if (store.activeComponentId === SYSTEM_CFT_KEY) {
    store.closeCft()
    return
  }
  const result = store.validateAgainstComponent(store.activeComponentId)
  if (!result.valid) {
    cftValidationResult.value = result
    showCftErrorModal.value = true
  } else {
    store.closeCft()
  }
}

function onEscape() {
  if (store.connectMode) {
    store.cancelConnect()
  } else if (store.selectedNodeId) {
    store.deselect()
  } else {
    tryClose()
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
