<template>
  <g v-if="reqComp && provComp" class="connection-group" @click.stop="onClick">
    <!-- Line segments through waypoints -->
    <template v-for="(seg, i) in segments" :key="'seg-' + i">
      <line
        :x1="seg.x1" :y1="seg.y1"
        :x2="seg.x2" :y2="seg.y2"
        :stroke="isSelected ? '#212529' : '#343a40'"
        stroke-width="2"
        stroke-linecap="round"
      />
      <!-- Invisible fat hit area for adding waypoints via double-click -->
      <line
        :x1="seg.x1" :y1="seg.y1"
        :x2="seg.x2" :y2="seg.y2"
        stroke="transparent"
        stroke-width="14"
        class="cursor-pointer"
        @dblclick.stop="addWaypointOnSegment($event, i)"
      />
    </template>

    <!-- Lollipop at midpoint of the whole path -->
    <!-- Socket (required half-arc) -->
    <path
      :d="socketPath"
      fill="none"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="2"
    />
    <!-- Ball (provided circle) -->
    <circle
      :cx="ballPos.x"
      :cy="ballPos.y"
      r="6"
      :fill="isSelected ? '#e9ecef' : '#ffffff'"
      :stroke="isSelected ? '#212529' : '#343a40'"
      stroke-width="2"
    />

    <!-- Waypoint handles (visible when selected) -->
    <template v-if="isSelected">
      <circle
        v-for="(wp, i) in waypoints"
        :key="'wp-' + i"
        :cx="wp.x" :cy="wp.y"
        r="5"
        fill="#ffffff"
        stroke="#495057"
        stroke-width="1.5"
        class="waypoint-handle"
        @mousedown.stop="startDragWaypoint($event, i)"
        @dblclick.stop="removeWaypoint(i)"
      />
    </template>

    <!-- Interface name label below the lollipop -->
    <text
      :x="lollipopMid.x"
      :y="lollipopMid.y + 22"
      text-anchor="middle"
      class="iface-label"
      :class="{ 'selected-label': isSelected }"
    >{{ iface.name }}</text>

    <!-- Selection highlight ring -->
    <circle v-if="isSelected" :cx="lollipopMid.x" :cy="lollipopMid.y" r="18" fill="none" stroke="#495057" stroke-width="1" opacity="0.3" stroke-dasharray="3 2"/>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagram.js'

const store = useDiagramStore()

const props = defineProps({
  iface: { type: Object, required: true },
})

const SOCKET_R = 8
const BALL_R = 6
const GAP = 0

const isSelected = computed(() => store.selectedId === props.iface.id)

const reqComp = computed(() => store.components.find(c => c.id === props.iface.requiredComponentId))
const provComp = computed(() => store.components.find(c => c.id === props.iface.providedComponentId))

// Centers
const reqCenter = computed(() => {
  const c = reqComp.value
  return c ? { x: c.x + c.width / 2, y: c.y + c.height / 2 } : { x: 0, y: 0 }
})
const provCenter = computed(() => {
  const c = provComp.value
  return c ? { x: c.x + c.width / 2, y: c.y + c.height / 2 } : { x: 0, y: 0 }
})

// Edge intersection
function edgePoint(comp, targetX, targetY) {
  const cx = comp.x + comp.width / 2
  const cy = comp.y + comp.height / 2
  const dx = targetX - cx
  const dy = targetY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const hw = comp.width / 2
  const hh = comp.height / 2
  const sx = hw / Math.abs(dx || 0.001)
  const sy = hh / Math.abs(dy || 0.001)
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

const waypoints = computed(() => props.iface.waypoints || [])

// Edge points aim toward the first/last waypoint, or toward the other component center
const reqEdge = computed(() => {
  if (!reqComp.value) return { x: 0, y: 0 }
  const target = waypoints.value.length > 0 ? waypoints.value[0] : provCenter.value
  return edgePoint(reqComp.value, target.x, target.y)
})
const provEdge = computed(() => {
  if (!provComp.value) return { x: 0, y: 0 }
  const target = waypoints.value.length > 0 ? waypoints.value[waypoints.value.length - 1] : reqCenter.value
  return edgePoint(provComp.value, target.x, target.y)
})

// Full path of points: reqEdge → waypoints → provEdge
const allPoints = computed(() => [reqEdge.value, ...waypoints.value, provEdge.value])

// Compute total path length and find the midpoint along it
function pathMidpoint(points) {
  let totalLen = 0
  const segLens = []
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y)
    segLens.push(len)
    totalLen += len
  }
  let halfLen = totalLen / 2
  for (let i = 0; i < segLens.length; i++) {
    if (halfLen <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] > 0 ? halfLen / segLens[i] : 0
      return {
        x: points[i].x + (points[i+1].x - points[i].x) * t,
        y: points[i].y + (points[i+1].y - points[i].y) * t,
        // Direction of this segment
        dx: points[i+1].x - points[i].x,
        dy: points[i+1].y - points[i].y,
      }
    }
    halfLen -= segLens[i]
  }
  return { x: points[0].x, y: points[0].y, dx: 1, dy: 0 }
}

const lollipopMid = computed(() => {
  const pts = allPoints.value
  return pathMidpoint(pts)
})

// Direction vector at the lollipop midpoint
const dir = computed(() => {
  const m = lollipopMid.value
  const len = Math.hypot(m.dx, m.dy) || 1
  return { x: m.dx / len, y: m.dy / len }
})
const perp = computed(() => ({ x: -dir.value.y, y: dir.value.x }))

// Lollipop positions (with a slight 1.5px visual gap)
const socketCenter = computed(() => ({
  x: lollipopMid.value.x - dir.value.x * 1.5,
  y: lollipopMid.value.y - dir.value.y * 1.5,
}))
const ballPos = computed(() => ({
  x: lollipopMid.value.x + dir.value.x * 1.5,
  y: lollipopMid.value.y + dir.value.y * 1.5,
}))

// Segments: the polyline broken into individual line segments,
// with a gap carved out around the lollipop midpoint
const segments = computed(() => {
  const pts = allPoints.value
  const mid = lollipopMid.value
  const d = dir.value
  const gapStartOffset = SOCKET_R + 1.5 // space for the socket arc + gap
  const gapEndOffset = BALL_R + 1.5 // space for the ball + gap

  // Find which segment the lollipop sits on
  let cumLen = 0
  let totalLen = 0
  const segLens = []
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y)
    segLens.push(len)
    totalLen += len
  }
  const halfTotal = totalLen / 2

  const result = []
  cumLen = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const segStart = cumLen
    const segEnd = cumLen + segLens[i]
    const gapStart = halfTotal - gapStartOffset
    const gapEnd = halfTotal + gapEndOffset

    const a = pts[i]
    const b = pts[i+1]

    if (segEnd <= gapStart || segStart >= gapEnd) {
      // Segment fully outside the gap
      result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    } else {
      // Segment overlaps the gap — split it
      const len = segLens[i] || 1
      if (segStart < gapStart) {
        const t = (gapStart - segStart) / len
        result.push({ x1: a.x, y1: a.y, x2: a.x + (b.x - a.x) * t, y2: a.y + (b.y - a.y) * t })
      }
      if (segEnd > gapEnd) {
        const t = (gapEnd - segStart) / len
        result.push({ x1: a.x + (b.x - a.x) * t, y1: a.y + (b.y - a.y) * t, x2: b.x, y2: b.y })
      }
    }
    cumLen = segEnd
  }
  return result
})

// Socket arc
const socketPath = computed(() => {
  const p = perp.value
  const r = SOCKET_R
  const cx = socketCenter.value.x
  const cy = socketCenter.value.y
  const startX = cx + p.x * r
  const startY = cy + p.y * r
  const endX = cx - p.x * r
  const endY = cy - p.y * r
  return `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`
})

// Click to select
function onClick() {
  store.selectItem(props.iface.id, 'interface')
}

// Double-click on a segment to add a waypoint
function addWaypointOnSegment(e, segIndex) {
  const zoom = window.__archrelZoom ?? 1
  const svg = e.target.closest('svg')
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = e.target.closest('g[transform]')?.getCTM()
  if (ctm) {
    const inv = ctm.inverse()
    const transformed = pt.matrixTransform(inv)
    // Find which actual waypoint index this corresponds to
    // We need to figure out the insertion index in the waypoints array
    // Segments go: reqEdge→wp0, wp0→wp1, ..., wpN→provEdge
    // segIndex in segments may differ from allPoints because of gap splitting,
    // so use the click position to determine insertion index
    const wp = waypoints.value
    const clickPt = { x: transformed.x, y: transformed.y }
    // Find closest segment in allPoints
    let bestIdx = 0
    let bestDist = Infinity
    const pts = allPoints.value
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSeg(clickPt, pts[i], pts[i+1])
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    // Insert after bestIdx in waypoints (bestIdx 0 = before first wp = index 0)
    store.addWaypoint(props.iface.id, bestIdx, clickPt.x, clickPt.y)
  }
}

function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Drag a waypoint
let dragState = null
function startDragWaypoint(e, index) {
  if (e.button !== 0) return
  const zoom = window.__archrelZoom ?? 1
  dragState = { index, startX: e.clientX, startY: e.clientY, origX: waypoints.value[index].x, origY: waypoints.value[index].y }
  window.addEventListener('mousemove', onDragWaypoint)
  window.addEventListener('mouseup', onEndDragWaypoint)
  e.preventDefault()
}
function onDragWaypoint(e) {
  if (!dragState) return
  const zoom = window.__archrelZoom ?? 1
  const dx = (e.clientX - dragState.startX) / zoom
  const dy = (e.clientY - dragState.startY) / zoom
  store.updateWaypoint(props.iface.id, dragState.index, dragState.origX + dx, dragState.origY + dy)
}
function onEndDragWaypoint() {
  dragState = null
  window.removeEventListener('mousemove', onDragWaypoint)
  window.removeEventListener('mouseup', onEndDragWaypoint)
}

// Remove a waypoint via double-click on the handle
function removeWaypoint(index) {
  store.removeWaypoint(props.iface.id, index)
}
</script>

<style scoped>
.connection-group {
  cursor: pointer;
}
.iface-label {
  font-size: 11px;
  fill: var(--color-text-secondary);
  font-family: var(--font-sans);
  pointer-events: none;
  user-select: none;
}
.selected-label {
  fill: var(--color-accent-hover);
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
