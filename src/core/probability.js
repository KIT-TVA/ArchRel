/**
 * Probability evaluation via Shannon decomposition.
 * Implements Def. 19 from the thesis.
 *
 * CRITICAL: Uses Shannon decomposition, NOT naive AND/OR product formulas.
 * The product formulas assume statistical independence of all inputs.
 * When a shared basic event fans out to multiple subtrees, the products
 * silently produce wrong numbers. Shannon decomposition handles repeated
 * variables correctly by conditioning on each variable exactly once.
 *
 * P(v) = p(x) · P(v|x=true) + (1 − p(x)) · P(v|x=false)
 * Pick any x ∈ freeVars(v), recurse on both cofactors, terminate when v is constant.
 */

import { BF } from './bool-formula.js'
import { OpenFormulaError } from './errors.js'

/**
 * Evaluate the probability of a BoolFormula given variable probabilities.
 *
 * @param {object} formula — BoolFormula (must be closed after resolving probMap)
 * @param {Map<string, number>} probMap — maps variable id → probability in [0,1]
 * @returns {number}
 * @throws {OpenFormulaError} if a variable has no probability assignment
 */
export function probability(formula, probMap) {
    const memo = new Map()
    return _eval(BF.simplify(formula), probMap, memo)
}

function _eval(f, probMap, memo) {
    const key = BF.serialize(f)
    if (memo.has(key)) return memo.get(key)

    let result
    if (f.kind === 'const') {
        result = f.value ? 1 : 0
    } else {
        // Pick a variable to condition on (any; we pick the first in freeVars for determinism)
        const vars = BF.freeVars(f)
        if (vars.size === 0) {
            // Shouldn't happen after simplify reduced constants, but be safe
            result = f.value ? 1 : 0
        } else {
            const x = _pickVar(f, vars)
            const px = probMap.get(x)
            if (px === undefined) throw new OpenFormulaError(x)

            const fTrue  = BF.simplify(BF.substitute(f, x, BF.const(true)))
            const fFalse = BF.simplify(BF.substitute(f, x, BF.const(false)))

            result = px * _eval(fTrue, probMap, memo) + (1 - px) * _eval(fFalse, probMap, memo)
        }
    }

    memo.set(key, result)
    return result
}

/**
 * Pick the variable that appears most frequently in the formula.
 * More frequent variables split the formula more aggressively, improving cache hit rates.
 * Correctness does not depend on which variable is chosen — this is purely a heuristic.
 */
function _pickVar(f, vars) {
    const freq = new Map()
    _countVars(f, freq)
    let best = null, bestCount = 0
    for (const v of vars) {
        const c = freq.get(v) ?? 0
        if (c > bestCount) { bestCount = c; best = v }
    }
    return best ?? vars.values().next().value
}

function _countVars(f, freq) {
    if (f.kind === 'var') {
        freq.set(f.id, (freq.get(f.id) ?? 0) + 1)
    } else if (f.kind === 'and' || f.kind === 'or') {
        for (const a of f.args) _countVars(a, freq)
    }
}
