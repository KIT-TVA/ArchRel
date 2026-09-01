<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @keydown.escape="emit('cancel')"
      @click.self="emit('cancel')"
      tabindex="-1"
    >
      <div class="bg-panel border border-panel-border rounded-2xl shadow-2xl w-[480px] flex flex-col"
        style="box-shadow: 0 24px 64px rgba(0,0,0,0.4)">
        <div class="flex items-center justify-between px-6 py-4 border-b border-panel-border">
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-text-primary text-base">Apply Subcomponent Rule</span>
            <span class="text-[11px] text-text-muted font-mono">Def. 24</span>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer text-lg leading-none"
            @click="emit('cancel')">✕</button>
        </div>

        <div class="px-6 pt-5 pb-4 flex flex-col gap-4">
          <p class="text-[13px] text-text-secondary">
            Adding a new subcomponent to <strong class="text-text-primary">{{ parentName }}</strong>.
            Choose how it attaches to the parent's fault tree.
          </p>

          <div class="flex flex-col gap-2">
            <label class="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Attachment Point</label>

            <label class="flex items-start gap-3 p-4 rounded-lg border border-panel-border hover:bg-surface-hover cursor-pointer transition-all"
              :class="mode === 'strict' ? 'border-accent/40 bg-accent/5' : ''">
              <input type="radio" v-model="mode" value="strict" class="mt-0.5 accent-[var(--color-accent)]" />
              <div class="flex flex-col gap-0.5">
                <span class="text-[13px] font-medium text-text-primary">Strict failure model</span>
                <span class="text-[11px] text-text-muted">Connect via top-level OR gate (Def. 23). Parent fails whenever this subcomponent fails.</span>
              </div>
            </label>

            <label
              v-if="freeTargets.length > 0"
              class="flex items-start gap-3 p-4 rounded-lg border border-panel-border hover:bg-surface-hover cursor-pointer transition-all"
              :class="mode === 'target' ? 'border-accent/40 bg-accent/5' : ''">
              <input type="radio" v-model="mode" value="target" class="mt-0.5 accent-[var(--color-accent)]" />
              <div class="flex flex-col gap-0.5 flex-1">
                <span class="text-[13px] font-medium text-text-primary">Specific gate input</span>
                <span class="text-[11px] text-text-muted">Attach at a free input slot of an existing gate.</span>
              </div>
            </label>

            <select
              v-if="mode === 'target'"
              v-model="selectedTarget"
              class="field-input mt-1">
              <option value="" disabled>Select a gate input…</option>
              <option v-for="t in freeTargets" :key="t.slotId" :value="t.slotId">{{ t.label }}</option>
            </select>

            <p v-if="freeTargets.length === 0" class="text-[11px] text-text-muted italic">
              No free gate inputs available. Open the CFT editor to add gates with unused inputs.
            </p>
          </div>

          <div v-if="checkResult && !checkResult.ok" class="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
            <span class="text-danger text-[12px] leading-relaxed">{{ checkResult.reason }}</span>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-panel-border flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-lg border border-panel-border bg-canvas text-text-secondary text-sm font-medium hover:bg-surface-hover cursor-pointer transition-all"
            @click="emit('cancel')">Cancel</button>
          <button
            class="px-4 py-2 rounded-lg border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="applying || (mode === 'target' && !selectedTarget) || (checkResult !== null && !checkResult.ok)"
            @click="apply">
            {{ applying ? 'Checking…' : 'Apply' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'
import { useCftStore } from '../stores/cft.js'

const props = defineProps<{
  parentId: string | null
  parentName: string
}>()

const emit = defineEmits<{
  (e: 'applied'): void
  (e: 'cancel'): void
}>()

const diagramStore = useDiagramStore()
const cftStore = useCftStore()

const mode = ref<'strict' | 'target'>('strict')
const selectedTarget = ref('')
const checkResult = ref<{ ok: boolean; reason?: string; definition?: string } | null>(null)
const applying = ref(false)

const freeTargets = computed(() =>
  props.parentId ? cftStore.getFreeTargetsForComponent(props.parentId) : cftStore.getFreeTargetsForComponent('__system__')
)

function runPreCheck() {
  const attachmentPointId = mode.value === 'target' ? selectedTarget.value || undefined : undefined
  if (mode.value === 'target' && !selectedTarget.value) {
    checkResult.value = null
    return
  }
  checkResult.value = diagramStore.checkCanApplySubcomponentRule(props.parentId, attachmentPointId)
}

onMounted(runPreCheck)
watch([mode, selectedTarget], runPreCheck)

function apply() {
  applying.value = true
  const attachmentPointId = mode.value === 'target' ? selectedTarget.value || undefined : undefined
  const result = diagramStore.applySubcomponentRule(props.parentId, attachmentPointId)
  applying.value = false
  if (result.ok) {
    emit('applied')
  } else {
    checkResult.value = result
  }
}
</script>
