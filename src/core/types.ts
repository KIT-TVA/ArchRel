import type { BoolFormula } from './bool-formula.js'
import { WellFormednessError, CycleError } from './errors.js'

export interface MethodSignature {
    name: string
    params: string[]
    ret: string
}

export interface Interface {
    name: string
    methods: MethodSignature[]
}

export interface Gate {
    id: string
    inputs: string[]
    output: string
    formula: BoolFormula
}

export interface SCRef {
    id: string
    componentId: string
    inputs: string[]
    outputs: string[]
}

export interface Edge {
    source: string
    target: string
}

export interface CFT {
    internalEvents: string[]
    inputPorts: string[]
    outputPorts: string[]
    gates: Gate[]
    subcomponentRefs: SCRef[]
    edges: Edge[]
}

export interface Component {
    id: string
    name: string
    subcomponents: Component[]
    faultTree: CFT | null
    required: Interface[]
    provided: Interface[]
}

export type ComponentIndex = Map<string, { component: Component; cft: CFT }>

export type InterfaceMap = Map<string, { providerId: string; outputPortId: string }>

export function createComponent(opts: {
    id: string
    name: string
    subcomponents?: Component[]
    faultTree?: CFT | null
    required?: Interface[]
    provided?: Interface[]
}): Component {
    return {
        id: opts.id,
        name: opts.name,
        subcomponents: opts.subcomponents ?? [],
        faultTree: opts.faultTree ?? null,
        required: opts.required ?? [],
        provided: opts.provided ?? [],
    }
}

export function createInterface(opts: { name: string; methods?: MethodSignature[] }): Interface {
    return { name: opts.name, methods: opts.methods ?? [] }
}

export function createMethodSignature(opts: { name: string; params?: string[]; ret?: string }): MethodSignature {
    return { name: opts.name, params: opts.params ?? [], ret: opts.ret ?? 'void' }
}

export function createCFT(opts: {
    internalEvents?: string[]
    inputPorts?: string[]
    outputPorts?: string[]
    gates?: Gate[]
    subcomponentRefs?: SCRef[]
    edges?: Edge[]
} = {}): CFT {
    return {
        internalEvents: opts.internalEvents ?? [],
        inputPorts: opts.inputPorts ?? [],
        outputPorts: opts.outputPorts ?? [],
        gates: opts.gates ?? [],
        subcomponentRefs: opts.subcomponentRefs ?? [],
        edges: opts.edges ?? [],
    }
}

export function createGate(opts: { id: string; inputs: string[]; output: string; formula: BoolFormula }): Gate {
    return { id: opts.id, inputs: opts.inputs, output: opts.output, formula: opts.formula }
}

export function createSCRef(opts: { id: string; componentId: string; inputs?: string[]; outputs?: string[] }): SCRef {
    return { id: opts.id, componentId: opts.componentId, inputs: opts.inputs ?? [], outputs: opts.outputs ?? [] }
}

export function createEdge(opts: { source: string; target: string }): Edge {
    return { source: opts.source, target: opts.target }
}

export function signaturesEqual(a: MethodSignature, b: MethodSignature): boolean {
    if (a.name !== b.name) return false
    if (a.ret !== b.ret) return false
    if (a.params.length !== b.params.length) return false
    return a.params.every((p, i) => p === b.params[i])
}

export function interfacesEqual(a: Interface, b: Interface): boolean {
    if (a.name !== b.name) return false
    if (a.methods.length !== b.methods.length) return false
    return a.methods.every(sigA => b.methods.some(sigB => signaturesEqual(sigA, sigB)))
}

export function checkWellFormed(cft: CFT): void {
    const gateIds = new Set(cft.gates.map(g => g.id))
    const seen = new Set<string>()
    for (const edge of cft.edges) {
        if (gateIds.has(edge.target)) continue
        if (seen.has(edge.target)) {
            throw new WellFormednessError(
                `Well-formedness violation (Def. 15): two edges share the same attachment point on target '${edge.target}'`
            )
        }
        seen.add(edge.target)
    }
}

export function isLegal(cft: CFT, componentIndex: ComponentIndex, selfComponentId?: string): true {
    _checkEdgeAcyclicity(cft)
    if (selfComponentId !== undefined) {
        _checkNoSelfContainment(selfComponentId, componentIndex)
    }
    return true
}

function _checkEdgeAcyclicity(cft: CFT): void {
    const allIds = new Set([
        ...cft.internalEvents,
        ...cft.inputPorts,
        ...cft.outputPorts,
        ...cft.gates.map(g => g.id),
        ...cft.subcomponentRefs.map(sc => sc.id),
    ])

    const adj = new Map<string, string[]>()
    for (const id of allIds) adj.set(id, [])
    for (const edge of cft.edges) {
        if (!adj.has(edge.source)) adj.set(edge.source, [])
        adj.get(edge.source)!.push(edge.target)
    }

    const inDegree = new Map<string, number>()
    for (const id of adj.keys()) inDegree.set(id, 0)
    for (const [, targets] of adj) {
        for (const t of targets) {
            inDegree.set(t, (inDegree.get(t) ?? 0) + 1)
        }
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id)
    }

    let processed = 0
    while (queue.length > 0) {
        const node = queue.shift()!
        processed++
        for (const next of (adj.get(node) ?? [])) {
            const deg = (inDegree.get(next) ?? 1) - 1
            inDegree.set(next, deg)
            if (deg === 0) queue.push(next)
        }
    }

    if (processed < adj.size) {
        throw new CycleError('Legality violation (Def. 16): the CFT edge graph contains a cycle')
    }
}

function _checkNoSelfContainment(rootComponentId: string, componentIndex: ComponentIndex): void {
    const visited = new Set<string>()
    const stack = [rootComponentId]
    while (stack.length > 0) {
        const current = stack.pop()!
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
