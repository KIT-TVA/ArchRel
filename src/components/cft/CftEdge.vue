<template>
  <g v-if="sourceEl && targetEl" class="cft-edge-group" @click.stop="onClick">
    <template v-for="segGroup in segments" :key="'segGroup-' + segGroup.logicalIndex">
      <template v-for="(line, j) in segGroup.lines" :key="'line-' + segGroup.logicalIndex + '-' + j">
        <line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
          :stroke="isSelected ? '#212529' : '#495057'" stroke-width="1.5" stroke-linecap="round"/>
        <line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
          stroke="transparent" stroke-width="14" class="cursor-pointer"
          @dblclick.stop="addWaypointOnSegment($event, segGroup.logicalIndex)"/>
      </template>
    </template>
    <polygon :points="arrowheadPoints" :fill="isSelected ? '#212529' : '#495057'"/>
    <template v-if="isSelected">
      <circle v-for="(wp, i) in visibleWaypoints" :key="'wp-' + i"
        :cx="wp.x" :cy="wp.y" r="5" fill="#ffffff" stroke="#495057" stroke-width="1.5"
        class="waypoint-handle"
        @mousedown.stop="startDragWaypoint($event, wp)"
        @dblclick.stop="removeWaypoint(wp)"/>
    </template>
    <circle v-if="isSelected" :cx="midPoint.x" :cy="midPoint.y"
      r="10" fill="none" stroke="#495057" stroke-width="1" opacity="0.3" stroke-dasharray="3 2"/>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCftStore } from '../../stores/cft.js'

interface Point { x: number; y: number }
interface WaypointItem extends Point { originalIndex?: number; isVirtual?: boolean; virtualIndex?: number }

const props = defineProps<{
  edge: { id: string; sourceId: string; targetId: string; sourcePort?: number; targetPort?: number; waypoints?: Point[] }
}>()

const store = useCftStore()
const isSelected = computed(() => store.selectedNodeId === props.edge.id)

function lookupElement(id: string) {
  const cft = store.activeCft
  if (!cft) return null
  return cft.nodes.find(n => n.id === id) ?? cft.gates.find(g => g.id === id) ?? cft.subComponents.find(s => s.id === id) ?? null
}

function getConnectionPoint(el: any, isSource: boolean, portIndex = 0, portCount = 1): Point {
  if (!el) return { x: 0, y: 0 }
  if (el.type === 'event') return { x: el.x, y: el.y - 26 }
  if (el.type === 'inputPort') return { x: el.x, y: el.y - 12 }
  if (el.type === 'outputPort') return { x: el.x, y: el.y + 12 }
  if (el.type === 'AND' || el.type === 'OR') {
    if (isSource) return { x: el.x + el.width / 2, y: el.y }
    const xPos = el.x + el.width * (portIndex + 1) / (portCount + 1)
    return { x: xPos, y: el.y + el.height }
  }
  if (el.width !== undefined && el.height !== undefined) {
    if (isSource) return { x: el.x + el.width * (portIndex + 1) / (portCount + 1), y: el.y }
    return { x: el.x + el.width * (portIndex + 1) / (portCount + 1), y: el.y + el.height }
  }
  return { x: el.x, y: el.y }
}

const sourceEl = computed(() => lookupElement(props.edge.sourceId))
const targetEl = computed(() => lookupElement(props.edge.targetId))

const sourceEdge = computed(() => {
  const el = sourceEl.value
  if (!el) return { x: 0, y: 0 }
  const { x, y, width, height, type } = el
  const portCounts = store.getPortCount(props.edge.sourceId)
  return getConnectionPoint({ x, y, width, height, type }, true, props.edge.sourcePort ?? 0, portCounts.outputs)
})
const targetEdge = computed(() => {
  const el = targetEl.value
  if (!el) return { x: 0, y: 0 }
  const { x, y, width, height, type } = el
  const portCounts = store.getPortCount(props.edge.targetId)
  return getConnectionPoint({ x, y, width, height, type }, false, props.edge.targetPort ?? 0, portCounts.inputs)
})

const waypoints = computed(() => props.edge.waypoints || [])

const visibleWaypoints = computed((): WaypointItem[] => {
  if (waypoints.value.length > 0) {
    return waypoints.value.map((wp, i) => ({ ...wp, originalIndex: i, isVirtual: false }))
  }
  const p1 = sourceEdge.value; const p2 = targetEdge.value
  return [{ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, isVirtual: true, virtualIndex: 0 }]
})

const allPoints = computed(() => [sourceEdge.value, ...waypoints.value, targetEdge.value])

const segments = computed(() => {
  const pts = allPoints.value
  const result: { logicalIndex: number; lines: { x1: number; y1: number; x2: number; y2: number }[] }[] = []
  if (pts.length === 2) {
    const [p1, p2] = pts
    const midY = (p1.y + p2.y) / 2
    result.push({ logicalIndex: 0, lines: [
      { x1: p1.x, y1: p1.y, x2: p1.x, y2: midY },
      { x1: p1.x, y1: midY, x2: p2.x, y2: midY },
      { x1: p2.x, y1: midY, x2: p2.x, y2: p2.y },
    ].filter(l => l.x1 !== l.x2 || l.y1 !== l.y2) })
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      const [p1, p2] = [pts[i], pts[i + 1]]
      let lines
      if (i === pts.length - 2) {
        const midY = (p1.y + p2.y) / 2
        lines = [
          { x1: p1.x, y1: p1.y, x2: p1.x, y2: midY },
          { x1: p1.x, y1: midY, x2: p2.x, y2: midY },
          { x1: p2.x, y1: midY, x2: p2.x, y2: p2.y },
        ]
      } else {
        lines = [
          { x1: p1.x, y1: p1.y, x2: p1.x, y2: p2.y },
          { x1: p1.x, y1: p2.y, x2: p2.x, y2: p2.y },
        ]
      }
      result.push({ logicalIndex: i, lines: lines.filter(l => l.x1 !== l.x2 || l.y1 !== l.y2) })
    }
  }
  return result
})

const midPoint = computed(() => {
  const segs = segments.value
  if (!segs.length) return { x: 0, y: 0 }
  const allLines = segs.flatMap(s => s.lines)
  let totalLen = 0
  const segLens: number[] = []
  for (const line of allLines) {
    const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1)
    segLens.push(len); totalLen += len
  }
  let halfLen = totalLen / 2
  for (let i = 0; i < segLens.length; i++) {
    if (halfLen <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] > 0 ? halfLen / segLens[i] : 0
      const line = allLines[i]
      return { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t }
    }
    halfLen -= segLens[i]
  }
  return { x: allLines[0].x1, y: allLines[0].y1 }
})

const arrowheadPoints = computed(() => {
  const segs = segments.value
  if (!segs.length) return ''
  const lastGroup = segs[segs.length - 1]
  const lines = lastGroup.lines
  if (!lines.length) return ''
  const lastLine = lines[lines.length - 1]
  const dx = lastLine.x2 - lastLine.x1; const dy = lastLine.y2 - lastLine.y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len; const uy = dy / len
  const px = -uy; const py = ux; const size = 8
  const tip = { x: lastLine.x2, y: lastLine.y2 }
  const left = { x: tip.x - ux * size + px * size * 0.4, y: tip.y - uy * size + py * size * 0.4 }
  const right = { x: tip.x - ux * size - px * size * 0.4, y: tip.y - uy * size - py * size * 0.4 }
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`
})

function onClick() { store.selectNode(props.edge.id, 'edge') }

function addWaypointOnSegment(e: MouseEvent, logicalIndex: number) {
  const target = e.target as SVGElement
  const svg = target.closest('svg')!
  const pt = svg.createSVGPoint()
  pt.x = e.clientX; pt.y = e.clientY
  const ctm = (target.closest('g[transform]') as SVGGraphicsElement)?.getCTM()
  if (ctm) {
    const transformed = pt.matrixTransform(ctm.inverse())
    store.addWaypoint(props.edge.id, logicalIndex, Math.round(transformed.x / 10) * 10, Math.round(transformed.y / 10) * 10)
  }
}

let dragState: { index: number; startX: number; startY: number; origX: number; origY: number } | null = null
function startDragWaypoint(e: MouseEvent, wp: WaypointItem) {
  if (e.button !== 0) return
  let targetIndex = wp.originalIndex ?? 0
  if (wp.isVirtual) {
    const vwp = visibleWaypoints.value
    store.updateEdge(props.edge.id, { waypoints: [{ x: vwp[0].x, y: vwp[0].y }] })
    targetIndex = wp.virtualIndex ?? 0
  }
  dragState = { index: targetIndex, startX: e.clientX, startY: e.clientY, origX: wp.x, origY: wp.y }
  window.addEventListener('mousemove', onDragWaypoint)
  window.addEventListener('mouseup', onEndDragWaypoint)
  e.preventDefault()
}
function onDragWaypoint(e: MouseEvent) {
  if (!dragState) return
  const zoom = (window as any).__cftZoom ?? 1
  const dx = (e.clientX - dragState.startX) / zoom; const dy = (e.clientY - dragState.startY) / zoom
  store.updateWaypoint(props.edge.id, dragState.index, Math.round((dragState.origX + dx) / 10) * 10, Math.round((dragState.origY + dy) / 10) * 10)
}
function onEndDragWaypoint() {
  dragState = null
  window.removeEventListener('mousemove', onDragWaypoint)
  window.removeEventListener('mouseup', onEndDragWaypoint)
}
function removeWaypoint(wp: WaypointItem) {
  if (wp.isVirtual) return
  store.removeWaypoint(props.edge.id, wp.originalIndex!)
}
</script>

<style scoped>
.cft-edge-group { cursor: pointer; }
.waypoint-handle { cursor: grab; transition: r 0.15s; }
.waypoint-handle:hover { r: 7; }
.waypoint-handle:active { cursor: grabbing; }
</style>
