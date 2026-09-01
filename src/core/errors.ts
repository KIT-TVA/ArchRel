export class WellFormednessError extends Error {
    readonly code = 'WELL_FORMEDNESS' as const
    constructor(message: string) {
        super(message)
        this.name = 'WellFormednessError'
    }
}

export class CycleError extends Error {
    readonly code = 'CYCLE' as const
    constructor(message: string) {
        super(message)
        this.name = 'CycleError'
    }
}

export class OpenFormulaError extends Error {
    readonly code = 'OPEN_FORMULA' as const
    readonly varId: string
    constructor(varId: string) {
        super(`Formula has free variable '${varId}' with no probability assignment`)
        this.name = 'OpenFormulaError'
        this.varId = varId
    }
}

export class InfeasibleError extends Error {
    readonly code = 'INFEASIBLE' as const
    readonly iv: number
    readonly p0: number
    constructor(iv: number, p0: number) {
        super(`System already exceeds target: IV=${iv} < P0=${p0}; no value at this port can satisfy the bound`)
        this.name = 'InfeasibleError'
        this.iv = iv
        this.p0 = p0
    }
}

export class DepthLimitError extends Error {
    readonly code = 'DEPTH_LIMIT' as const
    readonly limit: number
    constructor(limit: number) {
        super(`Fold recursion exceeded depth limit of ${limit}`)
        this.name = 'DepthLimitError'
        this.limit = limit
    }
}

export class InvalidGateError extends Error {
    readonly code = 'INVALID_GATE' as const
    readonly kind: string
    constructor(kind: string) {
        super(
            `Gate kind '${kind}' is not allowed. Def. 17 restricts formulas to monotone operators: ` +
            `'and', 'or', 'const', and 'var' only. XOR and negation are excluded.`
        )
        this.name = 'InvalidGateError'
        this.kind = kind
    }
}
