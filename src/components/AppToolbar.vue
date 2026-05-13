<template>
  <div class="toolbar glass border-b border-panel-border flex items-center gap-2 px-4 h-14 shrink-0 z-20">
    <!-- Logo -->
    <div class="flex items-center gap-2 mr-4">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="text-accent">
        <rect x="2" y="6" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5" />
        <rect x="0" y="9" width="3" height="3" rx="0.5" fill="currentColor" />
        <rect x="0" y="13" width="3" height="3" rx="0.5" fill="currentColor" />
        <circle cx="20" cy="12" r="3" stroke="currentColor" stroke-width="1.5" />
        <line x1="16" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <span class="font-semibold text-sm tracking-wide text-text-primary">ArchRel</span>
    </div>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Add Component -->
    <button id="btn-add-component" class="toolbar-btn" title="Add Component" @click="addComponent">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" />
        <rect x="0" y="5" width="2" height="2" rx="0.3" fill="currentColor" />
        <rect x="0" y="8" width="2" height="2" rx="0.3" fill="currentColor" />
        <line x1="13" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <line x1="14" y1="6" x2="14" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
      <span>Add Component</span>
    </button>

    <!-- Add Interface (only when component selected) -->
    <button id="btn-add-interface" class="toolbar-btn" :class="{ 'opacity-40 cursor-not-allowed': !canAddInterface }"
      :disabled="!canAddInterface" title="Add Interface to selected component" @click="addInterface">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.3" />
        <line x1="1" y1="8" x2="9" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <line x1="6" y1="5" x2="6" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
      <span>Add Interface</span>
    </button>

    <!-- Add Subcomponent (only when component selected) -->
    <button id="btn-add-subcomponent" class="toolbar-btn" :class="{ 'opacity-40 cursor-not-allowed': !canAddInterface }"
      :disabled="!canAddInterface" title="Add Subcomponent to selected component" @click="addSubcomponent">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3" />
        <rect x="4" y="6" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2" />
        <rect x="3" y="8" width="2" height="1.5" rx="0.3" fill="currentColor" />
        <rect x="3" y="10" width="2" height="1.5" rx="0.3" fill="currentColor" />
      </svg>
      <span>Add Sub</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Delete selected -->
    <button id="btn-delete" class="toolbar-btn text-danger hover:bg-danger/10"
      :class="{ 'opacity-40 cursor-not-allowed': !hasSelection }" :disabled="!hasSelection" title="Delete selected"
      @click="deleteSelected">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 0 0 4.5 14h7a.5.5 0 0 0 .5-.5L13 4"
          stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>Delete</span>
    </button>

    <!-- Clear All -->
    <button id="btn-clear-all" class="toolbar-btn text-danger hover:bg-danger/10" title="Clear entire diagram"
      @click="clearAll">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>Clear All</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- maxf(S) input -->
    <div class="flex items-center gap-1.5">
      <label class="text-xs font-mono text-text-muted whitespace-nowrap">maxf(S):</label>
      <input
        class="toolbar-maxf-input"
        type="number"
        step="any"
        min="0"
        max="1"
        :value="store.maxFailureProbability ?? ''"
        @input="store.setMaxFailureProbability($event.target.value)"
        placeholder="—"
      />
    </div>

    <!-- System failure probability display -->
    <span v-if="systemFailureProbability !== null" class="text-xs font-mono text-text-muted whitespace-nowrap">
      f(S)={{ systemFailureProbability.toFixed(4) }}
    </span>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- System CFT button -->
    <button
      id="btn-system-cft"
      class="toolbar-btn"
      :class="{ 'opacity-40 cursor-not-allowed': store.rootComponents.length === 0 }"
      :disabled="store.rootComponents.length === 0"
      title="View System CFT"
      @click="openSystemCft"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 2"/>
        <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="5" y1="9" x2="8" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span>System CFT</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Verify -->
    <button id="btn-verify" class="toolbar-btn" :class="{
      '!text-success hover:!bg-success/10 hover:!text-success': isVerifySuccess,
      '!text-danger hover:!bg-danger/10 hover:!text-danger': isVerifyDanger
    }" title="Verify diagram" @click="verifyDiagram">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M14 4L6 12L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
          stroke-linejoin="round" />
      </svg>
      <span>Verify</span>
    </button>

    <div class="flex-1" />

    <!-- Zoom info -->
    <span class="text-xs text-text-muted font-mono">{{ Math.round(zoom * 100) }}%</span>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Save -->
    <button id="btn-save" class="toolbar-btn" title="Save diagram as JSON" @click="save">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13 13.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5h8l2.5 2.5V13a.5.5 0 0 1-.5.5Z" stroke="currentColor"
          stroke-width="1.3" />
        <rect x="5" y="2.5" width="5" height="3.5" rx="0.5" stroke="currentColor" stroke-width="1.3" />
        <rect x="4" y="8" width="8" height="5" rx="0.5" stroke="currentColor" stroke-width="1.3" />
      </svg>
      <span>Save</span>
    </button>

    <!-- Load -->
    <button id="btn-load" class="toolbar-btn" title="Load diagram from JSON" @click="triggerLoad">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 10V13.5h11V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <path d="M8 2v7.5M5.5 7 8 9.5 10.5 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
          stroke-linejoin="round" />
      </svg>
      <span>Load</span>
    </button>
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="loadFile" />

    <!-- Export PlantUML -->
    <button id="btn-export" class="toolbar-btn" title="Export to PlantUML" @click="exportPlantUML">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 2Z" stroke="currentColor"
          stroke-width="1.3" />
        <path d="M9.5 2v3.5H13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <path d="M6 8.5h4M6 11h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
      <span>Export UML</span>
    </button>

  </div>

  <!-- PlantUML modal — teleported to body so it's not clipped by toolbar layout -->
  <Teleport to="body">
    <div v-if="plantUMLText" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="plantUMLText = null" @keydown.escape="plantUMLText = null">
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.5)">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
          <div class="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" class="text-accent">
              <path d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 2Z" stroke="currentColor"
                stroke-width="1.3" />
              <path d="M9.5 2v3.5H13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            <span class="font-semibold text-text-primary text-base">PlantUML Export</span>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer text-lg leading-none"
            @click="plantUMLText = null">✕</button>
        </div>

        <!-- Code content -->
        <div class="flex-1 overflow-auto p-6">
          <pre
            class="text-[13px] font-mono text-text-secondary leading-relaxed whitespace-pre-wrap break-words bg-canvas rounded-xl p-5 border border-panel-border">{{ plantUMLText }}</pre>
        </div>

        <!-- Footer actions -->
        <div class="flex justify-center gap-3 px-6 py-4 border-t border-panel-border">
          <button class="toolbar-btn" @click="copyPlantUML">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.3" />
              <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" stroke="currentColor"
                stroke-width="1.3" />
            </svg>
            <span>{{ copied ? 'Copied!' : 'Copy' }}</span>
          </button>
          <button class="toolbar-btn" @click="downloadPlantUML">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 10V13.5h11V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <path d="M8 2v7.5M5.5 7 8 9.5 10.5 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
            <span>Download .puml</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Verification Errors modal -->
  <Teleport to="body">
    <div v-if="showErrorModal && verificationResult?.errors?.length"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showErrorModal = false" @keydown.escape="showErrorModal = false">
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.5)">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
          <div class="flex items-center gap-3 text-danger">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                transform="rotate(45 8 8)" />
            </svg>
            <span class="font-semibold text-text-primary text-base">Verification Errors</span>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer text-lg leading-none"
            @click="showErrorModal = false">✕</button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto p-6">
          <ul class="list-disc pl-5 text-[13px] text-danger space-y-2">
            <li v-for="(error, i) in verificationResult.errors" :key="i">{{ error }}</li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup>
import { ref, computed } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'
import { useCftStore, SYSTEM_CFT_KEY } from '../stores/cft.js'

const store = useDiagramStore()
const cftStore = useCftStore()
const fileInput = ref(null)
const plantUMLText = ref(null)
const copied = ref(false)

const verificationResult = ref(null)
const showErrorModal = ref(false)

const isVerifySuccess = computed(() => verificationResult.value?.valid === true)
const isVerifyDanger = computed(() => verificationResult.value?.valid === false)
const systemFailureProbability = computed(() => verificationResult.value?.systemFailureProbability ?? null)

const props = defineProps({
  zoom: { type: Number, default: 1 },
})

const hasSelection = computed(() => !!store.selectedId)
const canAddInterface = computed(() => store.selectedType === 'component' && !!store.selectedId)

function addComponent() {
  if (store.selectedType === 'component' && store.selectedId) {
    const parentId = store.selectedId
    store.addSubcomponent(parentId)
    // Re-select the parent so repeated presses add siblings, not a nested chain
    store.selectItem(parentId, 'component')
  } else {
    store.addComponent(null, Math.round((200 + Math.random() * 100) / 10) * 10, Math.round((200 + Math.random() * 100) / 10) * 10, true)
  }
}

function addInterface() {
  if (!canAddInterface.value) return
  store.addInterface(store.selectedId)
}

function addSubcomponent() {
  if (!canAddInterface.value) return
  store.addSubcomponent(store.selectedId)
}

function clearAll() {
  store.clearAll()
}

function verifyDiagram() {
  verificationResult.value = store.verifyDiagram()
  if (verificationResult.value && !verificationResult.value.valid) {
    showErrorModal.value = true
  }

  console.log('Verification result:', verificationResult.value)
}

function openSystemCft() {
  if (store.rootComponents.length === 0) return
  cftStore.openCft(SYSTEM_CFT_KEY)
}

function deleteSelected() {
  if (!store.selectedId) return
  if (store.selectedType === 'component') store.removeComponent(store.selectedId)
  else if (store.selectedType === 'interface') store.removeInterface(store.selectedId)
}

function save() {
  store.saveDiagram()
}

function triggerLoad() {
  fileInput.value?.click()
}

function loadFile(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => store.loadDiagram(ev.target.result)
  reader.readAsText(file)
  e.target.value = ''
}

function exportPlantUML() {
  plantUMLText.value = store.exportPlantUML()
}

async function copyPlantUML() {
  await navigator.clipboard.writeText(plantUMLText.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function downloadPlantUML() {
  const blob = new Blob([plantUMLText.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'diagram.puml'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.toolbar-maxf-input {
  width: 64px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-panel-border);
  background: var(--color-canvas);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  outline: none;
  transition: border-color 0.15s;
}
.toolbar-maxf-input:focus {
  border-color: var(--color-accent);
}
</style>
