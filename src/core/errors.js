/**
 * Custom error classes for the RbC² core semantics engine.
 * All errors extend Error and carry a machine-readable `code` property.
 */

export class WellFormednessError extends Error {
    constructor(message) {
        super(message)
        this.name = 'WellFormednessError'
        this.code = 'WELL_FORMEDNESS'
    }
}

export class CycleError extends Error {
    constructor(message) {
        super(message)
        this.name = 'CycleError'
        this.code = 'CYCLE'
    }
}

export class OpenFormulaError extends Error {
    constructor(varId) {
        super(`Formula has free variable '${varId}' with no probability assignment`)
        this.name = 'OpenFormulaError'
        this.code = 'OPEN_FORMULA'
        this.varId = varId
    }
}

export class InfeasibleError extends Error {
    constructor(iv, p0) {
        super(`System already exceeds target: IV=${iv} < P0=${p0}; no value at this port can satisfy the bound`)
        this.name = 'InfeasibleError'
        this.code = 'INFEASIBLE'
        this.iv = iv
        this.p0 = p0
    }
}

export class DepthLimitError extends Error {
    constructor(limit) {
        super(`Fold recursion exceeded depth limit of ${limit}`)
        this.name = 'DepthLimitError'
        this.code = 'DEPTH_LIMIT'
        this.limit = limit
    }
}

// SPEC-DECISION D1: No XOR or other non-monotone connectives (Def. 17)
export class InvalidGateError extends Error {
    constructor(kind) {
        super(
            `Gate kind '${kind}' is not allowed. Def. 17 restricts formulas to monotone operators: ` +
            `'and', 'or', 'const', and 'var' only. XOR and negation are excluded.`
        )
        this.name = 'InvalidGateError'
        this.code = 'INVALID_GATE'
        this.kind = kind
    }
}
