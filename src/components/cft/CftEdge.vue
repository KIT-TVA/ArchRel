<template>
  <g v-if="sourceEl && targetEl" class="cft-edge-group" @click.stop="onClick">
    <!-- Line segments through waypoints -->
    <template v-for="segGroup in segments" :key="'segGroup-' + segGroup.logicalIndex">
      <template v-for="(line, j) in segGroup.lines" :key="'line-' + segGroup.logicalIndex + '-' + j">
        <line
          :x1="line.x1" :y1="line.y1"
          :x2="line.x2" :y2="line.y2"
          :stroke="isSelected ? '#212529' : '#495057'"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <!-- Invisible fat hit area for adding waypoints -->
        <line
          :x1="line.x1" :y1="line.y1"
          :x2="line.x2" :y2="line.y2"
          stroke="transparent"
          stroke-width="14"
          class="cursor-pointer"
          @dblclick.stop="addWaypointOnSegment($event, segGroup.logicalIndex)"
        />
      </template>
    </template>

    <!-- Arrowhead at target end -->
    <polygon
      :points="arrowheadPoints"
      :fill="isSelected ? '#212529' : '#495057'"
    />

    <!-- Waypoint handles (visible when selected) -->
    <template v-if="isSelected">
      <circle
        v-for="(wp, i) in visibleWaypoints"
        :key="'wp-' + i"
        :cx="wp.x" :cy="wp.y"
        r="5"
        fill="#ffffff"
        stroke="#495057"
        stroke-width="1.5"
        class="waypoint-handle"
        @mousedown.stop="startDragWaypoint($event, wp)"
        @dblclick.stop="removeWaypoint(wp)"
      />
    </template>

    <!-- Selection highlight -->
    <circle
      v-if="isSelected"
      :cx="midPoint.x" :cy="midPoint.y"
      r="10"
      fill="none"
      stroke="#495057"
      stroke-width="1"
      opacity="0.3"
      stroke-dasharray="3 2"
    />
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { useCftStore } from '../../stores/cft.js'

const props = defineProps({
  edge: { type: Object, required: true },
})

const store = useCftStore()
const isSelected = computed(() => store.selectedNodeId === props.edge.id)

/**
 * Directly look up an element by id from the active CFT's reactive arrays.
 * Returns the reactive object itself so Vue tracks x/y/width/height changes.
 */
function lookupElement(id) {
  const cft = store.activeCft
  if (!cft) return null
  const node = cft.nodes.find(n => n.id === id)
  if (node) return node
  const gate = cft.gates.find(g => g.id === id)
  if (gate) return gate
  const sc = cft.subComponents.find(s => s.id === id)
  if (sc) return sc
  return null
}

/**
 * Compute connection point for an element.
 * isSource=true  → use top/output connection point
 * isSource=false → use bottom/input connection point
 * portIndex: which port (0-based)
 * portCount: total ports on this side
 */
function getConnectionPoint(el, isSource, portIndex = 0, portCount = 1) {
  if (!el) return { x: 0, y: 0 }

  // Event node — top of circle (always 1 output, no inputs)
  if (el.type === 'event') {
    return { x: el.x, y: el.y - 18 }
  }
  // Input port — top (1 output)
  if (el.type === 'inputPort') {
    return { x: el.x, y: el.y - 12 }
  }
  // Output port — bottom (1 input)
  if (el.type === 'outputPort') {
    return { x: el.x, y: el.y + 12 }
  }
  // Gate (AND/OR/NOT/XOR) — top for output, bottom for inputs (distributed)
  if (el.type === 'AND' || el.type === 'OR' || el.type === 'NOT' || el.type === 'XOR') {
    if (isSource) {
      return { x: el.x + el.width / 2, y: el.y }
    } else {
      // Distribute input ports evenly along bottom edge
      const xPos = el.x + el.width * (portIndex + 1) / (portCount + 1)
      return { x: xPos, y: el.y + el.height }
    }
  }
  // Sub-component — distributed ports on top (outputs) and bottom (inputs)
  if (el.width !== undefined && el.height !== undefined) {
    if (isSource) {
      const xPos = el.x + el.width * (portIndex + 1) / (portCount + 1)
      return { x: xPos, y: el.y }
    } else {
      const xPos = el.x + el.width * (portIndex + 1) / (portCount + 1)
      return { x: xPos, y: el.y + el.height }
    }
  }
  return { x: el.x, y: el.y }
}

// Look up elements and compute connection points in a single computed
// so Vue directly tracks position property changes on the reactive objects
const sourceEl = computed(() => lookupElement(props.edge.sourceId))
const targetEl = computed(() => lookupElement(props.edge.targetId))

const sourceEdge = computed(() => {
  const el = sourceEl.value
  if (!el) return { x: 0, y: 0 }
  // Read x/y/width/height explicitly so Vue tracks them
  const { x, y, width, height, type } = el
  const portCounts = store.getPortCount(props.edge.sourceId)
  const portIndex = props.edge.sourcePort ?? 0
  return getConnectionPoint({ x, y, width, height, type }, true, portIndex, portCounts.outputs)
})
const targetEdge = computed(() => {
  const el = targetEl.value
  if (!el) return { x: 0, y: 0 }
  const { x, y, width, height, type } = el
  const portCounts = store.getPortCount(props.edge.targetId)
  const portIndex = props.edge.targetPort ?? 0
  return getConnectionPoint({ x, y, width, height, type }, false, portIndex, portCounts.inputs)
})

const waypoints = computed(() => props.edge.waypoints || [])

const visibleWaypoints = computed(() => {
  if (waypoints.value.length > 0) {
    return waypoints.value.map((wp, i) => ({ ...wp, originalIndex: i, isVirtual: false }))
  }
  // No real waypoints, calculate ONE virtual one for the Z-curve
  const p1 = sourceEdge.value
  const p2 = targetEdge.value
  const midY = (p1.y + p2.y) / 2
  const midX = (p1.x + p2.x) / 2
  return [
    { x: midX, y: midY, isVirtual: true, virtualIndex: 0 }
  ]
})

const allPoints = computed(() => [sourceEdge.value, ...waypoints.value, targetEdge.value])

const segments = computed(() => {
  const pts = allPoints.value
  const result = []
  
  if (pts.length === 2) {
    // No waypoints: standard midY Z-curve
    const p1 = pts[0]
    const p2 = pts[1]
    const midY = (p1.y + p2.y) / 2
    result.push({
      logicalIndex: 0,
      lines: [
        { x1: p1.x, y1: p1.y, x2: p1.x, y2: midY },
        { x1: p1.x, y1: midY, x2: p2.x, y2: midY },
        { x1: p2.x, y1: midY, x2: p2.x, y2: p2.y }
      ].filter(l => l.x1 !== l.x2 || l.y1 !== l.y2)
    })
  } else {
    // Has waypoints: use them as exact corners for orthogonal routing
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i]
      const p2 = pts[i + 1]
      let lines = []
      
      if (i === pts.length - 2) {
        // Last segment entering target: Vertical then Horizontal then Vertical
        const midY = (p1.y + p2.y) / 2
        lines = [
          { x1: p1.x, y1: p1.y, x2: p1.x, y2: midY },
          { x1: p1.x, y1: midY, x2: p2.x, y2: midY },
          { x1: p2.x, y1: midY, x2: p2.x, y2: p2.y }
        ]
      } else {
        // Source to Waypoint, or Waypoint to Waypoint: Vertical then Horizontal
        lines = [
          { x1: p1.x, y1: p1.y, x2: p1.x, y2: p2.y },
          { x1: p1.x, y1: p2.y, x2: p2.x, y2: p2.y }
        ]
      }
      
      result.push({
        logicalIndex: i,
        lines: lines.filter(l => l.x1 !== l.x2 || l.y1 !== l.y2)
      })
    }
  }
  return result
})

const midPoint = computed(() => {
  const segs = segments.value
  if (!segs.length) return { x: 0, y: 0 }
  
  const allLines = segs.flatMap(s => s.lines)
  let totalLen = 0
  const segLens = []
  for (const line of allLines) {
    const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1)
    segLens.push(len)
    totalLen += len
  }
  let halfLen = totalLen / 2
  for (let i = 0; i < segLens.length; i++) {
    if (halfLen <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] > 0 ? halfLen / segLens[i] : 0
      const line = allLines[i]
      return {
        x: line.x1 + (line.x2 - line.x1) * t,
        y: line.y1 + (line.y2 - line.y1) * t,
      }
    }
    halfLen -= segLens[i]
  }
  return { x: allLines[0].x1, y: allLines[0].y1 }
})

// Arrowhead at the target end
const arrowheadPoints = computed(() => {
  const segs = segments.value
  if (!segs.length) return ''
  const lastGroup = segs[segs.length - 1]
  const lines = lastGroup.lines
  if (!lines.length) return ''
  const lastLine = lines[lines.length - 1]
  
  const dx = lastLine.x2 - lastLine.x1
  const dy = lastLine.y2 - lastLine.y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Perpendicular
  const px = -uy
  const py = ux
  const size = 8
  const tip = { x: lastLine.x2, y: lastLine.y2 }
  const left = { x: tip.x - ux * size + px * size * 0.4, y: tip.y - uy * size + py * size * 0.4 }
  const right = { x: tip.x - ux * size - px * size * 0.4, y: tip.y - uy * size - py * size * 0.4 }
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`
})

function onClick() {
  store.selectNode(props.edge.id, 'edge')
}

function addWaypointOnSegment(e, logicalIndex) {
  const svg = e.target.closest('svg')
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = e.target.closest('g[transform]')?.getCTM()
  if (ctm) {
    const transformed = pt.matrixTransform(ctm.inverse())
    store.addWaypoint(
      props.edge.id,
      logicalIndex,
      Math.round(transformed.x / 10) * 10,
      Math.round(transformed.y / 10) * 10
    )
  }
}

let dragState = null
function startDragWaypoint(e, wp) {
  if (e.button !== 0) return
  
  let targetIndex = wp.originalIndex
  
  if (wp.isVirtual) {
    // Instantiate the 1 virtual waypoint into a real waypoint before dragging starts
    const vwp = visibleWaypoints.value
    store.updateEdge(props.edge.id, { 
      waypoints: [
        { x: vwp[0].x, y: vwp[0].y }
      ] 
    })
    targetIndex = wp.virtualIndex
  }

  dragState = { 
    index: targetIndex, 
    startX: e.clientX, 
    startY: e.clientY, 
    origX: wp.x, 
    origY: wp.y 
  }
  window.addEventListener('mousemove', onDragWaypoint)
  window.addEventListener('mouseup', onEndDragWaypoint)
  e.preventDefault()
}
function onDragWaypoint(e) {
  if (!dragState) return
  const zoom = window.__cftZoom ?? 1
  const dx = (e.clientX - dragState.startX) / zoom
  const dy = (e.clientY - dragState.startY) / zoom
  store.updateWaypoint(
    props.edge.id, 
    dragState.index, 
    Math.round((dragState.origX + dx) / 10) * 10, 
    Math.round((dragState.origY + dy) / 10) * 10
  )
}
function onEndDragWaypoint() {
  dragState = null
  window.removeEventListener('mousemove', onDragWaypoint)
  window.removeEventListener('mouseup', onEndDragWaypoint)
}

function removeWaypoint(wp) {
  if (wp.isVirtual) return // Cannot remove virtual waypoints
  store.removeWaypoint(props.edge.id, wp.originalIndex)
}
</script>

<style scoped>
.cft-edge-group {
  cursor: pointer;
}
.waypoint-handle {
  cursor: grab;
  transition: r 0.15s;
}
.waypoint-handle:hover {
  r: 7;
}
.waypoint-handle:active {
  cursor: grabbing;
}
</style>
