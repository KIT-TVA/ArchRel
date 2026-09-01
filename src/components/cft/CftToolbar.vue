<template>
  <div class="cft-toolbar glass border-b border-panel-border flex items-center gap-2 px-4 h-14 shrink-0 z-20">
    <!-- CFT badge -->
    <div class="flex items-center gap-2 mr-2">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="text-accent">
        <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.3" stroke-dasharray="4 2"/>
        <rect x="7" y="5" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1"/>
        <line x1="10" y1="9" x2="10" y2="11" stroke="currentColor" stroke-width="1"/>
        <circle cx="10" cy="13" r="1.5" stroke="currentColor" stroke-width="1"/>
      </svg>
      <span class="font-semibold text-sm text-text-primary truncate max-w-[140px]">{{ componentName }}</span>
      <span class="text-xs px-2 py-0.5 rounded-full border border-panel-border text-text-muted">{{ store.activeComponentId === SYSTEM_CFT_KEY ? 'System CFT' : 'CFT' }}</span>
    </div>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Add Event -->
    <button class="toolbar-btn" title="Add Basic Event" @click="addEvent">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span>Event</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Add Gates (AND/OR only — Def 17) -->
    <button class="toolbar-btn" title="Add AND Gate" @click="addGate('AND')">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <text x="8" y="10" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">&amp;</text>
      </svg>
      <span>AND</span>
    </button>

    <button class="toolbar-btn" title="Add OR Gate" @click="addGate('OR')">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <text x="8" y="10" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">≥1</text>
      </svg>
      <span>OR</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Add Ports -->
    <button class="toolbar-btn" title="Add Input Port" @click="addInputPort">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polygon points="4,4 12,4 8,12" fill="currentColor" opacity="0.7"/>
      </svg>
      <span>In Port</span>
    </button>

    <button class="toolbar-btn" title="Add Output Port" @click="addOutputPort">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polygon points="4,12 12,12 8,4" fill="currentColor" opacity="0.7"/>
      </svg>
      <span>Out Port</span>
    </button>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Add Sub-Component -->
    <div class="relative" ref="subMenuRef">
      <button class="toolbar-btn" title="Add Sub-Component reference"
        @click="toggleSubMenu"
        :class="{ 'opacity-40 cursor-not-allowed': availableComponents.length === 0 }"
        :disabled="availableComponents.length === 0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 2"/>
          <rect x="4" y="5" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1"/>
          <rect x="3" y="7" width="2" height="1.5" rx="0.3" fill="currentColor"/>
        </svg>
        <span>Sub</span>
      </button>
      <div v-if="showSubMenu" class="absolute top-full left-0 mt-1 bg-panel border border-panel-border rounded-xl shadow-xl z-50 py-1 min-w-[160px]">
        <button
          v-for="comp in availableComponents" :key="comp.id"
          class="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
          @click="addSubComponent(comp.id)"
        >{{ comp.name }}</button>
      </div>
    </div>

    <div class="w-px h-6 bg-panel-border mx-1" />

    <!-- Connect mode -->
    <button class="toolbar-btn" :class="{ '!bg-accent/15 !text-accent-hover': store.connectMode }"
      title="Toggle connect mode" @click="toggleConnect">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="12" x2="13" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <polygon points="13,4 9,5 11,7" fill="currentColor"/>
      </svg>
      <span>{{ store.connectMode ? 'Connecting...' : 'Connect' }}</span>
    </button>

    <!-- Delete -->
    <button class="toolbar-btn text-danger hover:bg-danger/10"
      :class="{ 'opacity-40 cursor-not-allowed': !canDelete }" :disabled="!canDelete"
      title="Delete selected" @click="deleteSelected">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 0 0 4.5 14h7a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Delete</span>
    </button>

    <div class="flex-1" />

    <!-- Close button -->
    <button class="toolbar-btn !text-text-primary" title="Close CFT Editor" @click="closeCft">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>Close</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCftStore, SYSTEM_CFT_KEY } from '../../stores/cft.js'
import { useDiagramStore } from '../../stores/diagram.js'
import type { GateType } from '../../core/translate.js'

const emit = defineEmits<{ close: [] }>()

const store = useCftStore()
const diagramStore = useDiagramStore()

const showSubMenu = ref(false)
const subMenuRef = ref<HTMLElement | null>(null)

const componentName = computed(() => {
  if (store.activeComponentId === SYSTEM_CFT_KEY) return 'System'
  const comp = diagramStore.components.find(c => c.id === store.activeComponentId)
  return comp ? comp.name : 'Component'
})

const hasSelection = computed(() => !!store.selectedNodeId)

const canDelete = computed(() => {
  if (!store.selectedNodeId) return false
  if (store.selectedNodeType === 'outputPort') {
    const cft = store.activeComponentId ? store.cfts[store.activeComponentId] : null
    if (cft && cft.nodes.filter((n: { type: string }) => n.type === 'outputPort').length <= 1) return false
  }
  return true
})

const availableComponents = computed(() =>
  diagramStore.components.filter(c => c.id !== store.activeComponentId && c.id !== SYSTEM_CFT_KEY)
)

function addEvent() {
  store.addEvent(Math.round((250 + Math.random() * 100) / 10) * 10, Math.round((300 + Math.random() * 100) / 10) * 10)
}

function addGate(type: GateType) {
  store.addGate(type, Math.round((250 + Math.random() * 100) / 10) * 10, Math.round((180 + Math.random() * 60) / 10) * 10)
}

function addInputPort() {
  store.addInputPort(Math.round((150 + Math.random() * 200) / 10) * 10, Math.round((450 + Math.random() * 40) / 10) * 10)
}

function addOutputPort() {
  store.addOutputPort(Math.round((150 + Math.random() * 200) / 10) * 10, Math.round((60 + Math.random() * 30) / 10) * 10)
}

function toggleSubMenu() {
  if (availableComponents.value.length === 0) return
  showSubMenu.value = !showSubMenu.value
}

function addSubComponent(refComponentId: string) {
  store.addSubComponent(refComponentId, Math.round((300 + Math.random() * 80) / 10) * 10, Math.round((250 + Math.random() * 80) / 10) * 10)
  showSubMenu.value = false
}

function toggleConnect() { store.toggleConnectMode() }
function deleteSelected() { store.removeSelected() }
function closeCft() { emit('close') }

function onClickOutside(e: MouseEvent) {
  if (subMenuRef.value && !subMenuRef.value.contains(e.target as Node)) {
    showSubMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

