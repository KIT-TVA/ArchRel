/**
 * Data model factories and validators for RbC² core semantics.
 * Implements Def. 11-16 from the thesis.
 *
 * All types are plain JS objects — no x/y/width/height (semantic model only).
 */

import { WellFormednessError, CycleError } from './errors.js'

// ── Factories ────────────────────────────────────────────────────────────────

/**
 * Def. 11: Component
 * @param {{ id: string, name: string, subcomponents?: object[], faultTree?: object, required?: object[], provided?: object[] }} opts
 */
export function createComponent({ id, name, subcomponents = [], faultTree = null, required = [], provided = [] }) {
    return { id, name, subcomponents, faultTree, required, provided }
}

/**
 * Def. 12: Interface
 * @param {{ name: string, methods?: object[] }} opts
 */
export function createInterface({ name, methods = [] }) {
    return { name, methods }
}

/**
 * Def. 12: MethodSignature
 * @param {{ name: string, params?: string[], ret?: string }} opts
 */
export function createMethodSignature({ name, params = [], ret = 'void' }) {
    return { name, params, ret }
}

/**
 * Def. 15: CFT (Component Fault Tree)
 * @param {{ internalEvents?: string[], inputPorts?: string[], outputPorts?: string[], gates?: object[], subcomponentRefs?: object[], edges?: object[] }} opts
 */
export function createCFT({ internalEvents = [], inputPorts = [], outputPorts = [], gates = [], subcomponentRefs = [], edges = [] } = {}) {
    return { internalEvents, inputPorts, outputPorts, gates, subcomponentRefs, edges }
}

/**
 * Def. 15: Gate
 * gate.inputs: array of input port IDs (the g.in_i)
 * gate.output: single output port ID (g.out)
 * gate.formula: BoolFormula over g.in_i only
 *
 * @param {{ id: string, inputs: string[], output: string, formula: object }} opts
 */
export function createGate({ id, inputs, output, formula }) {
    return { id, inputs, output, formula }
}

/**
 * Def. 15: SCRef (subcomponent reference)
 * @param {{ id: string, componentId: string, inputs?: string[], outputs?: string[] }} opts
 */
export function createSCRef({ id, componentId, inputs = [], outputs = [] }) {
    return { id, componentId, inputs, outputs }
}

/**
 * Def. 15: Edge
 * source / target are PortId or EventId strings.
 * @param {{ source: string, target: string }} opts
 */
export function createEdge({ source, target }) {
    return { source, target }
}

// ── Equality (Def. 12) ───────────────────────────────────────────────────────

/**
 * Signature equality: equal iff name, params (ordered, by type) and ret are identical.
 * @param {{ name: string, params: string[], ret: string }} a
 * @param {{ name: string, params: string[], ret: string }} b
 */
export function signaturesEqual(a, b) {
    if (a.name !== b.name) return false
    if (a.ret !== b.ret) return false
    if (a.params.length !== b.params.length) return false
    return a.params.every((p, i) => p === b.params[i])
}

/**
 * Interface equality: same name and same set of signatures.
 * @param {{ name: string, methods: object[] }} a
 * @param {{ name: string, methods: object[] }} b
 */
export function interfacesEqual(a, b) {
    if (a.name !== b.name) return false
    if (a.methods.length !== b.methods.length) return false
    return a.methods.every(sigA =>
        b.methods.some(sigB => signaturesEqual(sigA, sigB))
    )
}

// ── Well-formedness (Def. 15 last clause) ────────────────────────────────────

/**
 * Checks that no two edges in the CFT share a target.
 * Throws WellFormednessError on violation (hard error, not a rule rejection).
 * @param {object} cft
 */
export function checkWellFormed(cft) {
    const seen = new Set()
    for (const edge of cft.edges) {
        if (seen.has(edge.target)) {
            throw new WellFormednessError(
                `Well-formedness violation (Def. 15): two edges share target '${edge.target}'`
            )
        }
        seen.add(edge.target)
    }
}

// ── Legality (Def. 16) ───────────────────────────────────────────────────────

/**
 * Checks legality of a CFT within a component index.
 * Returns true iff:
 *   (a) the edge graph is acyclic, and
 *   (b) no subcomponent is contained in itself (no cycle in the component-ref graph).
 *
 * Throws CycleError on violation.
 *
 * @param {object} cft  — The CFT to check
 * @param {Map<string, { component: object, cft: object }>} componentIndex
 * @param {string} [selfComponentId]  — The id of the component owning this CFT (for self-containment check)
 */
export function isLegal(cft, componentIndex, selfComponentId) {
    _checkEdgeAcyclicity(cft)
    if (selfComponentId !== undefined) {
        _checkNoSelfContainment(selfComponentId, componentIndex)
    }
    return true
}

function _checkEdgeAcyclicity(cft) {
    // Collect all node ids (events, ports, gate ids from gates)
    const allIds = new Set([
        ...cft.internalEvents,
        ...cft.inputPorts,
        ...cft.outputPorts,
        ...cft.gates.map(g => g.id),
        ...cft.subcomponentRefs.map(sc => sc.id),
    ])

    // Build adjacency list: source → [targets]
    const adj = new Map()
    for (const id of allIds) adj.set(id, [])
    for (const edge of cft.edges) {
        if (!adj.has(edge.source)) adj.set(edge.source, [])
        adj.get(edge.source).push(edge.target)
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map()
    for (const id of adj.keys()) inDegree.set(id, 0)
    for (const [, targets] of adj) {
        for (const t of targets) {
            inDegree.set(t, (inDegree.get(t) ?? 0) + 1)
        }
    }

    const queue = []
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id)
    }

    let processed = 0
    while (queue.length > 0) {
        const node = queue.shift()
        processed++
        for (const next of (adj.get(node) ?? [])) {
            const deg = (inDegree.get(next) ?? 1) - 1
            inDegree.set(next, deg)
            if (deg === 0) queue.push(next)
        }
    }

    if (processed < adj.size) {
        throw new CycleError(
            'Legality violation (Def. 16): the CFT edge graph contains a cycle'
        )
    }
}

function _checkNoSelfContainment(rootComponentId, componentIndex) {
    // Walk the component-reference graph transitively from rootComponentId.
    // If we ever revisit rootComponentId, it is self-contained.
    const visited = new Set()
    const stack = [rootComponentId]
    while (stack.length > 0) {
        const current = stack.pop()
        if (visited.has(current)) continue
        visited.add(current)
        const entry = componentIndex.get(current)
        if (!entry) continue
        for (const scRef of (entry.cft?.subcomponentRefs ?? [])) {
            if (scRef.componentId === rootComponentId) {
                throw new CycleError(
                    `Legality violation (Def. 16): component '${rootComponentId}' contains itself transitively`
                )
            }
            if (!visited.has(scRef.componentId)) {
                stack.push(scRef.componentId)
            }
        }
    }
}
