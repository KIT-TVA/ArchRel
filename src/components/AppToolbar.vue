<template>
  <div class="toolbar glass border-b border-panel-border flex items-center gap-2 px-4 h-14 shrink-0 z-20">
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

    <button id="btn-add-interface" class="toolbar-btn" :class="{ 'opacity-40 cursor-not-allowed': !canAddInterface }"
      :disabled="!canAddInterface" title="Add Interface to selected component" @click="addInterface">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.3" />
        <line x1="1" y1="8" x2="9" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <line x1="6" y1="5" x2="6" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
      <span>Add Interface</span>
    </button>

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

    <button id="btn-clear-all" class="toolbar-btn text-danger hover:bg-danger/10" title="Clear entire diagram"
      @click="clearAll">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>Clear All</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <div class="flex items-center gap-1.5">
      <label class="text-xs font-mono text-text-muted whitespace-nowrap">IV:</label>
      <input
        class="toolbar-iv-input"
        type="number"
        step="any"
        min="0"
        max="1"
        :value="store.iv ?? ''"
        @input="store.setIV(($event.target as HTMLInputElement).value)"
        placeholder="—"
      />
    </div>

    <span v-if="systemProbDisplay !== null" class="text-xs font-mono text-text-muted whitespace-nowrap">
      P(E<sub>F</sub>)={{ formatProb(systemProbDisplay) }}
    </span>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <button id="btn-system-cft" class="toolbar-btn" title="Open System Fault Tree" @click="cftStore.openCft(SYSTEM_CFT_KEY)">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.3" stroke-dasharray="4 2"/>
        <rect x="7" y="5" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1"/>
        <line x1="10" y1="9" x2="10" y2="11" stroke="currentColor" stroke-width="1"/>
        <circle cx="10" cy="13" r="1.5" stroke="currentColor" stroke-width="1"/>
      </svg>
      <span>System CFT</span>
    </button>

    <button id="btn-verify" class="toolbar-btn" :class="{
      '!text-success hover:!bg-success/10 hover:!text-success': isVerifySuccess,
      '!text-danger hover:!bg-danger/10 hover:!text-danger': isVerifyDanger
    }" title="Verify system admissibility (Def. 18)" @click="verifyDiagram">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M14 4L6 12L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
          stroke-linejoin="round" />
      </svg>
      <span>Verify</span>
    </button>

    <div class="flex-1" />

    <span class="text-xs text-text-muted font-mono">{{ Math.round(zoom * 100) }}%</span>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <button id="btn-save" class="toolbar-btn" title="Save diagram as JSON" @click="save">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13 13.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5h8l2.5 2.5V13a.5.5 0 0 1-.5.5Z" stroke="currentColor"
          stroke-width="1.3" />
        <rect x="5" y="2.5" width="5" height="3.5" rx="0.5" stroke="currentColor" stroke-width="1.3" />
        <rect x="4" y="8" width="8" height="5" rx="0.5" stroke="currentColor" stroke-width="1.3" />
      </svg>
      <span>Save</span>
    </button>

    <button id="btn-load" class="toolbar-btn" title="Load diagram from JSON" @click="triggerLoad">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 10V13.5h11V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <path d="M8 2v7.5M5.5 7 8 9.5 10.5 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
          stroke-linejoin="round" />
      </svg>
      <span>Load</span>
    </button>
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="loadFile" />

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

  <Teleport to="body">
    <div v-if="plantUMLText" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="plantUMLText = null" @keydown.escape="plantUMLText = null">
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.5)">
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
        <div class="flex-1 overflow-auto p-6">
          <pre
            class="text-[13px] font-mono text-text-secondary leading-relaxed whitespace-pre-wrap break-words bg-canvas rounded-xl p-5 border border-panel-border">{{ plantUMLText }}</pre>
        </div>
        <div class="flex justify-end gap-3 px-6 py-4 border-t border-panel-border">
          <button
            class="px-4 py-2 rounded-lg border border-panel-border bg-canvas text-text-secondary text-sm font-medium hover:bg-surface-hover cursor-pointer transition-all flex items-center gap-2"
            @click="downloadPlantUML">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 10V13.5h11V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <path d="M8 2v7.5M5.5 7 8 9.5 10.5 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
            Download .puml
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover cursor-pointer transition-all flex items-center gap-2"
            @click="copyPlantUML">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.3" />
              <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" stroke="currentColor"
                stroke-width="1.3" />
            </svg>
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showErrorModal && verificationResult?.errors?.length"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showErrorModal = false" @keydown.escape="showErrorModal = false">
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.5)">
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
        <div class="flex-1 overflow-auto p-6">
          <ul class="list-disc pl-5 text-[13px] text-danger space-y-2">
            <li v-for="(error, i) in verificationResult!.errors" :key="i">{{ error }}</li>
          </ul>
        </div>
        <div class="px-6 py-4 border-t border-panel-border flex justify-end">
          <button
            class="px-4 py-2 rounded-lg border border-panel-border bg-canvas text-text-secondary text-sm font-medium hover:bg-surface-hover cursor-pointer transition-all"
            @click="showErrorModal = false">Close</button>
        </div>
      </div>
    </div>
  </Teleport>

  <SubcomponentRuleDialog
    v-if="showSubRuleDialog"
    :parent-id="ruleDialogParentId"
    :parent-name="ruleDialogParentName"
    @applied="showSubRuleDialog = false"
    @cancel="showSubRuleDialog = false"
  />

  <InterfaceRuleDialog
    v-if="showIfaceRuleDialog && ruleDialogParentId"
    :requirer-id="ruleDialogParentId"
    :requirer-name="ruleDialogParentName"
    @applied="showIfaceRuleDialog = false"
    @cancel="showIfaceRuleDialog = false"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'
import { useCftStore, SYSTEM_CFT_KEY } from '../stores/cft.js'
import { formatProb } from '../utils/format.js'
import SubcomponentRuleDialog from './SubcomponentRuleDialog.vue'
import InterfaceRuleDialog from './InterfaceRuleDialog.vue'

const store = useDiagramStore()
const cftStore = useCftStore()
const fileInput = ref<HTMLInputElement | null>(null)
const plantUMLText = ref<string | null>(null)
const copied = ref(false)

interface VerificationResult { valid: boolean; errors: string[]; systemProbability: number | null }
const verificationResult = ref<VerificationResult | null>(null)
const showErrorModal = ref(false)

const isVerifySuccess = computed(() => verificationResult.value?.valid === true)
const isVerifyDanger = computed(() => verificationResult.value?.valid === false)

const systemProbDisplay = computed(() => store.systemProbability)

const props = defineProps<{ zoom: number }>()

const hasSelection = computed(() => !!store.selectedId)
const canAddInterface = computed(() => store.selectedType === 'component' && !!store.selectedId)

const showSubRuleDialog = ref(false)
const showIfaceRuleDialog = ref(false)
const ruleDialogParentId = ref<string | null>(null)
const ruleDialogParentName = ref('')

function openSubRuleDialog(parentId: string | null) {
  ruleDialogParentId.value = parentId
  ruleDialogParentName.value = parentId
    ? (store.components.find(c => c.id === parentId)?.name ?? 'Component')
    : 'System'
  showSubRuleDialog.value = true
}

function addComponent() {
  if (store.selectedType === 'component' && store.selectedId) {
    openSubRuleDialog(store.selectedId)
  } else {
    openSubRuleDialog(null)
  }
}

function addInterface() {
  if (!canAddInterface.value) return
  ruleDialogParentId.value = store.selectedId!
  ruleDialogParentName.value = store.selectedComponent?.name ?? 'Component'
  showIfaceRuleDialog.value = true
}

function addSubcomponent() {
  if (!canAddInterface.value) return
  openSubRuleDialog(store.selectedId!)
}

function clearAll() {
  store.clearAll()
}

function verifyDiagram() {
  verificationResult.value = store.verifyDiagram()
  if (verificationResult.value && !verificationResult.value.valid) {
    showErrorModal.value = true
  }
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

function loadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => store.loadDiagram(ev.target!.result as string)
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

function exportPlantUML() {
  plantUMLText.value = store.exportPlantUML()
}

async function copyPlantUML() {
  await navigator.clipboard.writeText(plantUMLText.value!)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function downloadPlantUML() {
  const blob = new Blob([plantUMLText.value!], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'diagram.puml'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.toolbar-iv-input {
  width: 72px;
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
.toolbar-iv-input:focus {
  border-color: var(--color-accent);
}
</style>
