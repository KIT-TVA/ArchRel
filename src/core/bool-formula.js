/**
 * BoolFormula ADT and operations.
 * Implements Def. 17 from the thesis.
 *
 * Monotone formulas only: const, var, and, or.
 * SPEC-DECISION D1: No XOR. Def. 17 restricts formulas to monotone operators.
 * Any attempt to construct an XOR formula must be rejected with InvalidGateError.
 */

import { InvalidGateError } from './errors.js'

// ── Constructors ──────────────────────────────────────────────────────────────

/** @param {boolean} value */
const mkConst = (value) => ({ kind: 'const', value: !!value })

/** @param {string} id — variable identifier (event id, port id, or qualified name) */
const mkVar = (id) => ({ kind: 'var', id })

/** @param {...object} args — BoolFormula children (n-ary) */
const mkAnd = (...args) => ({ kind: 'and', args })

/** @param {...object} args — BoolFormula children (n-ary) */
const mkOr = (...args) => ({ kind: 'or', args })

export const BF = {
    const: mkConst,
    var: mkVar,
    and: mkAnd,
    or: mkOr,

    // ── Free Variables ────────────────────────────────────────────────────────

    /**
     * Returns the set of all variable ids occurring in the formula.
     * @param {object} f
     * @returns {Set<string>}
     */
    freeVars(f) {
        switch (f.kind) {
            case 'const': return new Set()
            case 'var':   return new Set([f.id])
            case 'and':
            case 'or': {
                const result = new Set()
                for (const arg of f.args) {
                    for (const v of BF.freeVars(arg)) result.add(v)
                }
                return result
            }
            default: throw new InvalidGateError(f.kind)
        }
    },

    /**
     * True iff the formula has no free variables.
     * @param {object} f
     */
    isClosed(f) {
        return BF.freeVars(f).size === 0
    },

    // ── Substitution ─────────────────────────────────────────────────────────

    /**
     * Returns a new formula with every occurrence of variable `varId` replaced by `replacement`.
     * @param {object} f
     * @param {string} varId
     * @param {object} replacement — BoolFormula
     */
    substitute(f, varId, replacement) {
        switch (f.kind) {
            case 'const': return f
            case 'var':   return f.id === varId ? replacement : f
            case 'and':   return BF.simplify(mkAnd(...f.args.map(a => BF.substitute(a, varId, replacement))))
            case 'or':    return BF.simplify(mkOr(...f.args.map(a => BF.substitute(a, varId, replacement))))
            default: throw new InvalidGateError(f.kind)
        }
    },

    /**
     * Returns a new formula with every variable id prefixed by `prefix + "."`.
     * Used for qualifying internal event variables with their subcomponent instance id (Def. 18 case 4).
     * @param {object} f
     * @param {string} prefix
     */
    qualify(f, prefix) {
        switch (f.kind) {
            case 'const': return f
            case 'var':   return mkVar(prefix + '.' + f.id)
            case 'and':   return mkAnd(...f.args.map(a => BF.qualify(a, prefix)))
            case 'or':    return mkOr(...f.args.map(a => BF.qualify(a, prefix)))
            default: throw new InvalidGateError(f.kind)
        }
    },

    // ── Simplification ───────────────────────────────────────────────────────

    /**
     * Algebraic simplification:
     *   and(true, x) → x,  and(false, x) → false
     *   or(false, x) → x,  or(true, x) → true
     *   Flatten nested and/or.
     *   Remove duplicates by structural equality.
     * @param {object} f
     * @returns {object} simplified BoolFormula
     */
    simplify(f) {
        switch (f.kind) {
            case 'const':
            case 'var':
                return f

            case 'and': {
                const simplified = f.args.map(a => BF.simplify(a))
                // Short-circuit on false
                if (simplified.some(a => a.kind === 'const' && a.value === false)) {
                    return mkConst(false)
                }
                // Flatten nested ands, drop true constants
                const flat = []
                for (const a of simplified) {
                    if (a.kind === 'const' && a.value === true) continue
                    if (a.kind === 'and') flat.push(...a.args)
                    else flat.push(a)
                }
                // Deduplicate by serialization
                const deduped = _dedup(flat)
                if (deduped.length === 0) return mkConst(true)
                if (deduped.length === 1) return deduped[0]
                return mkAnd(...deduped)
            }

            case 'or': {
                const simplified = f.args.map(a => BF.simplify(a))
                // Short-circuit on true
                if (simplified.some(a => a.kind === 'const' && a.value === true)) {
                    return mkConst(true)
                }
                // Flatten nested ors, drop false constants
                const flat = []
                for (const a of simplified) {
                    if (a.kind === 'const' && a.value === false) continue
                    if (a.kind === 'or') flat.push(...a.args)
                    else flat.push(a)
                }
                const deduped = _dedup(flat)
                if (deduped.length === 0) return mkConst(false)
                if (deduped.length === 1) return deduped[0]
                return mkOr(...deduped)
            }

            default: throw new InvalidGateError(f.kind)
        }
    },

    // ── Structural Equality ───────────────────────────────────────────────────

    /**
     * Deep structural equality between two formulas.
     * @param {object} a
     * @param {object} b
     */
    equals(a, b) {
        if (a.kind !== b.kind) return false
        switch (a.kind) {
            case 'const': return a.value === b.value
            case 'var':   return a.id === b.id
            case 'and':
            case 'or':
                if (a.args.length !== b.args.length) return false
                return a.args.every((arg, i) => BF.equals(arg, b.args[i]))
            default: throw new InvalidGateError(a.kind)
        }
    },

    // ── Serialization (for memoization keys) ─────────────────────────────────

    /**
     * Returns a canonical string representation of the formula, suitable for use as a memo key.
     * Children of and/or are sorted to ensure structural uniqueness after simplification.
     * @param {object} f
     * @returns {string}
     */
    serialize(f) {
        switch (f.kind) {
            case 'const': return f.value ? 'T' : 'F'
            case 'var':   return `V(${f.id})`
            case 'and': {
                const parts = f.args.map(a => BF.serialize(a)).sort()
                return `A(${parts.join(',')})`
            }
            case 'or': {
                const parts = f.args.map(a => BF.serialize(a)).sort()
                return `O(${parts.join(',')})`
            }
            default: throw new InvalidGateError(f.kind)
        }
    },
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _dedup(formulas) {
    const seen = new Set()
    const result = []
    for (const f of formulas) {
        const key = BF.serialize(f)
        if (!seen.has(key)) {
            seen.add(key)
            result.push(f)
        }
    }
    return result
}
