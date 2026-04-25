import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

/**
 * CFT Store — manages Component Fault Tree data for all components.
 *
 * Data model per component (cfts[componentId]):
 *   nodes:         basic events, input ports, output ports
 *   gates:         AND, OR, NOT, XOR
 *   subComponents: references to other components' CFTs
 *   edges:         directed links (sourceId → targetId)
 */
export const useCftStore = defineStore('cft', {
    state: () => ({
        /** Map of componentId → CFT data object */
        cfts: {},
        /** Currently edited component id (null when CFT editor is closed) */
        activeComponentId: null,
        /** Selection within the CFT editor */
        selectedNodeId: null,
        selectedNodeType: null, // 'event' | 'inputPort' | 'outputPort' | 'gate' | 'edge' | 'subComponent'
        /** Edge-drawing mode */
        connectMode: false,
        connectSourceId: null,
        connectSourcePort: 0,
    }),

    getters: {
        /** The CFT object for the currently active component */
        activeCft: (state) => {
            if (!state.activeComponentId) return null
            return state.cfts[state.activeComponentId] || null
        },

        /** All nodes (events + ports) of the active CFT */
        activeNodes: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.nodes : []
        },

        /** All gates of the active CFT */
        activeGates: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.gates : []
        },

        /** All sub-component refs of the active CFT */
        activeSubComponents: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.subComponents : []
        },

        /** All edges of the active CFT */
        activeEdges: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.edges : []
        },

        /** Events only */
        activeEvents: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.nodes.filter(n => n.type === 'event') : []
        },

        /** Input ports only */
        activeInputPorts: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.nodes.filter(n => n.type === 'inputPort') : []
        },

        /** Output ports only */
        activeOutputPorts: (state) => {
            const cft = state.cfts[state.activeComponentId]
            return cft ? cft.nodes.filter(n => n.type === 'outputPort') : []
        },

        /** Currently selected node/gate/edge object */
        selectedItem: (state) => {
            if (!state.selectedNodeId || !state.activeComponentId) return null
            const cft = state.cfts[state.activeComponentId]
            if (!cft) return null

            switch (state.selectedNodeType) {
                case 'event':
                case 'inputPort':
                case 'outputPort':
                    return cft.nodes.find(n => n.id === state.selectedNodeId) || null
                case 'gate':
                    return cft.gates.find(g => g.id === state.selectedNodeId) || null
                case 'edge':
                    return cft.edges.find(e => e.id === state.selectedNodeId) || null
                case 'subComponent':
                    return cft.subComponents.find(sc => sc.id === state.selectedNodeId) || null
                default:
                    return null
            }
        },
    },

    actions: {
        // ── Lifecycle ────────────────────────────────────────────

        /** Open CFT editor for a component. Creates empty CFT if none exists. */
        openCft(componentId) {
            let isNew = false
            if (!this.cfts[componentId]) {
                this.cfts[componentId] = {
                    nodes: [],
                    gates: [],
                    subComponents: [],
                    edges: [],
                }
                isNew = true
            }
            this.activeComponentId = componentId
            this.deselect()
            this.connectMode = false
            this.connectSourceId = null
            this.connectSourcePort = 0

            if (isNew) {
                // Add default event and output port, then connect them
                const event = this.addEvent(300, 150)
                const outPort = this.addOutputPort(300, 50)
                if (event && outPort) {
                    this.addEdge(event.id, outPort.id, 0, 0)
                }
                this.deselect() // Clear selection after adding defaults
            }
        },

        /** Close the CFT editor */
        closeCft() {
            this.activeComponentId = null
            this.deselect()
            this.connectMode = false
            this.connectSourceId = null
            this.connectSourcePort = 0
        },

        /** Remove CFT data for a deleted component */
        removeCft(componentId) {
            delete this.cfts[componentId]
            if (this.activeComponentId === componentId) {
                this.closeCft()
            }
        },

        // ── Selection ────────────────────────────────────────────

        selectNode(id, type) {
            this.selectedNodeId = id
            this.selectedNodeType = type
        },

        deselect() {
            this.selectedNodeId = null
            this.selectedNodeType = null
        },

        // ── Connect Mode ─────────────────────────────────────────

        toggleConnectMode() {
            this.connectMode = !this.connectMode
            this.connectSourceId = null
            this.connectSourcePort = 0
            if (this.connectMode) {
                this.deselect()
            }
        },

        setConnectSource(id, port = 0) {
            this.connectSourceId = id
            this.connectSourcePort = port
        },

        cancelConnect() {
            this.connectMode = false
            this.connectSourceId = null
            this.connectSourcePort = 0
        },

        // ── Add Nodes ────────────────────────────────────────────

        addEvent(x = 300, y = 300) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            const node = {
                id: uuidv4(),
                type: 'event',
                name: 'Event',
                x,
                y,
                probability: 0.0,
            }
            cft.nodes.push(node)
            this.selectNode(node.id, 'event')
            return node
        },

        addInputPort(x = 200, y = 500) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            const node = {
                id: uuidv4(),
                type: 'inputPort',
                name: 'In',
                x,
                y,
            }
            cft.nodes.push(node)
            this.selectNode(node.id, 'inputPort')
            return node
        },

        addOutputPort(x = 200, y = 50) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            const node = {
                id: uuidv4(),
                type: 'outputPort',
                name: 'Out',
                x,
                y,
            }
            cft.nodes.push(node)
            this.selectNode(node.id, 'outputPort')
            return node
        },

        // ── Add Gates ────────────────────────────────────────────

        addGate(type = 'AND', x = 300, y = 200) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            if (!['AND', 'OR', 'NOT', 'XOR'].includes(type)) return null
            const gate = {
                id: uuidv4(),
                type,
                x,
                y,
                width: 60,
                height: 50,
                inputCount: type === 'NOT' ? 1 : 2,
            }
            cft.gates.push(gate)
            this.selectNode(gate.id, 'gate')
            return gate
        },

        // ── Sub-Components ───────────────────────────────────────

        addSubComponent(refComponentId, x = 300, y = 300) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            // Don't allow self-reference
            if (refComponentId === this.activeComponentId) return null
            const sc = {
                id: uuidv4(),
                refComponentId,
                name: 'Sub',
                x,
                y,
                width: 140,
                height: 100,
            }
            cft.subComponents.push(sc)
            this.selectNode(sc.id, 'subComponent')
            return sc
        },

        // ── Add Edges ────────────────────────────────────────────

        /**
         * Add a directed edge from sourceId to targetId.
         * Enforces: no duplicate connections on the same target port.
         * Returns the edge object or null if invalid.
         */
        addEdge(sourceId, targetId, sourcePort = 0, targetPort = 0) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            if (sourceId === targetId) return null

            // Check no duplicate on same (target, targetPort) pair
            const existing = cft.edges.find(e => e.targetId === targetId && e.targetPort === targetPort)
            if (existing) return null

            // Check no direct cycle (source ← target path)
            if (this._wouldCreateCycle(cft, sourceId, targetId)) return null

            const edge = {
                id: uuidv4(),
                sourceId,
                targetId,
                sourcePort,
                targetPort,
                waypoints: [],
            }
            cft.edges.push(edge)
            this.selectNode(edge.id, 'edge')
            this.connectMode = false
            this.connectSourceId = null
            this.connectSourcePort = 0
            return edge
        },

        /** Simple DFS cycle check: would adding targetId→sourceId create a path? */
        _wouldCreateCycle(cft, sourceId, targetId) {
            // We want to check if there's already a path from targetId to sourceId
            const visited = new Set()
            const stack = [targetId]
            while (stack.length > 0) {
                const current = stack.pop()
                if (current === sourceId) return true
                if (visited.has(current)) continue
                visited.add(current)
                // Find edges where current is the source
                cft.edges.forEach(e => {
                    if (e.sourceId === current) {
                        stack.push(e.targetId)
                    }
                })
            }
            return false
        },

        // ── Update ───────────────────────────────────────────────

        updateNode(id, updates) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const idx = cft.nodes.findIndex(n => n.id === id)
            if (idx !== -1) {
                cft.nodes[idx] = { ...cft.nodes[idx], ...updates }
            }
        },

        updateGate(id, updates) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const idx = cft.gates.findIndex(g => g.id === id)
            if (idx !== -1) {
                // If inputCount is being reduced, remove edges on ports that no longer exist
                if (updates.inputCount !== undefined) {
                    const gate = cft.gates[idx]
                    const newCount = updates.inputCount
                    if (newCount < (gate.inputCount ?? 2)) {
                        cft.edges = cft.edges.filter(e => {
                            if (e.targetId === id && e.targetPort >= newCount) return false
                            return true
                        })
                    }
                    // Enforce NOT gates to always have inputCount=1
                    if ((updates.type || gate.type) === 'NOT') {
                        updates.inputCount = 1
                    }
                }
                // When changing gate type to NOT, enforce inputCount=1 and clean up
                if (updates.type === 'NOT' && cft.gates[idx].inputCount > 1) {
                    updates.inputCount = 1
                    cft.edges = cft.edges.filter(e => {
                        if (e.targetId === id && e.targetPort >= 1) return false
                        return true
                    })
                }
                cft.gates[idx] = { ...cft.gates[idx], ...updates }
            }
        },

        updateSubComponent(id, updates) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const idx = cft.subComponents.findIndex(sc => sc.id === id)
            if (idx !== -1) {
                cft.subComponents[idx] = { ...cft.subComponents[idx], ...updates }
            }
        },

        updateEdge(id, updates) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const idx = cft.edges.findIndex(e => e.id === id)
            if (idx !== -1) {
                cft.edges[idx] = { ...cft.edges[idx], ...updates }
            }
        },

        // ── Remove ───────────────────────────────────────────────

        removeNode(id) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            cft.nodes = cft.nodes.filter(n => n.id !== id)
            // Remove connected edges
            cft.edges = cft.edges.filter(e => e.sourceId !== id && e.targetId !== id)
            if (this.selectedNodeId === id) this.deselect()
        },

        removeGate(id) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            cft.gates = cft.gates.filter(g => g.id !== id)
            // Remove connected edges
            cft.edges = cft.edges.filter(e => e.sourceId !== id && e.targetId !== id)
            if (this.selectedNodeId === id) this.deselect()
        },

        removeSubComponent(id) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            cft.subComponents = cft.subComponents.filter(sc => sc.id !== id)
            // Remove connected edges
            cft.edges = cft.edges.filter(e => e.sourceId !== id && e.targetId !== id)
            if (this.selectedNodeId === id) this.deselect()
        },

        removeEdge(id) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            cft.edges = cft.edges.filter(e => e.id !== id)
            if (this.selectedNodeId === id) this.deselect()
        },

        removeSelected() {
            if (!this.selectedNodeId) return
            switch (this.selectedNodeType) {
                case 'event':
                case 'inputPort':
                case 'outputPort':
                    this.removeNode(this.selectedNodeId)
                    break
                case 'gate':
                    this.removeGate(this.selectedNodeId)
                    break
                case 'subComponent':
                    this.removeSubComponent(this.selectedNodeId)
                    break
                case 'edge':
                    this.removeEdge(this.selectedNodeId)
                    break
            }
        },

        // ── Edge Waypoints ───────────────────────────────────────

        addWaypoint(edgeId, index, x, y) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const edge = cft.edges.find(e => e.id === edgeId)
            if (!edge) return
            if (!edge.waypoints) edge.waypoints = []
            edge.waypoints.splice(index, 0, { x, y })
        },

        updateWaypoint(edgeId, index, x, y) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const edge = cft.edges.find(e => e.id === edgeId)
            if (!edge || !edge.waypoints || !edge.waypoints[index]) return
            edge.waypoints[index] = { x, y }
        },

        removeWaypoint(edgeId, index) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const edge = cft.edges.find(e => e.id === edgeId)
            if (!edge || !edge.waypoints) return
            edge.waypoints.splice(index, 1)
        },

        // ── Helpers ──────────────────────────────────────────────

        /**
         * Find a node, gate, or sub-component by id within the active CFT.
         * Returns { item, kind } or null.
         */
        findElement(id) {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null

            const node = cft.nodes.find(n => n.id === id)
            if (node) return { item: node, kind: node.type }

            const gate = cft.gates.find(g => g.id === id)
            if (gate) return { item: gate, kind: 'gate' }

            const sc = cft.subComponents.find(s => s.id === id)
            if (sc) return { item: sc, kind: 'subComponent' }

            return null
        },

        /** Get the display name for an element id */
        elementName(id) {
            const el = this.findElement(id)
            if (!el) return '—'
            return el.item.name || el.item.type || '—'
        },

        /**
         * Get port counts for an element.
         * Returns { inputs, outputs } where each is a positive integer.
         */
        getPortCount(id) {
            const el = this.findElement(id)
            if (!el) return { inputs: 0, outputs: 0 }

            const { item, kind } = el
            switch (kind) {
                case 'event':
                    return { inputs: 0, outputs: 1 }
                case 'inputPort':
                    // Input ports feed INTO the CFT → they are sources (outputs from the port's perspective)
                    return { inputs: 0, outputs: 1 }
                case 'outputPort':
                    // Output ports receive FROM the CFT → they are targets (inputs from the port's perspective)
                    return { inputs: 1, outputs: 0 }
                case 'gate':
                    return { inputs: item.inputCount ?? (item.type === 'NOT' ? 1 : 2), outputs: 1 }
                case 'subComponent': {
                    // Derive port count from the referenced component's CFT
                    const refCft = this.cfts[item.refComponentId]
                    if (!refCft) return { inputs: 1, outputs: 1 }
                    const inputPorts = refCft.nodes.filter(n => n.type === 'inputPort').length
                    const outputPorts = refCft.nodes.filter(n => n.type === 'outputPort').length
                    return {
                        inputs: Math.max(1, inputPorts),
                        outputs: Math.max(1, outputPorts),
                    }
                }
                default:
                    return { inputs: 1, outputs: 1 }
            }
        },
    },
})
