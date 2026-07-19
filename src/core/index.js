/**
 * RbC² Core Semantics Engine — Public API
 *
 * This module implements the formal core of Reliability-by-Construction
 * based on Component Fault Trees, as specified in the thesis (Def. 11–24).
 *
 * This module has zero dependencies on Vue, Pinia, or the DOM.
 * It operates on pure semantic objects (no x/y/width/height UI properties).
 *
 * @future translateFromStore(cftStoreState, diagramStoreState) => { componentIndex, probMap, interfaceMap }
 *   A translation layer (not implemented here per spec constraint) will map the Pinia store
 *   shapes (with UI properties) to the core types. Key mappings:
 *   - Strip x, y, width, height, waypoints from all objects
 *   - Map cft.nodes (mixed array) → separate internalEvents, inputPorts, outputPorts arrays
 *   - Map cft.gates (with UI props) → Gate objects
 *   - Map cft.subComponents → SCRef objects
 *   - Map diagram.components + diagram.interfaces → Component objects with required/provided
 *   - Build interfaceMap from diagram.interfaces + cft input port connections
 */

// Data model
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

// BoolFormula ADT
export { BF } from './bool-formula.js'

// Fold (Def. 18)
export { foldf } from './fold.js'

// Probability evaluation (Def. 19)
export { probability } from './probability.js'

// attachStrict (Def. 20)
export { attachStrict } from './attach-strict.js'

// maxf (Def. 21)
export { computeMaxf } from './maxf.js'

// Rule checks (Def. 22-24)
export {
    checkSubcomponentRule,
    checkInterfaceRule,
    checkFaultTreeRule,
} from './rules.js'

// Errors
export {
    WellFormednessError,
    CycleError,
    OpenFormulaError,
    InfeasibleError,
    DepthLimitError,
    InvalidGateError,
} from './errors.js'
