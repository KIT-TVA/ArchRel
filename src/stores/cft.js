import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { useDiagramStore } from './diagram.js'

export const SYSTEM_CFT_KEY = '__system__'

/**
 * Builds the full strict failure model CFT for a component (used for auto-generated CFTs).
 * Leaf: output port ← intrinsic failure event
 * Non-leaf: output port ← OR gate ← [intrinsic failure event, dep1, dep2, ...]
 */
function _buildFullStrictModel(component, diagramStore) {
    const children = diagramStore.components.filter(c => c.parentId === component.id)
    const providers = diagramStore.interfaces
        .filter(i => i.requiredComponentId === component.id)
        .map(i => diagramStore.components.find(c => c.id === i.providedComponentId))
        .filter(Boolean)
    const allDeps = [...children, ...providers]

    const CENTER_X = 300
    const OR_GATE_W = 60
    const H_SPACING = 180
    const outPortId = uuidv4()
    const eventId = uuidv4()

    if (allDeps.length === 0) {
        return {
            nodes: [
                { id: outPortId, type: 'outputPort', name: 'Out', x: CENTER_X, y: 60 },
                { id: eventId, type: 'event', name: `f(${component.name})`, x: CENTER_X, y: 200, probability: component.intrinsicFailureRate ?? 0, isIntrinsic: true },
            ],
            gates: [],
            subComponents: [],
            edges: [
                { id: uuidv4(), sourceId: eventId, targetId: outPortId, sourcePort: 0, targetPort: 0, waypoints: [] },
            ],
        }
    }

    const totalItems = allDeps.length + 1
    const totalWidth = (totalItems - 1) * H_SPACING
    const startX = CENTER_X - totalWidth / 2
    const gateId = uuidv4()

    const subComponents = allDeps.map((dep, i) => ({
        id: uuidv4(),
        refComponentId: dep.id,
        name: dep.name,
        x: startX + (i + 1) * H_SPACING - 70,
        y: 270,
        width: 140,
        height: 100,
    }))

    return {
        nodes: [
            { id: outPortId, type: 'outputPort', name: 'Out', x: CENTER_X, y: 60 },
            { id: eventId, type: 'event', name: `f(${component.name})`, x: startX, y: 300, probability: component.intrinsicFailureRate ?? 0, isIntrinsic: true },
        ],
        gates: [
            { id: gateId, type: 'OR', x: CENTER_X - OR_GATE_W / 2, y: 150, width: OR_GATE_W, height: 50, inputCount: totalItems },
        ],
        subComponents,
        edges: [
            { id: uuidv4(), sourceId: eventId, targetId: gateId, sourcePort: 0, targetPort: 0, waypoints: [] },
            ...subComponents.map((sc, i) => ({
                id: uuidv4(), sourceId: sc.id, targetId: gateId, sourcePort: 0, targetPort: i + 1, waypoints: [],
            })),
            { id: uuidv4(), sourceId: gateId, targetId: outPortId, sourcePort: 0, targetPort: 0, waypoints: [] },
        ],
    }
}

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

        // Cursor tooltip state
        tooltip: {
            visible: false,
            x: 0,
            y: 0,
            name: '',
            probability: null,
            side: '',
        },
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


        /**
         * Evaluates the probability of an element in a specific CFT.
         * Usage: store.evaluateProbability(cftId, elementId, portIndex, contextStack)
         * contextStack: Array of { scId, cftId } representing the hierarchy path
         */
        evaluateProbability: (state) => (cftId, elementId, portIndex = 0, contextStack = [], overrides = {}) => {
            const cache = {}

            const evaluate = (currentCftId, id, portIdx, cycleCheck, stack) => {
                const cacheKey = `${currentCftId}:${id}:${portIdx}:${stack.map(s => s.scId).join(',')}`
                if (cache[cacheKey] !== undefined) return cache[cacheKey]
                if (cycleCheck.has(cacheKey)) return 0
                cycleCheck.add(cacheKey)

                // Forced value: lets callers compute P0/P1 for maxf calculation
                if (overrides[id] !== undefined) {
                    const v = overrides[id]
                    cycleCheck.delete(cacheKey)
                    cache[cacheKey] = v
                    return v
                }
                
                let p = 0
                const cft = state.cfts[currentCftId]
                if (cft) {
                    const node = cft.nodes.find(n => n.id === id)
                    if (node) {
                        if (node.type === 'event') {
                            p = node.probability || 0
                        } else if (node.type === 'inputPort') {
                            // If we have a parent context, look up the incoming edge in that parent
                            if (stack.length > 0) {
                                const parent = stack[stack.length - 1]
                                const parentCft = state.cfts[parent.cftId]
                                if (parentCft) {
                                    // Map this input port to its index
                                    const inPorts = cft.nodes.filter(n => n.type === 'inputPort')
                                    const portIdxInSc = inPorts.findIndex(n => n.id === id)
                                    if (portIdxInSc !== -1) {
                                        const edge = parentCft.edges.find(e => e.targetId === parent.scId && e.targetPort === portIdxInSc)
                                        if (edge) {
                                            // Evaluate the source in the parent context
                                            p = evaluate(parent.cftId, edge.sourceId, edge.sourcePort, cycleCheck, stack.slice(0, -1))
                                        } else {
                                            p = node.probability || 0
                                        }
                                    } else {
                                        p = node.probability || 0
                                    }
                                } else {
                                    p = node.probability || 0
                                }
                            } else {
                                p = node.probability || 0
                            }
                        } else if (node.type === 'outputPort') {
                            const edge = cft.edges.find(e => e.targetId === id && e.targetPort === portIdx)
                            if (edge) {
                                p = evaluate(currentCftId, edge.sourceId, edge.sourcePort, cycleCheck, stack)
                            }
                        }
                    } else {
                        const gate = cft.gates.find(g => g.id === id)
                        if (gate) {
                            const inputs = []
                            const inputCount = gate.inputCount ?? (gate.type === 'NOT' ? 1 : 2)
                            for (let i = 0; i < inputCount; i++) {
                                const edge = cft.edges.find(e => e.targetId === id && e.targetPort === i)
                                if (edge) {
                                    inputs.push(evaluate(currentCftId, edge.sourceId, edge.sourcePort, cycleCheck, stack))
                                } else {
                                    inputs.push(0)
                                }
                            }
                            if (gate.type === 'AND') {
                                p = inputs.length > 0 ? inputs.reduce((acc, val) => acc * val, 1) : 0
                            } else if (gate.type === 'OR') {
                                p = inputs.length > 0 ? 1 - inputs.reduce((acc, val) => acc * (1 - val), 1) : 0
                            } else if (gate.type === 'NOT') {
                                p = 1 - (inputs[0] || 0)
                            } else if (gate.type === 'XOR') {
                                const p1 = inputs[0] || 0
                                const p2 = inputs[1] || 0
                                p = p1 * (1 - p2) + p2 * (1 - p1)
                            }
                        } else {
                            const sc = cft.subComponents.find(s => s.id === id)
                            if (sc) {
                                const refCft = state.cfts[sc.refComponentId]
                                if (refCft) {
                                    const outPorts = refCft.nodes.filter(n => n.type === 'outputPort')
                                    if (outPorts[portIdx]) {
                                        // Descend into the subcomponent, pushing the current component to the context stack
                                        p = evaluate(sc.refComponentId, outPorts[portIdx].id, 0, cycleCheck, [...stack, { scId: sc.id, cftId: currentCftId }])
                                    }
                                }
                            }
                        }
                    }
                }
                
                cycleCheck.delete(cacheKey)
                cache[cacheKey] = p
                return p
            }
            
            return evaluate(cftId, elementId, portIndex, new Set(), contextStack)
        },
    },

    actions: {
        // ── User Edit Detection ─────────────────────────────────

        ensureUserEditable() {
            const cft = this.cfts[this.activeComponentId]
            if (cft?.autoGenerated) cft.autoGenerated = false
        },

        _adoptAutoElements() {
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            cft.nodes.forEach(n => {
                delete n.auto
                if (n.type === 'outputPort' && n.name === 'Out (auto)') n.name = 'Out'
            })
            cft.gates.forEach(g => delete g.auto)
            cft.subComponents.forEach(sc => delete sc.auto)
            cft.edges.forEach(e => delete e.auto)
        },

        // ── Lifecycle ────────────────────────────────────────────

        /**
         * Syncs the component's failureRate from its CFT output.
         * Returns { valid: bool, errors: string[] }.
         * Skips (returns valid) if there is no CFT or no output ports.
         */
        validateAgainstComponent(componentId) {
            if (componentId === SYSTEM_CFT_KEY) return { valid: true, errors: [] }
            const diagramStore = useDiagramStore()
            const component = diagramStore.components.find(c => c.id === componentId)
            if (!component) return { valid: true, errors: [] }

            const cft = this.cfts[componentId]
            if (!cft) return { valid: true, errors: [] }

            const outputPorts = cft.nodes.filter(n => n.type === 'outputPort')
            if (outputPorts.length === 0) return { valid: true, errors: [] }

            // Sync failureRate from CFT output
            let computedFailureRate = 0
            for (const port of outputPorts) {
                const p = this.evaluateProbability(componentId, port.id, 0, [])
                computedFailureRate = Math.max(computedFailureRate, p)
            }
            diagramStore.updateComponent(componentId, { failureRate: computedFailureRate })

            const errors = []
            const maxf = diagramStore.componentCofactorMaxf(componentId)
            if (maxf !== null && computedFailureRate > maxf) {
                errors.push(
                    `Failure probability (${computedFailureRate.toExponential(3)}) exceeds allocated maxf (${maxf.toExponential(3)}).`
                )
            }
            return { valid: errors.length === 0, errors }
        },

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

            if (isNew && componentId !== SYSTEM_CFT_KEY) {
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

        showTooltip(x, y, name, side, probability = null) {
            this.tooltip = {
                visible: true,
                x,
                y,
                name,
                side,
                probability
            }
        },

        hideTooltip() {
            this.tooltip.visible = false
        },

        moveTooltip(x, y) {
            this.tooltip.x = x
            this.tooltip.y = y
        },

        // ── Add Nodes ────────────────────────────────────────────

        addEvent(x = 300, y = 300) {
            this.ensureUserEditable()
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
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return null
            const node = {
                id: uuidv4(),
                type: 'inputPort',
                name: 'In',
                x,
                y,
                probability: 0.0,
            }
            cft.nodes.push(node)
            this.selectNode(node.id, 'inputPort')
            return node
        },

        addOutputPort(x = 200, y = 50) {
            this.ensureUserEditable()
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
            this.ensureUserEditable()
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
            this.ensureUserEditable()
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
            this.ensureUserEditable()
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
            // If connecting to/from an auto element, adopt the whole auto subtree
            const srcAuto = [...cft.nodes, ...cft.gates, ...cft.subComponents].find(el => el.id === sourceId)?.auto
            const tgtAuto = [...cft.nodes, ...cft.gates, ...cft.subComponents].find(el => el.id === targetId)?.auto
            if (srcAuto || tgtAuto) this._adoptAutoElements()
            this.selectNode(edge.id, 'edge')
            this.connectMode = false
            this.connectSourceId = null
            this.connectSourcePort = 0
            this.validateAgainstComponent(this.activeComponentId)
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
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const idx = cft.nodes.findIndex(n => n.id === id)
            if (idx !== -1) {
                const wasAuto = cft.nodes[idx].auto
                cft.nodes[idx] = { ...cft.nodes[idx], ...updates }
                if (wasAuto) this._adoptAutoElements()
                // Sync component failureRate when an event probability changes
                if ('probability' in updates) this.validateAgainstComponent(this.activeComponentId)
            }
        },

        updateGate(id, updates) {
            this.ensureUserEditable()
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
                const wasAuto = cft.gates[idx].auto
                cft.gates[idx] = { ...cft.gates[idx], ...updates }
                if (wasAuto) this._adoptAutoElements()
                this.validateAgainstComponent(this.activeComponentId)
            }
        },

        updateSubComponent(id, updates) {
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const idx = cft.subComponents.findIndex(sc => sc.id === id)
            if (idx !== -1) {
                const wasAuto = cft.subComponents[idx].auto
                cft.subComponents[idx] = { ...cft.subComponents[idx], ...updates }
                if (wasAuto) this._adoptAutoElements()
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
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const wasAuto = cft.nodes.find(n => n.id === id)?.auto
            cft.nodes = cft.nodes.filter(n => n.id !== id)
            cft.edges = cft.edges.filter(e => e.sourceId !== id && e.targetId !== id)
            if (wasAuto) this._adoptAutoElements()
            if (this.selectedNodeId === id) this.deselect()
            this.validateAgainstComponent(this.activeComponentId)
        },

        removeGate(id) {
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const wasAuto = cft.gates.find(g => g.id === id)?.auto
            cft.gates = cft.gates.filter(g => g.id !== id)
            cft.edges = cft.edges.filter(e => e.sourceId !== id && e.targetId !== id)
            if (wasAuto) this._adoptAutoElements()
            if (this.selectedNodeId === id) this.deselect()
            this.validateAgainstComponent(this.activeComponentId)
        },

        removeSubComponent(id) {
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const wasAuto = cft.subComponents.find(sc => sc.id === id)?.auto
            cft.subComponents = cft.subComponents.filter(sc => sc.id !== id)
            cft.edges = cft.edges.filter(e => e.sourceId !== id && e.targetId !== id)
            if (wasAuto) this._adoptAutoElements()
            if (this.selectedNodeId === id) this.deselect()
            this.validateAgainstComponent(this.activeComponentId)
        },

        removeEdge(id) {
            this.ensureUserEditable()
            const cft = this.cfts[this.activeComponentId]
            if (!cft) return
            const wasAuto = cft.edges.find(e => e.id === id)?.auto
            cft.edges = cft.edges.filter(e => e.id !== id)
            if (wasAuto) this._adoptAutoElements()
            if (this.selectedNodeId === id) this.deselect()
            this.validateAgainstComponent(this.activeComponentId)
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
                        inputs: inputPorts,
                        outputs: outputPorts,
                    }
                }
                default:
                    return { inputs: 1, outputs: 1 }
            }
        },

        // ── Strict Failure Model Generation ─────────────────────

        /**
         * Builds or updates the CFT for a component.
         *
         * Auto-generated CFT (autoGenerated=true): overwrites entirely with the full
         * strict failure model (intrinsic event + all deps).
         *
         * User-edited CFT (autoGenerated=false): incremental update.
         * Strips the existing auto subtree, then adds only deps not yet referenced
         * anywhere in the CFT under a minimal new "Out (auto)" subtree.
         * Deps already represented in user content are left untouched.
         */
        regenerateComponentCft(componentId) {
            const diagramStore = useDiagramStore()
            const component = diagramStore.components.find(c => c.id === componentId)
            if (!component) return

            const existingCft = this.cfts[componentId]
            const isUserEdited = existingCft && !existingCft.autoGenerated

            if (!isUserEdited) {
                this.cfts[componentId] = { ..._buildFullStrictModel(component, diagramStore), autoGenerated: true }
                return
            }

            // ── Incremental path ────────────────────────────────────
            const children = diagramStore.components.filter(c => c.parentId === componentId)
            const providers = diagramStore.interfaces
                .filter(i => i.requiredComponentId === componentId)
                .map(i => diagramStore.components.find(c => c.id === i.providedComponentId))
                .filter(Boolean)
            const allDeps = [...children, ...providers]

            // Only non-auto subComponents count as "already covered" — auto ones will be
            // stripped and rebuilt, so their deps must be re-included in the new auto subtree
            const existingRefs = new Set(existingCft.subComponents.filter(sc => !sc.auto).map(sc => sc.refComponentId))
            const newDeps = allDeps.filter(d => !existingRefs.has(d.id))

            // Strip old auto subtree
            existingCft.nodes = existingCft.nodes.filter(n => !n.auto)
            existingCft.gates = existingCft.gates.filter(g => !g.auto)
            existingCft.subComponents = existingCft.subComponents.filter(sc => !sc.auto)
            existingCft.edges = existingCft.edges.filter(e => !e.auto)

            // Keep intrinsic failure event's probability in sync with intrinsicFailureRate
            const intrinsicEvent = existingCft.nodes.find(n => n.type === 'event' && n.isIntrinsic)
            if (intrinsicEvent) {
                intrinsicEvent.probability = component.intrinsicFailureRate ?? 0
            }

            if (newDeps.length === 0) return

            // Build minimal auto subtree for only the new deps
            const tag = { auto: true }
            const allXCoords = [
                ...existingCft.nodes.map(n => n.x),
                ...existingCft.gates.map(g => g.x + (g.width ?? 60)),
                ...existingCft.subComponents.map(sc => sc.x + (sc.width ?? 140)),
            ]
            const AUTO_X = allXCoords.length > 0 ? Math.max(...allXCoords) + 250 : 700
            const H_SPACING = 180
            const outPortId = uuidv4()

            if (newDeps.length === 1) {
                const scId = uuidv4()
                existingCft.nodes.push({ id: outPortId, type: 'outputPort', name: 'Out (auto)', x: AUTO_X, y: 60, ...tag })
                existingCft.subComponents.push({ id: scId, refComponentId: newDeps[0].id, name: newDeps[0].name, x: AUTO_X - 70, y: 200, width: 140, height: 100, ...tag })
                existingCft.edges.push({ id: uuidv4(), sourceId: scId, targetId: outPortId, sourcePort: 0, targetPort: 0, waypoints: [], ...tag })
            } else {
                const totalWidth = (newDeps.length - 1) * H_SPACING
                const startX = AUTO_X - totalWidth / 2
                const gateId = uuidv4()
                existingCft.nodes.push({ id: outPortId, type: 'outputPort', name: 'Out (auto)', x: AUTO_X, y: 60, ...tag })
                existingCft.gates.push({ id: gateId, type: 'OR', x: AUTO_X - 30, y: 150, width: 60, height: 50, inputCount: newDeps.length, ...tag })
                newDeps.forEach((dep, i) => {
                    const scId = uuidv4()
                    existingCft.subComponents.push({ id: scId, refComponentId: dep.id, name: dep.name, x: startX + i * H_SPACING - 70, y: 270, width: 140, height: 100, ...tag })
                    existingCft.edges.push({ id: uuidv4(), sourceId: scId, targetId: gateId, sourcePort: 0, targetPort: i, waypoints: [], ...tag })
                })
                existingCft.edges.push({ id: uuidv4(), sourceId: gateId, targetId: outPortId, sourcePort: 0, targetPort: 0, waypoints: [], ...tag })
            }
        },

        /**
         * Builds the system-level strict failure model CFT.
         * Structure: output port ← OR gate ← [sc_root1, sc_root2, ...]
         * If no root components exist, removes the system CFT.
         */
        regenerateSystemCft() {
            const diagramStore = useDiagramStore()
            // Providers appear in their requirer's CFT — exclude them from the system CFT
            const providerIds = new Set(diagramStore.interfaces.map(i => i.providedComponentId))
            const roots = diagramStore.components.filter(c => !c.parentId && !providerIds.has(c.id))

            if (roots.length === 0) {
                delete this.cfts[SYSTEM_CFT_KEY]
                return
            }

            const CENTER_X = 300
            const OR_GATE_W = 60
            const H_SPACING = 180
            const totalWidth = (roots.length - 1) * H_SPACING
            const startX = CENTER_X - totalWidth / 2

            const outPortId = uuidv4()
            const gateId = uuidv4()

            const nodes = [
                { id: outPortId, type: 'outputPort', name: 'System Failure', x: CENTER_X, y: 60 },
            ]
            const gates = [
                { id: gateId, type: 'OR', x: CENTER_X - OR_GATE_W / 2, y: 150, width: OR_GATE_W, height: 50, inputCount: roots.length },
            ]
            const subComponents = roots.map((root, i) => ({
                id: uuidv4(),
                refComponentId: root.id,
                name: root.name,
                x: startX + i * H_SPACING - 70,
                y: 270,
                width: 140,
                height: 100,
            }))
            const edges = [
                ...subComponents.map((sc, i) => ({
                    id: uuidv4(), sourceId: sc.id, targetId: gateId, sourcePort: 0, targetPort: i, waypoints: [],
                })),
                { id: uuidv4(), sourceId: gateId, targetId: outPortId, sourcePort: 0, targetPort: 0, waypoints: [] },
            ]

            this.cfts[SYSTEM_CFT_KEY] = { nodes, gates, subComponents, edges, autoGenerated: true }
        },

        /** Regenerates all auto-generated CFTs for every component plus the system CFT. */
        regenerateAllStrictCfts() {
            const diagramStore = useDiagramStore()
            diagramStore.components.forEach(comp => this.regenerateComponentCft(comp.id))
            this.regenerateSystemCft()
        },

        /**
         * Get detailed ports for a sub-component from its referenced CFT.
         * Returns { inputs: [{id, name, index}], outputs: [{id, name, index}] }.
         */
        getSubComponentPorts(id) {
            const el = this.findElement(id)
            if (!el || el.kind !== 'subComponent') return { inputs: [], outputs: [] }
            
            const refCft = this.cfts[el.item.refComponentId]
            if (!refCft) return { inputs: [], outputs: [] }
            
            const inputs = refCft.nodes.filter(n => n.type === 'inputPort').map((n, i) => ({ ...n, index: i }))
            const outputs = refCft.nodes.filter(n => n.type === 'outputPort').map((n, i) => ({ ...n, index: i }))
            
            return { inputs, outputs }
        },
    },
})
