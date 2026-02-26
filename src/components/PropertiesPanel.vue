<template>
  <transition name="panel-slide">
    <div v-if="hasSelection" class="properties-panel glass border-l border-panel-border flex flex-col w-64 shrink-0 z-10 overflow-y-auto">
      <div class="px-4 py-3 border-b border-panel-border flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-widest text-text-muted">Properties</span>
        <span class="text-xs px-2 py-0.5 rounded-full border border-panel-border text-text-muted">
          {{ store.selectedType }}
        </span>
      </div>

      <!-- Component properties -->
      <template v-if="store.selectedType === 'component' && selectedComp">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input
              id="prop-name"
              class="field-input"
              :value="selectedComp.name"
              @input="updateName($event.target.value)"
              placeholder="Component name"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Position</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">X</label>
                <input class="field-input" type="number" :value="Math.round(selectedComp.x)" @input="updateField('x', +$event.target.value)"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">Y</label>
                <input class="field-input" type="number" :value="Math.round(selectedComp.y)" @input="updateField('y', +$event.target.value)"/>
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Size</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">W</label>
                <input class="field-input" type="number" :value="Math.round(selectedComp.width)" @input="updateField('width', Math.max(80, +$event.target.value))"/>
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block">H</label>
                <input class="field-input" type="number" :value="Math.round(selectedComp.height)" @input="updateField('height', Math.max(60, +$event.target.value))"/>
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Failure Rate</label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-text-muted mb-1 block font-mono">f</label>
                <input
                  id="prop-failure-rate"
                  class="field-input"
                  type="number"
                  step="0.001"
                  min="0"
                  :value="selectedComp.failureRate ?? 0"
                  @input="updateField('failureRate', Math.max(0, +$event.target.value))"
                  placeholder="0"
                />
              </div>
              <div>
                <label class="text-[11px] text-text-muted mb-1 block font-mono">max f</label>
                <input
                  id="prop-max-failure-rate"
                  class="field-input"
                  type="number"
                  step="0.001"
                  min="0"
                  :value="selectedComp.maxFailureRate ?? 0"
                  @input="updateField('maxFailureRate', Math.max(0, +$event.target.value))"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Interfaces ({{ compInterfaces.length }})</label>
            <div v-if="compInterfaces.length === 0" class="text-xs text-text-muted italic">No interfaces yet</div>
            <div v-for="iface in compInterfaces" :key="iface.id" class="iface-chip" @click="store.selectItem(iface.id, 'interface')">
              <span class="iface-type-dot bg-accent"/>
              <span class="text-xs text-text-secondary truncate">{{ iface.name }}</span>
              <span class="text-[10px] text-text-muted ml-auto">
                {{ iface.requiredComponentId === selectedComp.id ? 'req' : 'prov' }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-auto p-4 border-t border-panel-border">
          <button id="prop-delete" class="danger-btn w-full" @click="deleteSelected">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 0 0 4.5 14h7a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete Component
          </button>
        </div>
      </template>

      <!-- Interface properties -->
      <template v-if="store.selectedType === 'interface' && selectedIface">
        <div class="p-4 flex flex-col gap-4">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input
              id="prop-iface-name"
              class="field-input"
              :value="selectedIface.name"
              @input="updateIfaceName($event.target.value)"
              placeholder="Interface name"
            />
          </div>

          <div class="field-group">
            <label class="field-label">Required Component</label>
            <div class="iface-chip cursor-default">
              <span class="iface-type-dot bg-accent"/>
              <span class="text-xs text-text-secondary">{{ reqCompName }}</span>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Provided Component</label>
            <div class="iface-chip cursor-default">
              <span class="iface-type-dot bg-success"/>
              <span class="text-xs text-text-secondary">{{ provCompName }}</span>
            </div>
          </div>
        </div>

        <div class="mt-auto p-4 border-t border-panel-border">
          <button class="danger-btn w-full" @click="deleteIface">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 0 0 4.5 14h7a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete Interface
          </button>
        </div>
      </template>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'

const store = useDiagramStore()

const hasSelection = computed(() => !!store.selectedId)
const selectedComp = computed(() => store.selectedComponent)
const selectedIface = computed(() => store.selectedInterface)

const compInterfaces = computed(() =>
  selectedComp.value ? store.interfacesOf(selectedComp.value.id) : []
)

const reqCompName = computed(() => {
  if (!selectedIface.value) return '—'
  const c = store.components.find(c => c.id === selectedIface.value.requiredComponentId)
  return c ? c.name : '—'
})
const provCompName = computed(() => {
  if (!selectedIface.value) return '—'
  const c = store.components.find(c => c.id === selectedIface.value.providedComponentId)
  return c ? c.name : '—'
})

function updateName(val) {
  store.updateComponent(store.selectedId, { name: val })
}
function updateField(field, val) {
  store.updateComponent(store.selectedId, { [field]: val })
}
function updateIfaceName(val) {
  store.updateInterface(store.selectedId, { name: val })
}
function deleteSelected() {
  store.removeComponent(store.selectedId)
}
function deleteIface() {
  store.removeInterface(store.selectedId)
}
</script>

<style scoped>
.properties-panel {
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
.iface-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-canvas);
  border: 1px solid var(--color-panel-border);
  cursor: pointer;
  transition: border-color 0.15s;
}
.iface-chip:hover {
  border-color: var(--color-accent);
}
.iface-type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
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
