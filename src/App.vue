<template>
  <div class="flex flex-col h-full">
    <AppToolbar :zoom="canvasZoom"/>
    <div class="flex flex-1 min-h-0">
      <DiagramCanvas ref="canvasRef" @zoom-change="canvasZoom = $event"/>
      <PropertiesPanel/>
    </div>

    <!-- CFT Editor (full-screen overlay) -->
    <CftEditorModal />

    <!-- maxf(S) prompt — mandatory on first load -->
    <Teleport to="body">
      <div
        v-if="store.maxFailureProbability === null"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        tabindex="-1"
      >
        <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[380px] flex flex-col"
          style="box-shadow: 0 24px 64px rgba(0,0,0,0.4)">
          <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
            <span class="font-semibold text-text-primary text-base">System Failure Budget</span>
          </div>
          <div class="p-6 flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">maxf(S) — max failure probability</label>
              <input
                ref="maxfInput"
                class="field-input font-mono"
                type="number"
                step="any"
                min="0"
                max="1"
                v-model.number="pendingMaxf"
                placeholder="e.g. 0.01"
                @keydown.enter="confirmMaxf"
              />
            </div>
          </div>
          <div class="px-6 pb-6 flex gap-3 justify-end">
            <button
              class="px-4 py-2 rounded-lg border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover cursor-pointer transition-all"
              @click="confirmMaxf">Confirm</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Component creation dialog -->
    <Teleport to="body">
      <div
        v-if="store.pendingComponentId"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @keydown.escape="cancelCreation"
        @click.self="cancelCreation"
        tabindex="-1"
        ref="dialogBackdrop"
      >
        <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[380px] flex flex-col"
          style="box-shadow: 0 24px 64px rgba(0,0,0,0.4)">
          <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
            <span class="font-semibold text-text-primary text-base">New Component</span>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer text-lg leading-none"
              @click="cancelCreation">✕</button>
          </div>
          <div class="p-6 flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Name</label>
              <input
                ref="nameInput"
                class="field-input"
                v-model="pendingName"
                placeholder="Component"
                @keydown.enter="confirmCreation"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Intrinsic Failure Rate f_own</label>
              <input
                class="field-input font-mono"
                type="number"
                step="any"
                min="0"
                max="1"
                v-model.number="pendingFailureRate"
                placeholder="0"
                @keydown.enter="confirmCreation"
              />
            </div>

            <div v-if="pendingComponentMaxf !== null" class="flex flex-col gap-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Allocated maxf</label>
              <div class="field-info font-mono">{{ pendingComponentMaxf.toFixed(4) }}</div>
            </div>
          </div>
          <div class="px-6 pb-6 flex gap-3 justify-end">
            <button
              class="px-4 py-2 rounded-lg border border-panel-border bg-canvas text-text-secondary text-sm font-medium hover:bg-surface-hover cursor-pointer transition-all"
              @click="cancelCreation">Cancel</button>
            <button
              class="px-4 py-2 rounded-lg border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover cursor-pointer transition-all"
              @click="confirmCreation">Confirm</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import AppToolbar from './components/AppToolbar.vue'
import DiagramCanvas from './components/DiagramCanvas.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import CftEditorModal from './components/cft/CftEditorModal.vue'
import { useDiagramStore } from './stores/diagram.js'

const store = useDiagramStore()

const canvasRef = ref(null)
const canvasZoom = ref(1)
const nameInput = ref(null)
const dialogBackdrop = ref(null)
const maxfInput = ref(null)

const pendingName = ref('Component')
const pendingFailureRate = ref(0)
const pendingMaxf = ref(null)

const pendingComponentMaxf = computed(() => {
  const id = store.pendingComponentId
  if (!id) return null
  return store.componentCofactorMaxf(id)
})

watch(() => store.maxFailureProbability, (val) => {
  if (val === null) nextTick(() => maxfInput.value?.focus())
}, { immediate: true })

function confirmMaxf() {
  const v = pendingMaxf.value
  if (v === null || v === '' || isNaN(v) || v < 0 || v > 1) return
  store.setMaxFailureProbability(v)
}

watch(() => store.pendingComponentId, (id) => {
  if (id) {
    const comp = store.components.find(c => c.id === id)
    pendingName.value = comp?.name ?? 'Component'
    pendingFailureRate.value = 0
    nextTick(() => {
      nameInput.value?.focus()
      nameInput.value?.select()
    })
  }
})

function confirmCreation() {
  const id = store.pendingComponentId
  if (!id) return
  store.pendingComponentId = null
  store.updateComponent(id, {
    name: pendingName.value || 'Component',
    intrinsicFailureRate: Math.min(1, Math.max(0, pendingFailureRate.value || 0)),
  })
}

function cancelCreation() {
  store.pendingComponentId = null
}

// Poll zoom from canvas (simpler than an event)
watch(canvasRef, (canvas) => {
  if (!canvas) return
  setInterval(() => {
    canvasZoom.value = window.__archrelZoom ?? 1
  }, 100)
}, { immediate: false })
</script>

<style scoped>
.field-input {
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-panel-border);
  background: var(--color-canvas);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus {
  border-color: var(--color-accent);
}
.field-info {
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-panel-border);
  background: var(--color-canvas);
  color: var(--color-success);
  font-size: 13px;
  opacity: 0.85;
}
</style>
