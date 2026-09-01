import { BF, type BoolFormula } from './bool-formula.js'
import type { CFT, ComponentIndex, InterfaceMap } from './types.js'
import { DepthLimitError } from './errors.js'

const DEFAULT_DEPTH_LIMIT = 100

export interface FoldOptions {
    depthLimit?: number
    memo?: Map<string, Map<string, BoolFormula>>
    interfaceMap?: InterfaceMap
    interceptPortId?: string | null
    resolvedOutputs?: Map<string, BoolFormula>
}

export function foldf(cft: CFT, componentIndex: ComponentIndex, opts: FoldOptions = {}): Map<string, BoolFormula> {
    const depthLimit = opts.depthLimit ?? DEFAULT_DEPTH_LIMIT
    const memo = opts.memo ?? new Map()
    const interfaceMap = opts.interfaceMap ?? new Map()
    const interceptPortId = opts.interceptPortId ?? null
    const resolvedOutputs = opts.resolvedOutputs

    const srcOf = _buildSrcMap(cft)

    const result = new Map<string, BoolFormula>()
    for (const outPortId of cft.outputPorts) {
        const formula = _fNode(outPortId, cft, srcOf, componentIndex, depthLimit, memo, interfaceMap, interceptPortId, new Set(), resolvedOutputs)
        result.set(outPortId, BF.simplify(formula))
    }
    return result
}

function _fNode(
    id: string,
    cft: CFT,
    srcOf: Map<string, string>,
    componentIndex: ComponentIndex,
    depth: number,
    memo: Map<string, Map<string, BoolFormula>>,
    interfaceMap: InterfaceMap,
    interceptPortId: string | null,
    cycleGuard: Set<string>,
    resolvedOutputs: Map<string, BoolFormula> | undefined,
): BoolFormula {
    if (depth <= 0) throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)

    if (cft.outputPorts.includes(id)) {
        if (interceptPortId !== null && id === interceptPortId) {
            return BF.var('__x__')
        }
        const src = srcOf.get(id)
        if (src === undefined) {
            return BF.const(false)
        }
        return _fNode(src, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard, resolvedOutputs)
    }

    if (interceptPortId !== null && id === interceptPortId) {
        return BF.var('__x__')
    }

    if (cft.internalEvents.includes(id)) {
        return BF.var(id)
    }

    if (cft.inputPorts.includes(id)) {
        const ifaceConn = interfaceMap.get(id)
        if (ifaceConn) {
            const { providerId, outputPortId } = ifaceConn
            return _foldProvider(providerId, outputPortId, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, cycleGuard, resolvedOutputs)
        }
        return BF.var(id)
    }

    const gate = cft.gates.find(g => g.id === id)
    if (gate) {
        return _fGate(gate, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard, resolvedOutputs)
    }

    const scRef = cft.subcomponentRefs.find(sc => sc.id === id)
    if (scRef) {
        return _fScRef(scRef, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard, resolvedOutputs)
    }

    return BF.const(false)
}

function _fGate(
    gate: import('./types.js').Gate,
    cft: CFT,
    srcOf: Map<string, string>,
    componentIndex: ComponentIndex,
    depth: number,
    memo: Map<string, Map<string, BoolFormula>>,
    interfaceMap: InterfaceMap,
    interceptPortId: string | null,
    cycleGuard: Set<string>,
    resolvedOutputs: Map<string, BoolFormula> | undefined,
): BoolFormula {
    let formula = gate.formula
    for (const inputId of gate.inputs) {
        let inputFormula: BoolFormula
        if (interceptPortId !== null && inputId === interceptPortId) {
            inputFormula = BF.var('__x__')
        } else {
            const src = srcOf.get(inputId)
            inputFormula = src !== undefined
                ? _fNode(src, cft, srcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, cycleGuard, resolvedOutputs)
                : BF.const(false)
        }
        formula = BF.substitute(formula, inputId, inputFormula)
    }
    return BF.simplify(formula)
}

function _fScRef(
    scRef: import('./types.js').SCRef,
    cft: CFT,
    srcOf: Map<string, string>,
    componentIndex: ComponentIndex,
    depth: number,
    memo: Map<string, Map<string, BoolFormula>>,
    interfaceMap: InterfaceMap,
    interceptPortId: string | null,
    cycleGuard: Set<string>,
    resolvedOutputs: Map<string, BoolFormula> | undefined,
): BoolFormula {
    if (depth <= 0) throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)

    const refEntry = componentIndex.get(scRef.componentId)
    if (!refEntry) return BF.const(false)

    const refCft = refEntry.cft
    const cycleKey = `${scRef.id}:${scRef.componentId}`
    if (cycleGuard.has(cycleKey)) {
        throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)
    }

    if (!memo.has(scRef.componentId)) {
        memo.set(scRef.componentId, new Map())
    }
    const componentMemo = memo.get(scRef.componentId)!

    if (resolvedOutputs !== undefined && refCft.inputPorts.length > 0) {
        componentMemo.clear()
    }

    if (componentMemo.size === 0 || !_memoCoversAllPorts(refCft, componentMemo)) {
        const refSrcOf = _buildSrcMap(refCft)
        const newGuard = new Set([...cycleGuard, cycleKey])
        for (const outPortId of refCft.outputPorts) {
            if (!componentMemo.has(outPortId)) {
                const formula = _fNode(outPortId, refCft, refSrcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, newGuard, resolvedOutputs)
                componentMemo.set(outPortId, BF.simplify(formula))
            }
        }
    }

    const inputSubs: Array<[string, BoolFormula]> = []
    for (let m = 0; m < refCft.inputPorts.length; m++) {
        const refInPortId = refCft.inputPorts[m]
        const parentEdgeSrc = scRef.inputs[m] !== undefined ? srcOf.get(scRef.inputs[m]) : undefined
        const inputFormula = parentEdgeSrc !== undefined
            ? _fNode(parentEdgeSrc, cft, srcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, cycleGuard, resolvedOutputs)
            : BF.const(false)
        inputSubs.push([refInPortId, inputFormula])
    }

    const outputFormulas = new Map<string, BoolFormula>()
    for (let j = 0; j < scRef.outputs.length; j++) {
        const refOutPortId = scRef.outputs[j]
        let formula = componentMemo.get(refOutPortId) ?? BF.const(false)
        for (const [refInPortId, inputFormula] of inputSubs) {
            formula = BF.substitute(formula, refInPortId, inputFormula)
        }
        outputFormulas.set(refOutPortId, BF.simplify(formula))
    }

    if (resolvedOutputs !== undefined) {
        for (const [key, existing] of resolvedOutputs) {
            let updated = existing
            for (const [portId, sub] of inputSubs) {
                updated = BF.substitute(updated, portId, sub)
            }
            resolvedOutputs.set(key, BF.simplify(updated))
        }
        for (const [refInPortId, inputFormula] of inputSubs) {
            resolvedOutputs.set(refInPortId, inputFormula)
        }
        for (const [refOutPortId, formula] of outputFormulas) {
            resolvedOutputs.set(refOutPortId, formula)
        }
        if (scRef.outputs.length > 0) {
            const primaryFormula = outputFormulas.get(scRef.outputs[0])
            if (primaryFormula !== undefined) {
                resolvedOutputs.set(scRef.componentId, primaryFormula)
            }
        }
    }

    if (scRef.outputs.length > 0) {
        return outputFormulas.get(scRef.outputs[0]) ?? BF.const(false)
    }
    return BF.const(false)
}

function _foldProvider(
    providerId: string,
    outputPortId: string,
    componentIndex: ComponentIndex,
    depth: number,
    memo: Map<string, Map<string, BoolFormula>>,
    interfaceMap: InterfaceMap,
    interceptPortId: string | null,
    cycleGuard: Set<string>,
    resolvedOutputs: Map<string, BoolFormula> | undefined,
): BoolFormula {
    if (depth <= 0) throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)
    const entry = componentIndex.get(providerId)
    if (!entry) return BF.const(false)

    const refCft = entry.cft
    const componentMemo = memo.get(providerId) ?? new Map<string, BoolFormula>()
    if (!memo.has(providerId)) memo.set(providerId, componentMemo)

    if (!componentMemo.has(outputPortId)) {
        const refSrcOf = _buildSrcMap(refCft)
        const newGuard = new Set([...cycleGuard, providerId])
        const formula = _fNode(outputPortId, refCft, refSrcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, newGuard, resolvedOutputs)
        componentMemo.set(outputPortId, BF.simplify(formula))
    }
    let formula = componentMemo.get(outputPortId)!
    for (const inPortId of refCft.inputPorts) {
        formula = BF.substitute(formula, inPortId, BF.const(false))
    }
    return formula
}

function _buildSrcMap(cft: CFT): Map<string, string> {
    const map = new Map<string, string>()
    for (const edge of cft.edges) {
        map.set(edge.target, edge.source)
    }
    return map
}

function _memoCoversAllPorts(refCft: CFT, componentMemo: Map<string, BoolFormula>): boolean {
    return refCft.outputPorts.every(p => componentMemo.has(p))
}
