/**
 * foldf: CFT → Map<outputPortId, BoolFormula>
 * Implements Def. 18 from the thesis.
 *
 * Folds a CFT into a symbolic Boolean formula per output port.
 * The formula represents when the output port is activated (component fails).
 *
 * Interface connections (cross-component edges) are resolved via the `interfaceMap`
 * which maps inputPortId → { providerId, outputPortId } when that input port is
 * connected to a provider via an interface (Def. 23, SPEC-DECISION D6).
 */

import { BF } from './bool-formula.js'
import { DepthLimitError } from './errors.js'

const DEFAULT_DEPTH_LIMIT = 100

/**
 * @param {object} cft — CFT object (createCFT shape)
 * @param {Map<string, { component: object, cft: object }>} componentIndex
 * @param {object} [opts]
 * @param {number} [opts.depthLimit]
 * @param {Map<string, Map<string, object>>} [opts.memo]   — shared cross-call memo; keyed by componentId → Map<portId, BoolFormula>
 * @param {Map<string, { providerId: string, outputPortId: string }>} [opts.interfaceMap]   — SPEC-DECISION D6
 * @param {string | null} [opts.interceptPortId]   — if set, return var('__x__') instead of following src for this port (used by maxf)
 * @returns {Map<string, object>}  outputPortId → BoolFormula
 */
export function foldf(cft, componentIndex, opts = {}) {
    const depthLimit = opts.depthLimit ?? DEFAULT_DEPTH_LIMIT
    const memo = opts.memo ?? new Map()
    const interfaceMap = opts.interfaceMap ?? new Map()
    const interceptPortId = opts.interceptPortId ?? null

    // Build a lookup from target → source edge for this CFT (Def. 15: at most one edge per target)
    const srcOf = _buildSrcMap(cft)

    const result = new Map()
    for (const outPortId of cft.outputPorts) {
        const formula = _fNode(outPortId, cft, srcOf, componentIndex, depthLimit, memo, interfaceMap, interceptPortId, new Set())
        result.set(outPortId, BF.simplify(formula))
    }
    return result
}

/**
 * Compute the formula for node `id` in the context of `cft`.
 * This is the auxiliary function `f` from Def. 18.
 */
function _fNode(id, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard) {
    if (depth <= 0) throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)

    // ── Output port ───────────────────────────────────────────────────────────
    if (cft.outputPorts.includes(id)) {
        if (interceptPortId !== null && id === interceptPortId) {
            return BF.var('__x__')
        }
        const src = srcOf.get(id)
        if (src === undefined) {
            return BF.const(false) // SPEC-DECISION D2: no incoming edge → const false
        }
        return _fNode(src, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard)
    }

    // ── Internal event ────────────────────────────────────────────────────────
    if (cft.internalEvents.includes(id)) {
        return BF.var(id)
    }

    // ── Input port ────────────────────────────────────────────────────────────
    if (cft.inputPorts.includes(id)) {
        // SPEC-DECISION D6: if this port is connected via an interface to a provider,
        // fold the provider's CFT and return its output formula (qualified by provider id).
        const ifaceConn = interfaceMap.get(id)
        if (ifaceConn) {
            const { providerId, outputPortId } = ifaceConn
            const providerFormula = _foldProvider(providerId, outputPortId, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, cycleGuard)
            return BF.qualify(providerFormula, providerId)
        }
        return BF.var(id)
    }

    // ── Gate ──────────────────────────────────────────────────────────────────
    const gate = cft.gates.find(g => g.id === id)
    if (gate) {
        return _fGate(gate, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard)
    }

    // ── Subcomponent reference ────────────────────────────────────────────────
    const scRef = cft.subcomponentRefs.find(sc => sc.id === id)
    if (scRef) {
        return _fScRef(scRef, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard)
    }

    // Unknown node — treat as const false (defensive)
    return BF.const(false)
}

function _fGate(gate, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard) {
    // gate.formula is a BoolFormula over gate.inputs (the symbolic input port ids of the gate).
    // Substitute each gate input i_k with f(src(i_k)).
    let formula = gate.formula
    for (const inputId of gate.inputs) {
        let inputFormula
        if (interceptPortId !== null && inputId === interceptPortId) {
            // This gate input IS the target port for maxf — inject the fresh variable (Def. 21).
            inputFormula = BF.var('__x__')
        } else {
            const src = srcOf.get(inputId)
            inputFormula = src !== undefined
                ? _fNode(src, cft, srcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, cycleGuard)
                : BF.const(false) // SPEC-DECISION D2: unconnected gate input → false
        }
        formula = BF.substitute(formula, inputId, inputFormula)
    }
    return BF.simplify(formula)
}

function _fScRef(scRef, cft, srcOf, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard) {
    if (depth <= 0) throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)

    const refEntry = componentIndex.get(scRef.componentId)
    if (!refEntry) return BF.const(false)

    const refCft = refEntry.cft
    const cycleKey = `${scRef.id}:${scRef.componentId}`
    if (cycleGuard.has(cycleKey)) {
        throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)
    }

    // Check memo — the same component type may appear many times
    if (!memo.has(scRef.componentId)) {
        memo.set(scRef.componentId, new Map())
    }
    const componentMemo = memo.get(scRef.componentId)

    // Build the folded formulas for the referenced component (if not already memoized)
    if (componentMemo.size === 0 || !_memoCoversAllPorts(refCft, componentMemo)) {
        const refSrcOf = _buildSrcMap(refCft)
        const newGuard = new Set([...cycleGuard, cycleKey])
        for (const outPortId of refCft.outputPorts) {
            if (!componentMemo.has(outPortId)) {
                const formula = _fNode(outPortId, refCft, refSrcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, newGuard)
                componentMemo.set(outPortId, BF.simplify(formula))
            }
        }
    }

    // scRef.outputs maps this reference's output slots to the referenced CFT's output port ids
    // scRef.outputs[j] is the output port id in refCft that corresponds to scRef output slot j
    // For each output slot of the scRef, build the formula:
    //   take the memoized formula for the referenced output port,
    //   substitute each refCft input port variable with f(src(scRef.inputs[m])) in the parent,
    //   qualify remaining internal-event variables with scRef.id
    const outputFormulas = new Map()
    for (let j = 0; j < scRef.outputs.length; j++) {
        const refOutPortId = scRef.outputs[j]
        let formula = componentMemo.get(refOutPortId) ?? BF.const(false)

        // Substitute input port variables of the referenced CFT
        for (let m = 0; m < refCft.inputPorts.length; m++) {
            const refInPortId = refCft.inputPorts[m]
            const parentEdgeSrc = scRef.inputs[m] !== undefined ? srcOf.get(scRef.inputs[m]) : undefined
            const inputFormula = parentEdgeSrc !== undefined
                ? _fNode(parentEdgeSrc, cft, srcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, cycleGuard)
                : BF.const(false) // SPEC-DECISION D2
            formula = BF.substitute(formula, refInPortId, inputFormula)
        }

        // Qualify remaining internal-event variables with scRef.id (Def. 18 case 4).
        // "Remaining" = everything except any still-unresolved input port variables of the
        // referenced CFT. Pass inputPorts so the qualifier skips them.
        formula = _qualifyInternals(formula, refCft.inputPorts, scRef.id)
        outputFormulas.set(refOutPortId, BF.simplify(formula))
    }

    // Return the formula for the first output (the primary output port of the subcomponent).
    // Callers that need a specific output port use _fScRefOutput instead.
    if (scRef.outputs.length > 0) {
        return outputFormulas.get(scRef.outputs[0]) ?? BF.const(false)
    }
    return BF.const(false)
}

/**
 * Fold a provider component and return the formula at a specific output port.
 * Used for interface-connected input ports (SPEC-DECISION D6).
 */
function _foldProvider(providerId, outputPortId, componentIndex, depth, memo, interfaceMap, interceptPortId, cycleGuard) {
    if (depth <= 0) throw new DepthLimitError(DEFAULT_DEPTH_LIMIT)
    const entry = componentIndex.get(providerId)
    if (!entry) return BF.const(false)

    const refCft = entry.cft
    const componentMemo = memo.get(providerId) ?? new Map()
    if (!memo.has(providerId)) memo.set(providerId, componentMemo)

    if (!componentMemo.has(outputPortId)) {
        const refSrcOf = _buildSrcMap(refCft)
        const newGuard = new Set([...cycleGuard, providerId])
        const formula = _fNode(outputPortId, refCft, refSrcOf, componentIndex, depth - 1, memo, interfaceMap, interceptPortId, newGuard)
        componentMemo.set(outputPortId, BF.simplify(formula))
    }
    return componentMemo.get(outputPortId)
}

/**
 * Qualify all variables EXCEPT remaining unresolved input-port variables.
 * Implements the "rename" step in Def. 18 case 4:
 *   "qualify every remaining internal-event variable with c.id"
 *
 * "Remaining" means: after input-port substitution, the only unqualified free variables
 * left are either (a) direct or recursively-qualified internal events (always qualify) or
 * (b) input ports that were NOT connected (skip — they stay as free variables for the parent).
 *
 * @param {object} formula
 * @param {string[]} inputPortIds — ids of input ports in the referenced CFT (skip these)
 * @param {string} prefix — the scRef.id to prepend
 */
function _qualifyInternals(formula, inputPortIds, prefix) {
    if (formula.kind === 'const') return formula
    if (formula.kind === 'var') {
        // Never qualify the __x__ placeholder injected by computeMaxf (Def. 21).
        if (formula.id === '__x__') return formula
        return inputPortIds.includes(formula.id) ? formula : BF.var(prefix + '.' + formula.id)
    }
    if (formula.kind === 'and') {
        return BF.simplify(BF.and(...formula.args.map(a => _qualifyInternals(a, inputPortIds, prefix))))
    }
    if (formula.kind === 'or') {
        return BF.simplify(BF.or(...formula.args.map(a => _qualifyInternals(a, inputPortIds, prefix))))
    }
    return formula
}

function _buildSrcMap(cft) {
    const map = new Map()
    for (const edge of cft.edges) {
        map.set(edge.target, edge.source)
    }
    return map
}

function _memoCoversAllPorts(refCft, componentMemo) {
    return refCft.outputPorts.every(p => componentMemo.has(p))
}
