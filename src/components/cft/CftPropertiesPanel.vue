<template>
  <transition name="panel-slide">
    <div v-if="hasSelection" class="cft-properties-panel glass border-l border-panel-border flex flex-col w-64 shrink-0 z-10 overflow-y-auto">
      <div class="px-4 py-3 border-b border-panel-border flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-widest text-text-muted">CFT Properties</span>
        <span class="text-xs px-2 py-0.5 rounded-full border border-panel-border text-text-muted">
          {{ typeLabel }}
        </span>
      </div>

      <!-- Event properties -->
      <template v-if="isEvent && selectedItem">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input
              class="field-input"
              :value="selectedItem.name"
              @input="updateNode('name', $event.target.value)"
              placeholder="Event name"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Probability</label>
            <input
              class="field-input"
              type="number"
              step="0.001"
              min="0"
              max="1"
              :value="selectedItem.probability ?? 0"
              @input="updateNode('probability', Math.max(0, Math.min(1, +$event.target.value)))"
              placeholder="0.0"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Position</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">X</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.x)" @input="updateNode('x', +$event.target.value)"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">Y</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.y)" @input="updateNode('y', +$event.target.value)"/>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Port properties -->
      <template v-if="isPort && selectedItem">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input
              class="field-input"
              :value="selectedItem.name"
              @input="updateNode('name', $event.target.value)"
              placeholder="Port name"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Direction</label>
            <div class="text-xs text-text-secondary px-2 py-1.5 rounded border border-panel-border bg-canvas">
              {{ selectedItem.type === 'inputPort' ? '↓ Input (inward)' : '↑ Output (outward)' }}
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Position</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">X</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.x)" @input="updateNode('x', +$event.target.value)"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">Y</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.y)" @input="updateNode('y', +$event.target.value)"/>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Gate properties -->
      <template v-if="isGate && selectedItem">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Gate Type</label>
            <select
              class="field-input"
              :value="selectedItem.type"
              @change="updateGateType($event.target.value)"
            >
              <option value="AND">AND (&amp;)</option>
              <option value="OR">OR (≥1)</option>
              <option value="NOT">NOT (1̄)</option>
              <option value="XOR">XOR (=1)</option>
            </select>
          </div>

          <div class="field-group">
            <label class="field-label">Inputs</label>
            <input
              class="field-input"
              type="number"
              min="1"
              max="8"
              :disabled="selectedItem.type === 'NOT'"
              :value="selectedItem.inputCount ?? (selectedItem.type === 'NOT' ? 1 : 2)"
              @input="updateGate('inputCount', Math.max(1, Math.min(8, parseInt($event.target.value) || 1)))"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Position</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">X</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.x)" @input="updateGate('x', +$event.target.value)"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">Y</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.y)" @input="updateGate('y', +$event.target.value)"/>
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Size</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">W</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.width)" @input="updateGate('width', Math.max(40, +$event.target.value))"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">H</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.height)" @input="updateGate('height', Math.max(40, +$event.target.value))"/>
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Connected Edges</label>
            <div class="text-xs text-text-muted italic">
              {{ connectedEdgeCount }} edge(s)
            </div>
          </div>
        </div>
      </template>

      <!-- Sub-component properties -->
      <template v-if="isSubComponent && selectedItem">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Referenced Component</label>
            <div class="text-xs text-text-secondary px-2 py-1.5 rounded border border-panel-border bg-canvas">
              {{ refComponentName }}
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Position</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">X</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.x)" @input="updateSubComp('x', +$event.target.value)"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">Y</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.y)" @input="updateSubComp('y', +$event.target.value)"/>
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Size</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">W</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.width)" @input="updateSubComp('width', Math.max(80, +$event.target.value))"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">H</label>
                <input class="field-input" type="number" :value="Math.round(selectedItem.height)" @input="updateSubComp('height', Math.max(60, +$event.target.value))"/>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Edge properties -->
      <template v-if="isEdge && selectedItem">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Source</label>
            <div class="text-xs text-text-secondary px-2 py-1.5 rounded border border-panel-border bg-canvas">
              {{ store.elementName(selectedItem.sourceId) }}
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Target</label>
            <div class="text-xs text-text-secondary px-2 py-1.5 rounded border border-panel-border bg-canvas">
              {{ store.elementName(selectedItem.targetId) }}
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Waypoints</label>
            <div class="text-xs text-text-muted italic">
              {{ (selectedItem.waypoints || []).length }} waypoint(s)
            </div>
          </div>
        </div>
      </template>

      <!-- Delete button (always at bottom) -->
      <div class="mt-auto p-4 border-t border-panel-border">
        <button class="danger-btn w-full" @click="deleteSelected">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 0 0 4.5 14h7a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Delete {{ typeLabel }}
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { useCftStore } from '../../stores/cft.js'
import { useDiagramStore } from '../../stores/diagram.js'

const store = useCftStore()
const diagramStore = useDiagramStore()

const hasSelection = computed(() => !!store.selectedNodeId)
const selectedItem = computed(() => store.selectedItem)

const isEvent = computed(() => store.selectedNodeType === 'event')
const isPort = computed(() => store.selectedNodeType === 'inputPort' || store.selectedNodeType === 'outputPort')
const isGate = computed(() => store.selectedNodeType === 'gate')
const isSubComponent = computed(() => store.selectedNodeType === 'subComponent')
const isEdge = computed(() => store.selectedNodeType === 'edge')

const typeLabel = computed(() => {
  switch (store.selectedNodeType) {
    case 'event': return 'Event'
    case 'inputPort': return 'Input Port'
    case 'outputPort': return 'Output Port'
    case 'gate': return 'Gate'
    case 'subComponent': return 'Sub-Component'
    case 'edge': return 'Edge'
    default: return ''
  }
})

const connectedEdgeCount = computed(() => {
  if (!selectedItem.value) return 0
  const id = selectedItem.value.id
  return store.activeEdges.filter(e => e.sourceId === id || e.targetId === id).length
})

const refComponentName = computed(() => {
  if (!selectedItem.value) return '—'
  const comp = diagramStore.components.find(c => c.id === selectedItem.value.refComponentId)
  return comp ? comp.name : '—'
})

function updateNode(field, val) {
  store.updateNode(store.selectedNodeId, { [field]: val })
}
function updateGate(field, val) {
  store.updateGate(store.selectedNodeId, { [field]: val })
}
function updateGateType(val) {
  store.updateGate(store.selectedNodeId, { type: val })
}
function updateSubComp(field, val) {
  store.updateSubComponent(store.selectedNodeId, { [field]: val })
}
function deleteSelected() {
  store.removeSelected()
}
</script>

<style scoped>
.cft-properties-panel {
  min-height: 0;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
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
.danger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.danger-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: var(--color-danger);
}
/* Panel slide animation */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s;
  overflow: hidden;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0;
  opacity: 0;
}
.panel-slide-enter-to,
.panel-slide-leave-from {
  width: 256px;
  opacity: 1;
}
</style>
