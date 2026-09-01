<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="store.activeComponentId" class="fixed inset-0 z-50 flex flex-col bg-canvas" @keydown.escape.stop="onEscape">
        <CftToolbar @close="tryClose" />
        <div class="flex flex-1 min-h-0">
          <CftCanvas />
          <CftPropertiesPanel />
        </div>
      </div>
    </transition>
  </Teleport>

  <Teleport to="body">
    <div v-if="showCftErrorModal && cftValidationReason"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showCftErrorModal = false" @keydown.escape="showCftErrorModal = false">
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.5)">
        <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
          <div class="flex items-center gap-3 text-danger">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" transform="rotate(45 8 8)" />
            </svg>
            <span class="font-semibold text-text-primary text-base">CFT Validation Failed</span>
          </div>
          <button class="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer text-lg leading-none" @click="showCftErrorModal = false">✕</button>
        </div>
        <div class="flex-1 overflow-auto p-6">
          <p class="text-[13px] text-text-secondary mb-4">{{ cftValidationDefinition }}</p>
          <p class="text-[13px] text-danger">{{ cftValidationReason }}</p>
        </div>
        <div class="px-6 py-4 border-t border-panel-border flex justify-end">
          <button
            class="px-4 py-2 rounded-lg border border-panel-border bg-canvas text-text-secondary text-sm font-medium hover:bg-surface-hover cursor-pointer transition-all"
            @click="showCftErrorModal = false">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCftStore, SYSTEM_CFT_KEY } from '../../stores/cft.js'
import CftToolbar from './CftToolbar.vue'
import CftCanvas from './CftCanvas.vue'
import CftPropertiesPanel from './CftPropertiesPanel.vue'

const store = useCftStore()

const showCftErrorModal = ref(false)
const cftValidationReason = ref<string | null>(null)
const cftValidationDefinition = ref<string>('')

function tryClose() {
  if (!store.activeComponentId) { store.closeCft(); return }
  if (store.activeComponentId === SYSTEM_CFT_KEY) { store.closeCft(); return }
  const result = store.validateCft(store.activeComponentId)
  if (!result.ok) {
    cftValidationReason.value = result.reason
    cftValidationDefinition.value = result.definition
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
.modal-fade-enter-active { transition: opacity 0.25s ease; }
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
