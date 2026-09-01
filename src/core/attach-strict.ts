import { BF } from './bool-formula.js'
import { createEdge, type CFT, type Gate } from './types.js'

let _defaultIdCounter = 0
const _defaultCreateId = (): string => `__gen_${++_defaultIdCounter}__`

export function attachStrict(
    cft: CFT,
    outputPortId: string,
    childRefId: string,
    createId: () => string = _defaultCreateId,
): { cft: CFT; newInputId: string } {
    const c = _cloneCFT(cft)

    const existingEdgeIdx = c.edges.findIndex(e => e.target === outputPortId)
    const srcId = existingEdgeIdx >= 0 ? c.edges[existingEdgeIdx].source : null

    const srcGate = srcId ? c.gates.find(g => g.id === srcId) : null
    const srcIsOrGate = srcGate !== null && srcGate !== undefined && _isOrFormula(srcGate)

    const newInputId = createId()

    if (srcIsOrGate && srcGate) {
        srcGate.inputs.push(newInputId)
        srcGate.formula = BF.or(...srcGate.inputs.map(id => BF.var(id)))
    } else {
        const orGateId = createId()
        const in1Id = createId()

        const newOrGate: Gate = {
            id: orGateId,
            inputs: [in1Id, newInputId],
            output: orGateId + '.out',
            formula: BF.or(BF.var(in1Id), BF.var(newInputId)),
        }
        c.gates.push(newOrGate)

        if (existingEdgeIdx >= 0) {
            c.edges.splice(existingEdgeIdx, 1)
            if (srcId !== null) {
                c.edges.push(createEdge({ source: srcId, target: in1Id }))
            }
        }

        c.edges.push(createEdge({ source: orGateId, target: outputPortId }))
    }

    c.edges.push(createEdge({ source: childRefId, target: newInputId }))

    return { cft: c, newInputId }
}

export function attachAtPoint(
    cft: CFT,
    attachmentPointId: string,
    childRefId: string,
): { cft: CFT; newInputId: string } {
    const c = _cloneCFT(cft)
    c.edges.push(createEdge({ source: childRefId, target: attachmentPointId }))
    return { cft: c, newInputId: attachmentPointId }
}

function _isOrFormula(gate: Gate): boolean {
    return gate.formula !== undefined && gate.formula !== null && gate.formula.kind === 'or'
}

function _cloneCFT(cft: CFT): CFT {
    return {
        internalEvents: [...cft.internalEvents],
        inputPorts: [...cft.inputPorts],
        outputPorts: [...cft.outputPorts],
        gates: cft.gates.map(g => ({
            ...g,
            inputs: [...g.inputs],
            formula: g.formula,
        })),
        subcomponentRefs: cft.subcomponentRefs.map(sc => ({
            ...sc,
            inputs: [...(sc.inputs ?? [])],
            outputs: [...(sc.outputs ?? [])],
        })),
        edges: cft.edges.map(e => ({ ...e })),
    }
}
