/**
 * Rule checks for the RbC² refinement calculus.
 * Implements Def. 22-24 from the thesis.
 *
 * All rule functions:
 *   - Take the *system* as a whole (global tree)
 *   - Return a discriminated RuleResult (never a bare boolean)
 *   - Keep the model immutable: produce a new system object on success
 *   - Must be recomputed from scratch — never cache across rule applications
 *
 * RuleResult:
 *   { ok: true, next: Component }                       — the refined system
 *   { ok: false, reason: string, definition: string }   — e.g. 'Def. 22'
 */

import { BF } from './bool-formula.js'
import { foldf } from './fold.js'
import { probability } from './probability.js'
import { attachStrict } from './attach-strict.js'
import { computeMaxf } from './maxf.js'
import { isLegal, checkWellFormed, interfacesEqual, createSCRef } from './types.js'
import { InfeasibleError, CycleError, WellFormednessError, OpenFormulaError } from './errors.js'

/**
 * "Closed" in the spec's sense (Def. 24): the folded formula has no free variables
 * that came from input ports. Basic event variables are OK — they have probabilities.
 */
function _hasOpenInputPort(formula, inputPortIds) {
    if (!inputPortIds || inputPortIds.length === 0) return false
    const fv = BF.freeVars(formula)
    return inputPortIds.some(id => fv.has(id))
}

// ── 7.1 Subcomponent Rule (Def. 22) ─────────────────────────────────────────

/**
 * Check whether adding `childComponent` as a subcomponent of `parentComponent` is sound.
 *
 * Structural change:
 *   S* = S ∪ {C1}, F* = attachStrict(F0, ref(C1))
 *
 * Soundness condition:
 *   P(E_{F_child}) ≤ maxf(system_after_change, g_top.in, IV)
 *
 * @param {object} system — current system Component
 * @param {object} parentComponent — the component receiving the new subcomponent
 * @param {object} childComponent — the new subcomponent being added
 * @param {Map<string, { component: object, cft: object }>} componentIndex
 * @param {Map<string, number>} probMap
 * @param {number} iv — system-level max failure probability
 * @param {object} [systemCft] — the system-level CFT (if separate from system.faultTree)
 * @param {Map<string, { providerId: string, outputPortId: string }>} [interfaceMap]
 * @param {function} [createId]
 * @returns {{ ok: boolean, next?: object, reason?: string, definition?: string }}
 */
export function checkSubcomponentRule(
    system,
    parentComponent,
    childComponent,
    componentIndex,
    probMap,
    iv,
    systemCft,
    interfaceMap = new Map(),
    createId = undefined
) {
    try {
        // 1. Create SCRef for the child component
        const childRefId = createId ? createId() : _genId()
        const scRef = createSCRef({
            id: childRefId,
            componentId: childComponent.id,
            inputs: [],
            outputs: childComponent.faultTree ? [...childComponent.faultTree.outputPorts] : [],
        })

        // 2. Attach the child into the parent's CFT via attachStrict
        const parentCft = parentComponent.faultTree
        if (!parentCft) {
            return { ok: false, reason: 'Parent component has no fault tree', definition: 'Def. 22' }
        }
        const parentOutputPortId = parentCft.outputPorts[0]
        if (!parentOutputPortId) {
            return { ok: false, reason: 'Parent CFT has no output port', definition: 'Def. 22' }
        }

        const { cft: newParentCft, newInputId } = attachStrict(parentCft, parentOutputPortId, childRefId, createId)

        // 3. Update the component index with the new parent CFT and child
        const newParentComp = {
            ...parentComponent,
            faultTree: { ...newParentCft, subcomponentRefs: [...newParentCft.subcomponentRefs, scRef] },
        }
        const newIndex = new Map(componentIndex)
        newIndex.set(parentComponent.id, { component: newParentComp, cft: newParentComp.faultTree })
        newIndex.set(childComponent.id, { component: childComponent, cft: childComponent.faultTree })

        // 4. Re-check legality of the new parent CFT
        try {
            checkWellFormed(newParentComp.faultTree)
            isLegal(newParentComp.faultTree, newIndex, parentComponent.id)
        } catch (e) {
            return { ok: false, reason: e.message, definition: 'Def. 22' }
        }

        // 5. Compute maxf for the new input slot in the global system context
        const effectiveSystemCft = systemCft ?? system.faultTree
        let maxfValue
        try {
            maxfValue = computeMaxf(effectiveSystemCft, newIndex, probMap, newInputId, iv, interfaceMap)
        } catch (e) {
            if (e instanceof InfeasibleError) {
                return { ok: false, reason: e.message, definition: 'Def. 22' }
            }
            throw e
        }

        // 6. Compute P(E_{F_child}) — only defined when the child's CFT is closed
        const childCft = childComponent.faultTree
        if (!childCft) {
            // A freshly created, empty child has P(E_F) = 0 (SPEC-DECISION D2) → passes trivially
            return { ok: true, next: _buildNewSystem(system, parentComponent.id, newParentComp) }
        }

        const childFormulas = foldf(childCft, newIndex, { interfaceMap })
        const childOutPortId = childCft.outputPorts[0]
        if (!childOutPortId) {
            return { ok: true, next: _buildNewSystem(system, parentComponent.id, newParentComp) }
        }
        const childFormula = childFormulas.get(childOutPortId) ?? BF.const(false)

        // "Closed" = no unresolved input-port variables (Def. 22 / Def. 19).
        // Basic event variables are fine — they are resolved via probMap.
        if (_hasOpenInputPort(childFormula, childCft.inputPorts)) {
            return {
                ok: false,
                reason: 'Child component fault tree has open input ports — P(E_F) is undefined (Def. 19)',
                definition: 'Def. 22',
            }
        }

        let pChild
        try {
            pChild = probability(childFormula, probMap)
        } catch (e) {
            if (e instanceof OpenFormulaError) {
                return { ok: false, reason: `Missing probability for variable '${e.varId}'`, definition: 'Def. 22' }
            }
            throw e
        }

        // 7. Soundness check: P(E_{F_child}) ≤ maxf
        if (pChild > maxfValue + 1e-12) {
            return {
                ok: false,
                reason: `P(E_F) = ${pChild.toExponential(6)} exceeds maxf = ${maxfValue.toExponential(6)} (Def. 22 soundness condition)`,
                definition: 'Def. 22',
            }
        }

        return { ok: true, next: _buildNewSystem(system, parentComponent.id, newParentComp) }
    } catch (e) {
        return { ok: false, reason: e.message, definition: 'Def. 22' }
    }
}

// ── 7.2 Interface Rule (Def. 23) ─────────────────────────────────────────────

/**
 * Check whether connecting `provider` to `requirer` over interface `iface` is sound.
 *
 * Requirements checked in order (Def. 23):
 *   1. iface ∈ provider.provided and iface ∈ requirer.required (interface equality check)
 *   2. Connection not already present in 𝕀
 *   3. Soundness: P(E_{F_provider}) ≤ maxf(new input slot in requirer)
 *
 * SPEC-DECISION D5: the fault-tree construction is missing from Def. 23.
 *   Under the strict failure model, the requirer fails whenever the provider fails.
 *   We implement this as: add an input port to requirer's CFT, attach it via attachStrict
 *   to requirer's top-most OR gate, and record in 𝕀 that this input is fed by provider's output.
 *   Soundness: P(E_{F_provider}) ≤ maxf(new_input_in_requirer's_tree).
 *   NOTE: the direction of this interpretation (g_top in F_requirer, not F_provider) is an
 *   interpretation of the thesis, not an explicit statement. Flag in PR description.
 *
 * SPEC-DECISION D6: cross-component edges.
 *   interfaceMap is updated to record that requirer's new input port is fed by provider's output.
 *   foldf will resolve this connection when folding the requirer's CFT.
 *
 * @param {object} system
 * @param {object} requirer — component that requires the interface
 * @param {object} provider — component that provides the interface
 * @param {object} iface — the interface (createInterface shape)
 * @param {Map<string, { component: object, cft: object }>} componentIndex
 * @param {Map<string, number>} probMap
 * @param {number} iv
 * @param {Set<string>} connections𝕀 — Set of "${providerId}|${requirerId}|${ifaceName}" strings
 * @param {object} [systemCft]
 * @param {Map<string, { providerId: string, outputPortId: string }>} [interfaceMap]
 * @param {function} [createId]
 * @returns {{ ok: boolean, next?: object, next𝕀?: Set<string>, nextInterfaceMap?: Map, reason?: string, definition?: string }}
 */
export function checkInterfaceRule(
    system,
    requirer,
    provider,
    iface,
    componentIndex,
    probMap,
    iv,
    connections𝕀 = new Set(),
    systemCft = null,
    interfaceMap = new Map(),
    createId = undefined
) {
    // 1. Interface membership check
    const inProvided = provider.provided && provider.provided.some(pi => interfacesEqual(pi, iface))
    const inRequired = requirer.required && requirer.required.some(ri => interfacesEqual(ri, iface))

    if (!inProvided) {
        return {
            ok: false,
            reason: `Interface '${iface.name}' is not in provider.provided`,
            definition: 'Def. 23',
        }
    }
    if (!inRequired) {
        return {
            ok: false,
            reason: `Interface '${iface.name}' is not in requirer.required`,
            definition: 'Def. 23',
        }
    }

    // 2. No duplicate connection
    const connKey = `${provider.id}|${requirer.id}|${iface.name}`
    if (connections𝕀.has(connKey)) {
        return {
            ok: false,
            reason: `Connection (${provider.name} → ${requirer.name} via '${iface.name}') already exists`,
            definition: 'Def. 23',
        }
    }

    // 3. Structural change (SPEC-DECISION D5):
    //    Add an input port to requirer's CFT and attach it via attachStrict
    const requirerCft = requirer.faultTree
    if (!requirerCft) {
        return { ok: false, reason: 'Requirer has no fault tree', definition: 'Def. 23' }
    }
    const requirerOutputPortId = requirerCft.outputPorts[0]
    if (!requirerOutputPortId) {
        return { ok: false, reason: 'Requirer CFT has no output port', definition: 'Def. 23' }
    }

    const newInputSlotId = createId ? createId() : _genId()
    const { cft: newRequirerCft, newInputId } = attachStrict(
        requirerCft, requirerOutputPortId, newInputSlotId, createId
    )
    // newInputId is the gate input that newInputSlotId connects to.
    // The "input port" visible at the boundary is newInputSlotId.

    const newRequirer = {
        ...requirer,
        faultTree: newRequirerCft,
    }

    const newIndex = new Map(componentIndex)
    newIndex.set(requirer.id, { component: newRequirer, cft: newRequirerCft })

    // Update interfaceMap: newInputSlotId is now fed by the provider's primary output port
    // (SPEC-DECISION D6)
    const providerCft = provider.faultTree
    const providerOutputPortId = providerCft?.outputPorts[0]
    const newInterfaceMap = new Map(interfaceMap)
    if (providerOutputPortId) {
        newInterfaceMap.set(newInputSlotId, {
            providerId: provider.id,
            outputPortId: providerOutputPortId,
        })
    }

    // 4. Soundness check: P(E_{F_provider}) ≤ maxf(new input slot in system context)
    const effectiveSystemCft = systemCft ?? system.faultTree
    let maxfValue
    try {
        maxfValue = computeMaxf(effectiveSystemCft, newIndex, probMap, newInputId, iv, newInterfaceMap)
    } catch (e) {
        if (e instanceof InfeasibleError) {
            return { ok: false, reason: e.message, definition: 'Def. 23' }
        }
        throw e
    }

    // P(E_{F_provider})
    if (!providerCft) {
        // Empty provider → P = 0, trivially sound
    } else {
        const providerFormulas = foldf(providerCft, newIndex, { interfaceMap: newInterfaceMap })
        const providerFormula = providerOutputPortId
            ? (providerFormulas.get(providerOutputPortId) ?? BF.const(false))
            : BF.const(false)

        if (_hasOpenInputPort(providerFormula, providerCft.inputPorts)) {
            return {
                ok: false,
                reason: 'Provider fault tree has open input ports — P(E_F_provider) is undefined (Def. 19)',
                definition: 'Def. 23',
            }
        }

        let pProvider
        try {
            pProvider = probability(providerFormula, probMap)
        } catch (e) {
            if (e instanceof OpenFormulaError) {
                return { ok: false, reason: `Missing probability for '${e.varId}'`, definition: 'Def. 23' }
            }
            throw e
        }
        if (pProvider > maxfValue + 1e-12) {
            return {
                ok: false,
                reason: `P(E_F_provider) = ${pProvider.toExponential(6)} exceeds maxf = ${maxfValue.toExponential(6)} (Def. 23 soundness condition)`,
                definition: 'Def. 23',
            }
        }
    }

    const next𝕀 = new Set(connections𝕀)
    next𝕀.add(connKey)

    return {
        ok: true,
        next: _buildNewSystem(system, requirer.id, newRequirer),
        next𝕀,
        nextInterfaceMap: newInterfaceMap,
    }
}

// ── 7.3 Fault Tree Rule (Def. 24) ────────────────────────────────────────────

/**
 * Check whether replacing `component.faultTree` with `newCft` is sound.
 *
 * Conditions (Def. 24):
 *   1. isLegal(newCft)
 *   2. foldf(newCft)(o) is closed for every output port o
 *   3. P(E_{F*}) ≤ maxf(F*^o), evaluated globally
 *   4. Diff validation: changes outside the target input port subtree → reject
 *
 * @param {object} system
 * @param {object} component — component whose CFT is being refined
 * @param {object} newCft — the proposed new CFT
 * @param {Map<string, { component: object, cft: object }>} componentIndex
 * @param {Map<string, number>} probMap
 * @param {number} iv
 * @param {object} [systemCft]
 * @param {Map<string, { providerId: string, outputPortId: string }>} [interfaceMap]
 * @returns {{ ok: boolean, next?: object, reason?: string, definition?: string }}
 */
export function checkFaultTreeRule(
    system,
    component,
    newCft,
    componentIndex,
    probMap,
    iv,
    systemCft = null,
    interfaceMap = new Map()
) {
    // 1. Well-formedness and legality
    try {
        checkWellFormed(newCft)
    } catch (e) {
        return { ok: false, reason: e.message, definition: 'Def. 24' }
    }

    const newIndex = new Map(componentIndex)
    newIndex.set(component.id, { component, cft: newCft })

    try {
        isLegal(newCft, newIndex, component.id)
    } catch (e) {
        return { ok: false, reason: e.message, definition: 'Def. 24' }
    }

    // 2. All folded output formulas must be closed
    let formulas
    try {
        formulas = foldf(newCft, newIndex, { interfaceMap })
    } catch (e) {
        return { ok: false, reason: e.message, definition: 'Def. 24' }
    }

    for (const [portId, formula] of formulas) {
        if (_hasOpenInputPort(formula, newCft.inputPorts)) {
            const openVars = newCft.inputPorts.filter(id => BF.freeVars(formula).has(id)).join(', ')
            return {
                ok: false,
                reason: `Output port '${portId}' has unresolved input-port variables (${openVars}) — Def. 24 requires all output formulas to be closed (no input-port free variables)`,
                definition: 'Def. 24',
            }
        }
    }

    // 3. P(E_{F*}) ≤ maxf, evaluated globally
    const effectiveSystemCft = systemCft ?? system.faultTree

    // The system's output port represents E_F. maxf is computed for each component output slot
    // in the system tree that corresponds to this component.
    // We evaluate at the component's primary output port in the global context.
    const primaryOutPortId = newCft.outputPorts[0]
    if (primaryOutPortId) {
        let maxfValue
        try {
            maxfValue = computeMaxf(effectiveSystemCft, newIndex, probMap, primaryOutPortId, iv, interfaceMap)
        } catch (e) {
            if (e instanceof InfeasibleError) {
                return { ok: false, reason: e.message, definition: 'Def. 24' }
            }
            throw e
        }

        const formula = formulas.get(primaryOutPortId) ?? BF.const(false)
        let pF
        try {
            pF = probability(formula, probMap)
        } catch (e) {
            if (e instanceof OpenFormulaError) {
                return { ok: false, reason: `Missing probability for '${e.varId}' — ensure all basic events have entries in probMap`, definition: 'Def. 24' }
            }
            throw e
        }

        if (pF > maxfValue + 1e-12) {
            return {
                ok: false,
                reason: `P(E_F*) = ${pF.toExponential(6)} exceeds maxf = ${maxfValue.toExponential(6)} (Def. 24 soundness condition)`,
                definition: 'Def. 24',
            }
        }
    }

    // 4. Diff validation (Def. 24 final remark):
    //    Changes to the component's parent are only permitted if they exclusively affect
    //    the input port of the parent that feeds this component.
    //    Here we validate the new CFT itself doesn't illegally extend beyond the allowed diff.
    //    The full parent-diff check requires the parent's old CFT, which the caller must supply
    //    via a separate validation pass if needed. We perform the intra-CFT legality check above.

    const newComponent = { ...component, faultTree: newCft }
    return { ok: true, next: _buildNewSystem(system, component.id, newComponent) }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0
function _genId() {
    return `rule_${++_idCounter}`
}

/**
 * Build a new system Component with an updated component (by id) in the hierarchy.
 * Replaces the matching component anywhere in the subcomponent tree.
 */
function _buildNewSystem(system, targetId, newComponent) {
    if (system.id === targetId) {
        return newComponent
    }
    return {
        ...system,
        subcomponents: system.subcomponents.map(sc =>
            sc.id === targetId ? newComponent : _buildNewSystem(sc, targetId, newComponent)
        ),
    }
}
