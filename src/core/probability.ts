import { BF, type BoolFormula } from './bool-formula.js'
import { OpenFormulaError } from './errors.js'

export function probability(formula: BoolFormula, probMap: Map<string, number>): number {
    const memo = new Map<string, number>()
    return _eval(BF.simplify(formula), probMap, memo)
}

function _eval(f: BoolFormula, probMap: Map<string, number>, memo: Map<string, number>): number {
    const key = BF.serialize(f)
    if (memo.has(key)) return memo.get(key)!

    let result: number
    if (f.kind === 'const') {
        result = f.value ? 1 : 0
    } else {
        const vars = BF.freeVars(f)
        if (vars.size === 0) {
            result = 0
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

function _pickVar(f: BoolFormula, vars: Set<string>): string {
    const freq = new Map<string, number>()
    _countVars(f, freq)
    let best: string | null = null
    let bestCount = 0
    for (const v of vars) {
        const c = freq.get(v) ?? 0
        if (c > bestCount) { bestCount = c; best = v }
    }
    return best ?? vars.values().next().value as string
}

function _countVars(f: BoolFormula, freq: Map<string, number>): void {
    if (f.kind === 'var') {
        freq.set(f.id, (freq.get(f.id) ?? 0) + 1)
    } else if (f.kind === 'and' || f.kind === 'or') {
        for (const a of f.args) _countVars(a, freq)
    }
}
