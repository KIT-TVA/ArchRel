import { InvalidGateError } from './errors.js'

export type BoolFormula =
    | { kind: 'const'; value: boolean }
    | { kind: 'var'; id: string }
    | { kind: 'and'; args: BoolFormula[] }
    | { kind: 'or'; args: BoolFormula[] }

const mkConst = (value: boolean): BoolFormula => ({ kind: 'const', value: !!value })
const mkVar = (id: string): BoolFormula => ({ kind: 'var', id })
const mkAnd = (...args: BoolFormula[]): BoolFormula => ({ kind: 'and', args })
const mkOr = (...args: BoolFormula[]): BoolFormula => ({ kind: 'or', args })

export const BF = {
    const: mkConst,
    var: mkVar,
    and: mkAnd,
    or: mkOr,

    freeVars(f: BoolFormula): Set<string> {
        switch (f.kind) {
            case 'const': return new Set()
            case 'var':   return new Set([f.id])
            case 'and':
            case 'or': {
                const result = new Set<string>()
                for (const arg of f.args) {
                    for (const v of BF.freeVars(arg)) result.add(v)
                }
                return result
            }
            default: throw new InvalidGateError((f as { kind: string }).kind)
        }
    },

    isClosed(f: BoolFormula): boolean {
        return BF.freeVars(f).size === 0
    },

    substitute(f: BoolFormula, varId: string, replacement: BoolFormula): BoolFormula {
        switch (f.kind) {
            case 'const': return f
            case 'var':   return f.id === varId ? replacement : f
            case 'and':   return BF.simplify(mkAnd(...f.args.map(a => BF.substitute(a, varId, replacement))))
            case 'or':    return BF.simplify(mkOr(...f.args.map(a => BF.substitute(a, varId, replacement))))
            default: throw new InvalidGateError((f as { kind: string }).kind)
        }
    },

    qualify(f: BoolFormula, prefix: string): BoolFormula {
        switch (f.kind) {
            case 'const': return f
            case 'var':   return mkVar(prefix + '.' + f.id)
            case 'and':   return mkAnd(...f.args.map(a => BF.qualify(a, prefix)))
            case 'or':    return mkOr(...f.args.map(a => BF.qualify(a, prefix)))
            default: throw new InvalidGateError((f as { kind: string }).kind)
        }
    },

    simplify(f: BoolFormula): BoolFormula {
        switch (f.kind) {
            case 'const':
            case 'var':
                return f

            case 'and': {
                const simplified = f.args.map(a => BF.simplify(a))
                if (simplified.some(a => a.kind === 'const' && a.value === false)) {
                    return mkConst(false)
                }
                const flat: BoolFormula[] = []
                for (const a of simplified) {
                    if (a.kind === 'const' && a.value === true) continue
                    if (a.kind === 'and') flat.push(...a.args)
                    else flat.push(a)
                }
                const deduped = _dedup(flat)
                if (deduped.length === 0) return mkConst(true)
                if (deduped.length === 1) return deduped[0]
                return mkAnd(...deduped)
            }

            case 'or': {
                const simplified = f.args.map(a => BF.simplify(a))
                if (simplified.some(a => a.kind === 'const' && a.value === true)) {
                    return mkConst(true)
                }
                const flat: BoolFormula[] = []
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

            default: throw new InvalidGateError((f as { kind: string }).kind)
        }
    },

    equals(a: BoolFormula, b: BoolFormula): boolean {
        if (a.kind !== b.kind) return false
        switch (a.kind) {
            case 'const': return a.value === (b as typeof a).value
            case 'var':   return a.id === (b as typeof a).id
            case 'and':
            case 'or': {
                const ba = b as typeof a
                if (a.args.length !== ba.args.length) return false
                return a.args.every((arg, i) => BF.equals(arg, ba.args[i]))
            }
            default: throw new InvalidGateError((a as { kind: string }).kind)
        }
    },

    serialize(f: BoolFormula): string {
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
            default: throw new InvalidGateError((f as { kind: string }).kind)
        }
    },
}

function _dedup(formulas: BoolFormula[]): BoolFormula[] {
    const seen = new Set<string>()
    const result: BoolFormula[] = []
    for (const f of formulas) {
        const key = BF.serialize(f)
        if (!seen.has(key)) {
            seen.add(key)
            result.push(f)
        }
    }
    return result
}
