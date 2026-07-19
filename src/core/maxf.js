/**
 * maxf: maximum allowable failure probability for a target port.
 * Implements Def. 21 from the thesis.
 *
 * This is a global computation over the entire system fault tree.
 * It must be recomputed from scratch on every call — never cache it across rule applications.
 */

import { foldf } from './fold.js'
import { probability } from './probability.js'
import { BF } from './bool-formula.js'
import { InfeasibleError } from './errors.js'

const EPSILON = 1e-12

/**
 * Compute the maximum allowable failure probability for `targetPortId` in the system.
 *
 * Algorithm (Def. 21):
 *   1. Introduce fresh variable __x__ at targetPortId: fold the system CFT but intercept
 *      the target port and return var('__x__') instead of following src.
 *   2. This yields B(x) at the system output port.
 *   3. Compute P0 = P(B with x:=false), P1 = P(B with x:=true).
 *   4. maxf = (IV − P0) / (P1 − P0)
 *
 * SPEC-DECISION D4:
 *   P1 ≈ P0 (within epsilon): the port has no influence → return 1
 *   IV < P0: system already infeasible at this port → throw InfeasibleError
 *   Otherwise: clamp result to [0, 1]
 *
 * @param {object} systemCft — the system-level CFT (single output port = system failure)
 * @param {Map<string, { component: object, cft: object }>} componentIndex
 * @param {Map<string, number>} probMap — basic event probabilities
 * @param {string} targetPortId — the port (typically a gate input port id) whose maxf to compute
 * @param {number} iv — the intended value (system max failure probability)
 * @param {Map<string, { providerId: string, outputPortId: string }>} [interfaceMap]
 * @returns {number} maxf in [0, 1]
 * @throws {InfeasibleError} if IV < P0
 */
export function computeMaxf(systemCft, componentIndex, probMap, targetPortId, iv, interfaceMap = new Map()) {
    // Fold the system formula with __x__ substituted at targetPortId
    const formulaMap = foldf(systemCft, componentIndex, {
        interfaceMap,
        interceptPortId: targetPortId,
    })

    // The system CFT has exactly one output port (System Failure)
    const systemOutputPortId = systemCft.outputPorts[0]
    const B = formulaMap.get(systemOutputPortId) ?? BF.const(false)

    // Compute cofactors
    const B0 = BF.simplify(BF.substitute(B, '__x__', BF.const(false)))
    const B1 = BF.simplify(BF.substitute(B, '__x__', BF.const(true)))

    const P0 = probability(B0, probMap)
    const P1 = probability(B1, probMap)

    // SPEC-DECISION D4: degenerate cases
    if (Math.abs(P1 - P0) < EPSILON) {
        // The port has no influence on the top event — any value is acceptable
        return 1
    }

    if (iv < P0 - EPSILON) {
        // System already exceeds the target even with the component not failing
        throw new InfeasibleError(iv, P0)
    }

    // General formula (Def. 21)
    // KNOWN-LIMITATION: This inversion treats __x__ as independent of the rest of the formula.
    // If the subtree being attached shares internal events with the rest of the system,
    // that assumption fails and the bound is not trustworthy. The caller is responsible for
    // surfacing this warning in the UI when shared events are detected.
    const maxf = (iv - P0) / (P1 - P0)
    return Math.max(0, Math.min(1, maxf))
}
