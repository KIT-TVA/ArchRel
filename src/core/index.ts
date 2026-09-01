export type {
    MethodSignature,
    Interface,
    Gate,
    SCRef,
    Edge,
    CFT,
    Component,
    ComponentIndex,
    InterfaceMap,
} from './types.js'
export {
    createComponent,
    createInterface,
    createMethodSignature,
    createCFT,
    createGate,
    createSCRef,
    createEdge,
    signaturesEqual,
    interfacesEqual,
    checkWellFormed,
    isLegal,
} from './types.js'

export type { BoolFormula } from './bool-formula.js'
export { BF } from './bool-formula.js'

export type { FoldOptions } from './fold.js'
export { foldf } from './fold.js'

export { probability } from './probability.js'

export { attachStrict, attachAtPoint } from './attach-strict.js'

export { computeMaxf } from './maxf.js'

export type { RuleResult } from './rules.js'
export { checkSubcomponentRule, checkInterfaceRule, checkFaultTreeRule } from './rules.js'

export {
    WellFormednessError,
    CycleError,
    OpenFormulaError,
    InfeasibleError,
    DepthLimitError,
    InvalidGateError,
} from './errors.js'

export type {
    StoreNode,
    GateType,
    StoreGate,
    StoreSCRef,
    StoreEdge,
    StoreCFT,
    StoreComponent,
    StoreInterface,
} from './translate.js'
export {
    translateCFT,
    buildComponentIndex,
    buildProbMap,
    buildInterfaceMap,
    buildSystemCFT,
    buildSystemComponent,
    findFreeTargets,
} from './translate.js'
