<template>
  <div class="flex flex-col h-full">
    <AppToolbar :zoom="canvasZoom"/>
    <div class="flex flex-1 min-h-0">
      <DiagramCanvas ref="canvasRef" @zoom-change="canvasZoom = $event"/>
      <PropertiesPanel/>
    </div>

    <!-- CFT Editor (full-screen overlay) -->
    <CftEditorModal />

    <!-- IV prompt — mandatory on first load -->
    <Teleport to="body">
      <div
        v-if="store.iv === null"
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
              <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">IV — Initial Value (max system failure probability)</label>
              <input
                ref="ivInput"
                class="field-input font-mono"
                type="number"
                step="any"
                min="0"
                max="1"
                v-model.number="pendingIV"
                placeholder="e.g. 1e-7"
                @keydown.enter="confirmIV"
              />
            </div>
          </div>
          <div class="px-6 py-4 border-t border-panel-border flex gap-3 justify-end">
            <button
              class="px-4 py-2 rounded-lg border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover cursor-pointer transition-all"
              @click="confirmIV">Confirm</button>
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
              <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                Failure Probability
                <span v-if="pendingMaxf !== null" class="ml-1 normal-case font-normal text-text-muted">
                  (max: {{ pendingMaxf.toExponential(3) }})
                </span>
              </label>
              <input
                class="field-input font-mono"
                type="number"
                step="any"
                min="0"
                :max="pendingMaxf ?? 1"
                v-model.number="pendingProbability"
                placeholder="0"
                @keydown.enter="confirmCreation"
              />
            </div>
          </div>
          <div class="px-6 py-4 border-t border-panel-border flex gap-3 justify-end">
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

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import AppToolbar from './components/AppToolbar.vue'
import DiagramCanvas from './components/DiagramCanvas.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import CftEditorModal from './components/cft/CftEditorModal.vue'
import { useDiagramStore } from './stores/diagram.js'
import { useCftStore, SYSTEM_CFT_KEY } from './stores/cft.js'

const store = useDiagramStore()
const cftStore = useCftStore()

const canvasRef = ref<InstanceType<typeof DiagramCanvas> | null>(null)
const canvasZoom = ref(1)
const nameInput = ref<HTMLInputElement | null>(null)
const dialogBackdrop = ref<HTMLElement | null>(null)
const ivInput = ref<HTMLInputElement | null>(null)

const pendingName = ref('Component')
const pendingProbability = ref<number>(0)
const pendingIV = ref<number | null>(null)
const pendingMaxf = computed(() => store.pendingComponentMaxf)

watch(() => store.iv, (val) => {
  if (val === null) nextTick(() => ivInput.value?.focus())
}, { immediate: true })

function confirmIV() {
  const v = pendingIV.value
  if (v === null || typeof v !== 'number' || isNaN(v) || v < 0 || v > 1) return
  store.setIV(v)
}

watch(() => store.pendingComponentId, (id) => {
  if (id) {
    const comp = store.components.find(c => c.id === id)
    pendingName.value = comp?.name ?? 'Component'
    pendingProbability.value = 0
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
  store.updateComponent(id, { name: pendingName.value || 'Component' })
  if (pendingProbability.value > 0) {
    cftStore.setIntrinsicEventProbability(id, pendingProbability.value)
  }
}

function cancelCreation() {
  store.pendingComponentId = null
}

watch(canvasRef, (canvas) => {
  if (!canvas) return
  setInterval(() => {
    canvasZoom.value = (window as any).__archrelZoom ?? 1
  }, 100)
}, { immediate: false })
</script>

