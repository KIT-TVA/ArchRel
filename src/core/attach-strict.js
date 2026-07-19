/**
 * attachStrict: strict failure model attachment.
 * Implements Def. 20 from the thesis.
 *
 * Modifies a CFT (on a deep clone) so that a new subcomponent reference's
 * failure feeds into the top-most OR gate feeding the output port.
 */

import { BF } from './bool-formula.js'
import { createEdge } from './types.js'

let _defaultIdCounter = 0
const _defaultCreateId = () => `__gen_${++_defaultIdCounter}__`

/**
 * Attach a new input to the top-most OR gate of `cft` feeding `outputPortId`.
 *
 * Steps (Def. 20 + SPEC-DECISION D3):
 *   1. Find the top-most gate g whose output is the source of the edge into outputPortId.
 *   2. If g is an OR gate: add a new input port id to g.inputs, add edge childRefId → new input.
 *   3. If g is not an OR gate: create a new OR gate g'; delete g.out → outputPort edge;
 *      add g.out → g'.in₁ and g'.out → outputPort; proceed as in step 2.
 *   SPEC-DECISION D3: no gate present (output port has no incoming edge, or source is an event):
 *      create OR gate, re-route existing source (if any) as first input, attach new child.
 *
 * @param {object} cft — CFT (will be deep-cloned internally)
 * @param {string} outputPortId
 * @param {string} childRefId — id of the new subcomponent reference node whose output feeds in
 * @param {function} [createId] — id generator; defaults to a deterministic counter (override in tests)
 * @returns {{ cft: object, newInputId: string }}  the modified CFT clone and the new input slot id
 */
export function attachStrict(cft, outputPortId, childRefId, createId = _defaultCreateId) {
    const c = _cloneCFT(cft)

    // Find the edge currently targeting outputPortId
    const existingEdgeIdx = c.edges.findIndex(e => e.target === outputPortId)
    const srcId = existingEdgeIdx >= 0 ? c.edges[existingEdgeIdx].source : null

    // Check whether the source is an OR gate
    const srcGate = srcId ? c.gates.find(g => g.id === srcId) : null
    const srcIsOrGate = srcGate !== null && srcGate !== undefined && _isOrFormula(srcGate.formula)

    const newInputId = createId()

    if (srcIsOrGate) {
        // Case 2 (Def. 20): top-most gate is an OR gate → extend it with a new input
        srcGate.inputs.push(newInputId)
        // Rebuild the OR gate's formula to include the new input variable
        srcGate.formula = BF.or(...srcGate.inputs.map(id => BF.var(id)))
    } else {
        // Case 3 / SPEC-DECISION D3: source is not an OR gate (or no source at all)
        const orGateId = createId()
        const in1Id = createId()

        const newOrGate = {
            id: orGateId,
            inputs: [in1Id, newInputId],
            output: orGateId + '.out',
            formula: BF.or(BF.var(in1Id), BF.var(newInputId)),
        }
        c.gates.push(newOrGate)

        if (existingEdgeIdx >= 0) {
            // Remove the old edge that went directly to outputPortId
            c.edges.splice(existingEdgeIdx, 1)
            if (srcId !== null) {
                // Re-route the existing source through in1Id of the new OR gate
                c.edges.push(createEdge({ source: srcId, target: in1Id }))
            }
            // else: in1Id left unconnected → const false (Def. 20 + SPEC-DECISION D2)
        }

        // Connect the new OR gate's output to the output port
        c.edges.push(createEdge({ source: orGateId, target: outputPortId }))
    }

    // Connect the new child reference to the new input slot
    c.edges.push(createEdge({ source: childRefId, target: newInputId }))

    return { cft: c, newInputId }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _isOrFormula(formula) {
    return formula !== undefined && formula !== null && formula.kind === 'or'
}

function _cloneCFT(cft) {
    return {
        internalEvents: [...cft.internalEvents],
        inputPorts: [...cft.inputPorts],
        outputPorts: [...cft.outputPorts],
        gates: cft.gates.map(g => ({
            ...g,
            inputs: [...g.inputs],
            formula: g.formula, // BoolFormulas are immutable plain objects — no deep clone needed
        })),
        subcomponentRefs: cft.subcomponentRefs.map(sc => ({
            ...sc,
            inputs: [...(sc.inputs ?? [])],
            outputs: [...(sc.outputs ?? [])],
        })),
        edges: cft.edges.map(e => ({ ...e })),
    }
}
