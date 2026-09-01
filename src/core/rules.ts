import { BF } from './bool-formula.js'
import { foldf } from './fold.js'
import { probability } from './probability.js'
import { attachStrict, attachAtPoint } from './attach-strict.js'
import { computeMaxf } from './maxf.js'
import { isLegal, checkWellFormed, interfacesEqual, createSCRef } from './types.js'
import type { Component, CFT, ComponentIndex, InterfaceMap, Interface } from './types.js'
import { InfeasibleError, CycleError, WellFormednessError, OpenFormulaError } from './errors.js'

export type RuleResult =
    | { ok: true; next: Component; next𝕀?: Set<string>; nextInterfaceMap?: InterfaceMap }
    | { ok: false; reason: string; definition: string }

function _hasOpenInputPort(formula: import('./bool-formula.js').BoolFormula, inputPortIds: string[]): boolean {
    if (!inputPortIds || inputPortIds.length === 0) return false
    const fv = BF.freeVars(formula)
    return inputPortIds.some(id => fv.has(id))
}

let _idCounter = 0
function _genId(): string {
    return `rule_${++_idCounter}`
}

function _buildNewSystem(system: Component, targetId: string, newComponent: Component): Component {
    if (system.id === targetId) return newComponent
    return {
        ...system,
        subcomponents: system.subcomponents.map(sc =>
            sc.id === targetId ? newComponent : _buildNewSystem(sc, targetId, newComponent)
        ),
    }
}

export function checkSubcomponentRule(
    system: Component,
    parentComponent: Component,
    childComponent: Component,
    componentIndex: ComponentIndex,
    probMap: Map<string, number>,
    iv: number,
    systemCft?: CFT,
    interfaceMap: InterfaceMap = new Map(),
    createId: (() => string) | undefined = undefined,
    attachmentPointId?: string,
): RuleResult {
    try {
        const childRefId = createId ? createId() : _genId()
        const scRef = createSCRef({
            id: childRefId,
            componentId: childComponent.id,
            inputs: [],
            outputs: childComponent.faultTree ? [...childComponent.faultTree.outputPorts] : [],
        })

        const parentCft = parentComponent.faultTree
        if (!parentCft) {
            return { ok: false, reason: 'Parent component has no fault tree', definition: 'Def. 24' }
        }
        const parentOutputPortId = parentCft.outputPorts[0]
        if (!parentOutputPortId) {
            return { ok: false, reason: 'Parent CFT has no output port', definition: 'Def. 24' }
        }

        const { cft: newParentCft, newInputId } = attachmentPointId
            ? attachAtPoint(parentCft, attachmentPointId, childRefId)
            : attachStrict(parentCft, parentOutputPortId, childRefId, createId)

        const newParentComp: Component = {
            ...parentComponent,
            faultTree: { ...newParentCft, subcomponentRefs: [...newParentCft.subcomponentRefs, scRef] },
        }
        const newIndex = new Map(componentIndex)
        newIndex.set(parentComponent.id, { component: newParentComp, cft: newParentComp.faultTree! })
        newIndex.set(childComponent.id, { component: childComponent, cft: childComponent.faultTree! })

        try {
            checkWellFormed(newParentComp.faultTree!)
            isLegal(newParentComp.faultTree!, newIndex, parentComponent.id)
        } catch (e) {
            return { ok: false, reason: (e as Error).message, definition: 'Def. 24' }
        }

        const effectiveSystemCft = parentComponent.id === system.id
            ? newParentComp.faultTree!
            : (systemCft ?? system.faultTree)
        if (!effectiveSystemCft) {
            return { ok: false, reason: 'System has no fault tree', definition: 'Def. 24' }
        }

        let maxfValue: number
        try {
            maxfValue = computeMaxf(effectiveSystemCft, newIndex, probMap, newInputId, iv, interfaceMap)
        } catch (e) {
            if (e instanceof InfeasibleError) {
                return { ok: false, reason: (e as Error).message, definition: 'Def. 24' }
            }
            throw e
        }

        const childCft = childComponent.faultTree
        if (!childCft) {
            return { ok: true, next: _buildNewSystem(system, parentComponent.id, newParentComp) }
        }

        const childFormulas = foldf(childCft, newIndex, { interfaceMap })
        const childOutPortId = childCft.outputPorts[0]
        if (!childOutPortId) {
            return { ok: true, next: _buildNewSystem(system, parentComponent.id, newParentComp) }
        }
        const childFormula = childFormulas.get(childOutPortId) ?? BF.const(false)

        if (_hasOpenInputPort(childFormula, childCft.inputPorts)) {
            return {
                ok: false,
                reason: 'Child component fault tree has open input ports — P(E_F) is undefined (Def. 19)',
                definition: 'Def. 24',
            }
        }

        let pChild: number
        try {
            pChild = probability(childFormula, probMap)
        } catch (e) {
            if (e instanceof OpenFormulaError) {
                return { ok: false, reason: `Missing probability for variable '${(e as OpenFormulaError).varId}'`, definition: 'Def. 24' }
            }
            throw e
        }

        if (pChild > maxfValue + 1e-12) {
            return {
                ok: false,
                reason: `P(E_F) = ${pChild.toExponential(6)} exceeds maxf = ${maxfValue.toExponential(6)} (Def. 24 soundness condition)`,
                definition: 'Def. 24',
            }
        }

        return { ok: true, next: _buildNewSystem(system, parentComponent.id, newParentComp) }
    } catch (e) {
        return { ok: false, reason: (e as Error).message, definition: 'Def. 24' }
    }
}

export function checkInterfaceRule(
    system: Component,
    requirer: Component,
    provider: Component,
    iface: Interface,
    componentIndex: ComponentIndex,
    probMap: Map<string, number>,
    iv: number,
    connections𝕀: Set<string> = new Set(),
    systemCft: CFT | null = null,
    interfaceMap: InterfaceMap = new Map(),
    createId: (() => string) | undefined = undefined,
    attachmentPointId?: string,
): RuleResult & { next𝕀?: Set<string>; nextInterfaceMap?: InterfaceMap } {
    const inProvided = provider.provided && provider.provided.some(pi => interfacesEqual(pi, iface))
    const inRequired = requirer.required && requirer.required.some(ri => interfacesEqual(ri, iface))

    if (!inProvided) {
        return { ok: false, reason: `Interface '${iface.name}' is not in provider.provided`, definition: 'Def. 25' }
    }
    if (!inRequired) {
        return { ok: false, reason: `Interface '${iface.name}' is not in requirer.required`, definition: 'Def. 25' }
    }

    const connKey = `${provider.id}|${requirer.id}|${iface.name}`
    if (connections𝕀.has(connKey)) {
        return {
            ok: false,
            reason: `Connection (${provider.name} → ${requirer.name} via '${iface.name}') already exists`,
            definition: 'Def. 25',
        }
    }

    const requirerCft = requirer.faultTree
    if (!requirerCft) {
        return { ok: false, reason: 'Requirer has no fault tree', definition: 'Def. 25' }
    }
    const requirerOutputPortId = requirerCft.outputPorts[0]
    if (!requirerOutputPortId) {
        return { ok: false, reason: 'Requirer CFT has no output port', definition: 'Def. 25' }
    }

    const newInputSlotId = createId ? createId() : _genId()
    const { cft: newRequirerCft, newInputId } = attachmentPointId
        ? attachAtPoint(requirerCft, attachmentPointId, newInputSlotId)
        : attachStrict(requirerCft, requirerOutputPortId, newInputSlotId, createId)

    const newRequirer: Component = { ...requirer, faultTree: newRequirerCft }
    const newIndex = new Map(componentIndex)
    newIndex.set(requirer.id, { component: newRequirer, cft: newRequirerCft })

    const providerCft = provider.faultTree
    const providerOutputPortId = providerCft?.outputPorts[0]
    const newInterfaceMap = new Map(interfaceMap)
    if (providerOutputPortId) {
        newInterfaceMap.set(newInputSlotId, {
            providerId: provider.id,
            outputPortId: providerOutputPortId,
        })
    }

    const effectiveSystemCft = requirer.id === system.id
        ? newRequirer.faultTree!
        : (systemCft ?? system.faultTree)
    if (!effectiveSystemCft) {
        return { ok: false, reason: 'System has no fault tree', definition: 'Def. 25' }
    }

    let maxfValue: number
    try {
        maxfValue = computeMaxf(effectiveSystemCft, newIndex, probMap, newInputId, iv, newInterfaceMap)
    } catch (e) {
        if (e instanceof InfeasibleError) {
            return { ok: false, reason: (e as Error).message, definition: 'Def. 25' }
        }
        throw e
    }

    if (providerCft && providerOutputPortId) {
        const providerFormulas = foldf(providerCft, newIndex, { interfaceMap: newInterfaceMap })
        const providerFormula = providerFormulas.get(providerOutputPortId) ?? BF.const(false)

        if (_hasOpenInputPort(providerFormula, providerCft.inputPorts)) {
            return {
                ok: false,
                reason: 'Provider fault tree has open input ports — P(E_F_provider) is undefined (Def. 19)',
                definition: 'Def. 25',
            }
        }

        let pProvider: number
        try {
            pProvider = probability(providerFormula, probMap)
        } catch (e) {
            if (e instanceof OpenFormulaError) {
                return { ok: false, reason: `Missing probability for '${(e as OpenFormulaError).varId}'`, definition: 'Def. 25' }
            }
            throw e
        }
        if (pProvider > maxfValue + 1e-12) {
            return {
                ok: false,
                reason: `P(E_F_provider) = ${pProvider.toExponential(6)} exceeds maxf = ${maxfValue.toExponential(6)} (Def. 25 soundness condition)`,
                definition: 'Def. 25',
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

export function checkFaultTreeRule(
    system: Component,
    component: Component,
    newCft: CFT,
    componentIndex: ComponentIndex,
    probMap: Map<string, number>,
    iv: number,
    systemCft: CFT | null = null,
    interfaceMap: InterfaceMap = new Map(),
    resolvedFormula?: import('./bool-formula.js').BoolFormula,
): RuleResult {
    try {
        checkWellFormed(newCft)
    } catch (e) {
        if (e instanceof WellFormednessError) {
            return { ok: false, reason: (e as Error).message, definition: 'Def. 26' }
        }
        throw e
    }

    const newIndex = new Map(componentIndex)
    newIndex.set(component.id, { component, cft: newCft })

    try {
        isLegal(newCft, newIndex, component.id)
    } catch (e) {
        if (e instanceof CycleError) {
            return { ok: false, reason: (e as Error).message, definition: 'Def. 26' }
        }
        throw e
    }

    let formulas: Map<string, import('./bool-formula.js').BoolFormula>
    try {
        formulas = foldf(newCft, newIndex, { interfaceMap })
    } catch (e) {
        return { ok: false, reason: (e as Error).message, definition: 'Def. 26' }
    }

    if (!resolvedFormula) {
        for (const [portId, formula] of formulas) {
            if (_hasOpenInputPort(formula, newCft.inputPorts)) {
                const openVars = newCft.inputPorts.filter(id => BF.freeVars(formula).has(id)).join(', ')
                return {
                    ok: false,
                    reason: `Output port '${portId}' has unresolved input-port variables (${openVars}) — Def. 26 requires all output formulas to be closed`,
                    definition: 'Def. 26',
                }
            }
        }
    }

    const effectiveSystemCft = systemCft ?? system.faultTree
    const primaryOutPortId = newCft.outputPorts[0]
    if (primaryOutPortId && effectiveSystemCft) {
        let maxfValue: number
        try {
            maxfValue = computeMaxf(effectiveSystemCft, newIndex, probMap, primaryOutPortId, iv, interfaceMap)
        } catch (e) {
            if (e instanceof InfeasibleError) {
                return { ok: false, reason: (e as Error).message, definition: 'Def. 26' }
            }
            if (e instanceof OpenFormulaError) {
                return {
                    ok: false,
                    reason: `Cannot compute maxf — a referenced component has no probability assigned yet (${(e as OpenFormulaError).varId}). Ensure all basic events have probabilities set.`,
                    definition: 'Def. 26',
                }
            }
            throw e
        }

        const effectiveFormula = resolvedFormula ?? formulas.get(primaryOutPortId) ?? BF.const(false)
        let pF: number
        try {
            pF = probability(effectiveFormula, probMap)
        } catch (e) {
            if (e instanceof OpenFormulaError) {
                return {
                    ok: false,
                    reason: `Missing probability for '${(e as OpenFormulaError).varId}' — ensure all basic events have entries in probMap`,
                    definition: 'Def. 26',
                }
            }
            throw e
        }

        if (pF > maxfValue + 1e-12) {
            return {
                ok: false,
                reason: `P(E_F*) = ${pF.toExponential(6)} exceeds maxf = ${maxfValue.toExponential(6)} (Def. 26 soundness condition)`,
                definition: 'Def. 26',
            }
        }
    }

    const newComponent: Component = { ...component, faultTree: newCft }
    return { ok: true, next: _buildNewSystem(system, component.id, newComponent) }
}
