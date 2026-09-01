import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { useCftStore, SYSTEM_CFT_KEY } from './cft.js'
import {
    BF,
    foldf,
    probability,
    computeMaxf,
    buildComponentIndex,
    buildProbMap,
    buildInterfaceMap,
    buildSystemComponent,
    translateCFT,
    checkFaultTreeRule,
    checkSubcomponentRule,
    checkInterfaceRule,
    createInterface,
    createComponent,
    createCFT,
    type CFT,
} from '../core/index.js'
import type {
    StoreCFT,
    StoreComponent,
    StoreInterface,
} from '../core/index.js'
import { InfeasibleError } from '../core/index.js'

interface DiagramComponent {
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
    parentId: string | null
}

interface DiagramInterface {
    id: string
    name: string
    requiredComponentId: string
    providedComponentId: string
    waypoints: { x: number; y: number }[]
}

function _providerIds(interfaces: DiagramInterface[]): Set<string> {
    return new Set(interfaces.map(i => i.providedComponentId))
}

function _rootComponentIds(components: DiagramComponent[], interfaces: DiagramInterface[]): string[] {
    const providers = _providerIds(interfaces)
    return components.filter(c => !c.parentId && !providers.has(c.id)).map(c => c.id)
}

function _translateSystemCft(storeCfts: Record<string, StoreCFT>): CFT {
    const storeSysCft = storeCfts[SYSTEM_CFT_KEY]
    if (storeSysCft) return translateCFT(storeSysCft, storeCfts)
    return createCFT({ outputPorts: ['__system_out__'] })
}

export const useDiagramStore = defineStore('diagram', {
    state: () => ({
        components: [] as DiagramComponent[],
        interfaces: [] as DiagramInterface[],
        selectedId: null as string | null,
        selectedType: null as string | null,
        iv: null as number | null,
        pendingComponentId: null as string | null,
    }),

    getters: {
        rootComponents: (state): DiagramComponent[] =>
            state.components.filter(c => !c.parentId),

        childrenOf: (state) => (parentId: string): DiagramComponent[] =>
            state.components.filter(c => c.parentId === parentId),

        interfacesOf: (state) => (componentId: string): DiagramInterface[] =>
            state.interfaces.filter(i =>
                i.requiredComponentId === componentId || i.providedComponentId === componentId
            ),

        selectedComponent: (state): DiagramComponent | undefined =>
            state.components.find(c => c.id === state.selectedId),

        selectedInterface: (state): DiagramInterface | undefined =>
            state.interfaces.find(i => i.id === state.selectedId),

        componentProbability: (state) => (componentId: string): number | null => {
            const cftStore = useCftStore()
            return cftStore.evaluateOutputProbability(componentId)
        },

        systemProbability(state): number | null {
            if (state.iv === null) return null
            const cftStore = useCftStore()
            const storeCfts = cftStore.cfts as Record<string, StoreCFT>
            const systemCft = _translateSystemCft(storeCfts)
            const componentIndex = buildComponentIndex(
                state.components as StoreComponent[],
                storeCfts,
                state.interfaces as StoreInterface[],
            )
            const probMap = buildProbMap(storeCfts)
            const interfaceMap = buildInterfaceMap(state.interfaces as StoreInterface[], storeCfts)
            let formulas: Map<string, ReturnType<typeof BF.const>>
            try {
                formulas = foldf(systemCft, componentIndex, { interfaceMap })
            } catch {
                return null
            }
            const outPortId = systemCft.outputPorts[0]
            if (!outPortId) return null
            const formula = formulas.get(outPortId) ?? BF.const(false)
            try {
                return probability(formula, probMap)
            } catch {
                return null
            }
        },

        slotMaxfMap(state): Record<string, number | null> {
            if (state.iv === null) return {}
            const cftStore = useCftStore()
            if (!cftStore.activeComponentId) return {}

            const storeCfts = cftStore.cfts as Record<string, StoreCFT>
            const systemCft = _translateSystemCft(storeCfts)
            const componentIndex = buildComponentIndex(
                state.components as StoreComponent[],
                storeCfts,
                state.interfaces as StoreInterface[],
            )
            const probMap = buildProbMap(storeCfts)
            const interfaceMap = buildInterfaceMap(state.interfaces as StoreInterface[], storeCfts)

            const activeCft = cftStore.cfts[cftStore.activeComponentId]
            if (!activeCft) return {}

            const iv = state.iv
            const tryMaxf = (id: string): number | null => {
                try {
                    return computeMaxf(systemCft, componentIndex, probMap, id, iv, interfaceMap)
                } catch (e) {
                    if (e instanceof InfeasibleError) return null
                    return null
                }
            }

            const result: Record<string, number | null> = {}
            for (const gate of (activeCft.gates ?? [])) result[gate.id] = tryMaxf(gate.id)
            for (const sc of (activeCft.subComponents ?? [])) result[sc.id] = tryMaxf(sc.id)
            for (const edge of (activeCft.edges ?? [])) {
                if (!(edge.sourceId in result)) result[edge.sourceId] = tryMaxf(edge.sourceId)
            }
            for (const node of (activeCft.nodes ?? [])) {
                if (node.type === 'outputPort' && !(node.id in result)) {
                    result[node.id] = tryMaxf(node.id)
                }
            }
            return result
        },

        pendingComponentMaxf(state): number | null {
            if (state.iv === null || !state.pendingComponentId) return null
            const cftStore = useCftStore()
            const cft = cftStore.cfts[state.pendingComponentId]
            if (!cft) return null
            const outPort = (cft as StoreCFT).nodes.find(n => n.type === 'outputPort')
            if (!outPort) return null
            const storeCfts = cftStore.cfts as Record<string, StoreCFT>
            const systemCft = _translateSystemCft(storeCfts)
            const componentIndex = buildComponentIndex(
                state.components as StoreComponent[],
                storeCfts,
                state.interfaces as StoreInterface[],
            )
            const probMap = buildProbMap(storeCfts)
            const interfaceMap = buildInterfaceMap(state.interfaces as StoreInterface[], storeCfts)
            try {
                return computeMaxf(systemCft, componentIndex, probMap, outPort.id, state.iv, interfaceMap)
            } catch {
                return null
            }
        },
    },

    actions: {
        selectItem(id: string, type: string) {
            this.selectedId = id
            this.selectedType = type
        },

        deselect() {
            this.selectedId = null
            this.selectedType = null
        },

        setIV(value: unknown) {
            if (value === null || value === '' || (typeof value === 'number' && isNaN(value))) {
                this.iv = null
            } else {
                this.iv = Math.min(1, Math.max(0, Number(value)))
            }
        },

        addComponent(parentId: string | null = null, x = 200, y = 200, promptUser = false): DiagramComponent {
            const comp: DiagramComponent = {
                id: uuidv4(),
                name: 'Component',
                x, y,
                width: 180,
                height: 120,
                parentId,
            }
            this.components.push(comp)
            this.selectItem(comp.id, 'component')
            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(comp.id)
            if (promptUser) this.pendingComponentId = comp.id
            return comp
        },

        addSubcomponent(parentId: string): DiagramComponent | undefined {
            const parent = this.components.find(c => c.id === parentId)
            if (!parent) return

            const PADDING = 20
            const HEADER = 50
            const MIN_PARENT_W = 400
            const MIN_PARENT_H = 300

            const newW = Math.max(parent.width, MIN_PARENT_W)
            const newH = Math.max(parent.height, MIN_PARENT_H)
            this.updateComponent(parentId, { width: newW, height: newH })

            const existingChildren = this.components.filter(c => c.parentId === parentId)
            const offset = existingChildren.length * 20
            const childX = parent.x + PADDING + offset
            const childY = parent.y + HEADER + PADDING + offset

            const child = this.addComponent(parentId, childX, childY)
            this.updateComponent(child.id, { name: 'SubComponent', width: 160, height: 100 })

            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(parentId)

            this.pendingComponentId = child.id
            return child
        },

        updateComponent(id: string, updates: Partial<DiagramComponent>) {
            const idx = this.components.findIndex(c => c.id === id)
            if (idx !== -1) {
                this.components[idx] = { ...this.components[idx], ...updates }
            }
        },

        removeComponent(id: string) {
            const comp = this.components.find(c => c.id === id)
            const parentId = comp?.parentId ?? null
            this.interfaces = this.interfaces.filter(
                i => i.requiredComponentId !== id && i.providedComponentId !== id
            )
            const children = this.components.filter(c => c.parentId === id)
            children.forEach(c => this.removeComponent(c.id))
            this.components = this.components.filter(c => c.id !== id)
            const cftStore = useCftStore()
            cftStore.removeCft(id)
            if (this.selectedId === id) this.deselect()
            if (parentId) cftStore.regenerateComponentCft(parentId)
        },

        addInterface(componentId: string): DiagramInterface {
            const parent = this.components.find(c => c.id === componentId)
            const providedComp = this.addComponent(
                null,
                parent ? parent.x + parent.width + 160 : 400,
                parent ? parent.y : 200,
            )
            providedComp.name = 'Provider'

            const iface: DiagramInterface = {
                id: uuidv4(),
                name: 'Interface',
                requiredComponentId: componentId,
                providedComponentId: providedComp.id,
                waypoints: [],
            }
            this.interfaces.push(iface)
            this.selectItem(iface.id, 'interface')

            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(componentId)

            return iface
        },

        updateInterface(id: string, updates: Partial<DiagramInterface>) {
            const idx = this.interfaces.findIndex(i => i.id === id)
            if (idx !== -1) this.interfaces[idx] = { ...this.interfaces[idx], ...updates }
        },

        addWaypoint(ifaceId: string, index: number, x: number, y: number) {
            const iface = this.interfaces.find(i => i.id === ifaceId)
            if (!iface) return
            if (!iface.waypoints) iface.waypoints = []
            iface.waypoints.splice(index, 0, { x, y })
        },

        updateWaypoint(ifaceId: string, index: number, x: number, y: number) {
            const iface = this.interfaces.find(i => i.id === ifaceId)
            if (!iface?.waypoints?.[index]) return
            iface.waypoints[index] = { x, y }
        },

        removeWaypoint(ifaceId: string, index: number) {
            const iface = this.interfaces.find(i => i.id === ifaceId)
            if (!iface?.waypoints) return
            iface.waypoints.splice(index, 1)
        },

        removeInterface(id: string) {
            const iface = this.interfaces.find(i => i.id === id)
            const requirerId = iface?.requiredComponentId
            this.interfaces = this.interfaces.filter(i => i.id !== id)
            if (this.selectedId === id) this.deselect()
            const cftStore = useCftStore()
            if (requirerId) cftStore.regenerateComponentCft(requirerId)
        },

        clearAll() {
            this.components = []
            this.interfaces = []
            this.iv = null
            this.pendingComponentId = null
            const cftStore = useCftStore()
            cftStore.cfts = {}
            if (cftStore.activeComponentId) cftStore.closeCft()
            this.deselect()
        },

        _buildSystemContext() {
            const cftStore = useCftStore()
            const storeCfts = cftStore.cfts as Record<string, StoreCFT>
            const providerIds = _providerIds(this.interfaces)
            const rootIds = _rootComponentIds(this.components, this.interfaces)
            const systemCft = _translateSystemCft(storeCfts)
            return {
                cftStore,
                storeCfts,
                systemCft,
                componentIndex: buildComponentIndex(
                    this.components as StoreComponent[],
                    storeCfts,
                    this.interfaces as StoreInterface[],
                ),
                probMap: buildProbMap(storeCfts),
                interfaceMap: buildInterfaceMap(
                    this.interfaces as StoreInterface[],
                    storeCfts,
                ),
                systemComponent: buildSystemComponent(
                    rootIds,
                    this.components as StoreComponent[],
                    storeCfts,
                    this.interfaces as StoreInterface[],
                    this.iv ?? 0,
                    systemCft,
                ),
            }
        },

        checkCanApplySubcomponentRule(
            parentId: string | null,
            attachmentPointId?: string,
        ): { ok: boolean; reason?: string; definition?: string } {
            if (this.iv === null) {
                return { ok: false, reason: 'No Initial Value (IV) set — cannot check rule soundness.', definition: 'Def. 24' }
            }
            const isSystemParent = parentId === null
            const { systemCft, componentIndex, probMap, interfaceMap, systemComponent } = this._buildSystemContext()
            const parentComponent = isSystemParent
                ? systemComponent
                : componentIndex.get(parentId!)?.component
            if (!parentComponent) {
                return { ok: false, reason: 'Could not look up parent component in index.', definition: 'Def. 24' }
            }
            const childId = uuidv4()
            const childOutPortId = uuidv4()
            const emptyChildCft = createCFT({ outputPorts: [childOutPortId] })
            const emptyChild = createComponent({ id: childId, name: 'Component', faultTree: emptyChildCft })
            const augmentedIndex = new Map(componentIndex)
            augmentedIndex.set(childId, { component: emptyChild, cft: emptyChildCft })
            const result = checkSubcomponentRule(
                systemComponent,
                parentComponent,
                emptyChild,
                augmentedIndex,
                probMap,
                this.iv,
                systemCft,
                interfaceMap,
                () => uuidv4(),
                attachmentPointId,
            )
            return result.ok ? { ok: true } : { ok: false, reason: result.reason, definition: result.definition }
        },

        checkCanApplyInterfaceRule(
            requirerId: string,
            providerId: string | null,
            attachmentPointId?: string,
        ): { ok: boolean; reason?: string; definition?: string } {
            if (this.iv === null) {
                return { ok: false, reason: 'No Initial Value (IV) set — cannot check rule soundness.', definition: 'Def. 25' }
            }
            const { systemCft, componentIndex, probMap, interfaceMap, systemComponent } = this._buildSystemContext()
            const requirerEntry = componentIndex.get(requirerId)
            if (!requirerEntry) {
                return { ok: false, reason: 'Could not look up requirer component in index.', definition: 'Def. 25' }
            }
            let providerComponent: ReturnType<typeof createComponent>
            const checkIndex = new Map(componentIndex)
            if (providerId) {
                const entry = componentIndex.get(providerId)
                if (!entry) return { ok: false, reason: 'Could not look up provider component in index.', definition: 'Def. 25' }
                providerComponent = entry.component
            } else {
                const emptyProvCft = createCFT({ outputPorts: [uuidv4()] })
                providerComponent = createComponent({ id: uuidv4(), name: 'Provider', faultTree: emptyProvCft })
                checkIndex.set(providerComponent.id, { component: providerComponent, cft: emptyProvCft })
            }
            const iface = createInterface({ name: 'Interface' })
            const augmentedRequirer = { ...requirerEntry.component, required: [...(requirerEntry.component.required ?? []), iface] }
            const augmentedProvider = { ...providerComponent, provided: [...(providerComponent.provided ?? []), iface] }
            const result = checkInterfaceRule(
                systemComponent,
                augmentedRequirer,
                augmentedProvider,
                iface,
                checkIndex,
                probMap,
                this.iv,
                new Set(),
                systemCft,
                interfaceMap,
                () => uuidv4(),
                attachmentPointId,
            )
            return result.ok ? { ok: true } : { ok: false, reason: result.reason, definition: result.definition }
        },

        applySubcomponentRule(
            parentId: string | null,
            attachmentPointId?: string,
        ): { ok: boolean; reason?: string; definition?: string } {
            if (this.iv === null) {
                return { ok: false, reason: 'No Initial Value (IV) set — cannot check rule soundness.', definition: 'Def. 24' }
            }

            const isSystemParent = parentId === null

            const { cftStore, systemCft, componentIndex, probMap, interfaceMap, systemComponent } = this._buildSystemContext()

            const parentComponent = isSystemParent
                ? systemComponent
                : componentIndex.get(parentId!)?.component
            if (!parentComponent) {
                return { ok: false, reason: 'Could not look up parent component in index.', definition: 'Def. 24' }
            }

            const childId = uuidv4()
            const childOutPortId = uuidv4()
            const emptyChildCft = createCFT({ outputPorts: [childOutPortId] })
            const emptyChild = createComponent({ id: childId, name: 'Component', faultTree: emptyChildCft })
            const augmentedIndex = new Map(componentIndex)
            augmentedIndex.set(childId, { component: emptyChild, cft: emptyChildCft })

            const result = checkSubcomponentRule(
                systemComponent,
                parentComponent,
                emptyChild,
                augmentedIndex,
                probMap,
                this.iv,
                systemCft,
                interfaceMap,
                () => uuidv4(),
                attachmentPointId,
            )

            if (!result.ok) {
                return { ok: false, reason: result.reason, definition: result.definition }
            }

            const parent = parentId ? this.components.find(c => c.id === parentId) : null
            const childX = parent ? parent.x + 20 : Math.round((200 + Math.random() * 100) / 10) * 10
            const childY = parent ? parent.y + 60 : Math.round((200 + Math.random() * 100) / 10) * 10
            const child = this.addComponent(parentId, childX, childY)

            if (isSystemParent) {
                if (attachmentPointId) {
                    cftStore.attachChildAtPoint('__system__', child.id, child.name, attachmentPointId)
                } else {
                    cftStore.regenerateSystemCft()
                }
            } else {
                if (attachmentPointId) {
                    cftStore.attachChildAtPoint(parentId!, child.id, child.name, attachmentPointId)
                } else {
                    cftStore.regenerateComponentCft(parentId!)
                }
            }
            this.pendingComponentId = child.id
            return { ok: true }
        },

        applyInterfaceRule(
            requirerId: string,
            providerId: string,
            attachmentPointId?: string,
        ): { ok: boolean; reason?: string; definition?: string } {
            if (this.iv === null) {
                return { ok: false, reason: 'No Initial Value (IV) set — cannot check rule soundness.', definition: 'Def. 25' }
            }

            const { cftStore, systemCft, componentIndex, probMap, interfaceMap, systemComponent } = this._buildSystemContext()

            const requirerEntry = componentIndex.get(requirerId)
            const providerEntry = componentIndex.get(providerId)
            if (!requirerEntry || !providerEntry) {
                return { ok: false, reason: 'Could not look up component in index.', definition: 'Def. 25' }
            }

            const iface = createInterface({ name: 'Interface' })
            const augmentedRequirer = {
                ...requirerEntry.component,
                required: [...(requirerEntry.component.required ?? []), iface],
            }
            const augmentedProvider = {
                ...providerEntry.component,
                provided: [...(providerEntry.component.provided ?? []), iface],
            }

            const result = checkInterfaceRule(
                systemComponent,
                augmentedRequirer,
                augmentedProvider,
                iface,
                componentIndex,
                probMap,
                this.iv,
                new Set(),
                systemCft,
                interfaceMap,
                () => uuidv4(),
                attachmentPointId,
            )

            if (!result.ok) {
                return { ok: false, reason: result.reason, definition: result.definition }
            }

            const newIface: DiagramInterface = {
                id: uuidv4(),
                name: 'Interface',
                requiredComponentId: requirerId,
                providedComponentId: providerId,
                waypoints: [],
            }
            this.interfaces.push(newIface)
            this.selectItem(newIface.id, 'interface')

            if (attachmentPointId) {
                cftStore.attachChildAtPoint(requirerId, providerId, providerEntry.component.name, attachmentPointId)
            } else {
                cftStore.regenerateComponentCft(requirerId)
            }
            return { ok: true }
        },

        verifyDiagram(): { valid: boolean; errors: string[]; systemProbability: number | null } {
            const cftStore = useCftStore()
            const errors: string[] = []

            if (this.iv === null) {
                errors.push('No Initial Value (IV) set. Cannot verify system admissibility (Def. 18).')
                return { valid: false, errors, systemProbability: null }
            }

            const rootIds = _rootComponentIds(this.components, this.interfaces)
            const storeCfts = cftStore.cfts as Record<string, StoreCFT>
            const systemCft = _translateSystemCft(storeCfts)
            const componentIndex = buildComponentIndex(
                this.components as StoreComponent[],
                storeCfts,
                this.interfaces as StoreInterface[],
            )
            const probMap = buildProbMap(storeCfts)
            const interfaceMap = buildInterfaceMap(this.interfaces as StoreInterface[], storeCfts)
            const systemComponent = buildSystemComponent(
                rootIds,
                this.components as StoreComponent[],
                storeCfts,
                this.interfaces as StoreInterface[],
                this.iv,
                systemCft,
            )

            for (const comp of this.components) {
                const entry = componentIndex.get(comp.id)
                if (!entry) continue
                const result = checkFaultTreeRule(
                    systemComponent,
                    entry.component,
                    entry.cft,
                    componentIndex,
                    probMap,
                    this.iv,
                    systemCft,
                    interfaceMap,
                )
                if (!result.ok) {
                    errors.push(`Component "${comp.name}": ${result.reason}`)
                }
            }

            let systemProbability: number | null = null
            try {
                const formulas = foldf(systemCft, componentIndex, { interfaceMap })
                const outPortId = systemCft.outputPorts[0]
                if (outPortId) {
                    const formula = formulas.get(outPortId) ?? BF.const(false)
                    systemProbability = probability(formula, probMap)
                    if (systemProbability > this.iv + 1e-12) {
                        errors.push(
                            `System P(E_F) = ${systemProbability.toExponential(6)} exceeds IV = ${this.iv} (Def. 18).`
                        )
                    }
                }
            } catch {
                errors.push('Could not evaluate system failure probability — some event probabilities may be missing.')
            }

            return { valid: errors.length === 0, errors, systemProbability }
        },

        saveDiagram() {
            const cftStore = useCftStore()
            const data = {
                version: 6,
                iv: this.iv,
                components: this.components,
                interfaces: this.interfaces,
                cfts: cftStore.cfts,
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'diagram.json'
            a.click()
            URL.revokeObjectURL(url)
        },

        loadDiagram(jsonText: string) {
            try {
                const data = JSON.parse(jsonText)
                this.components = (data.components ?? []).map((c: Record<string, unknown>) => {
                    const { failureRate, intrinsicFailureRate, maxFailureRate, customMaxf, ...rest } = c
                    void failureRate; void intrinsicFailureRate; void maxFailureRate; void customMaxf
                    return rest as DiagramComponent
                })
                this.interfaces = data.interfaces ?? []
                this.iv = data.iv ?? data.maxFailureProbability ?? null
                const cftStore = useCftStore()
                cftStore.cfts = data.cfts ?? {}
                this.deselect()
                cftStore.regenerateAllStrictCfts()
            } catch (e) {
                console.error('Failed to load diagram:', e)
            }
        },

        exportPlantUML(): string {
            const lines = ['@startuml', '']
            const renderComponent = (comp: DiagramComponent, indent = '') => {
                const children = this.components.filter(c => c.parentId === comp.id)
                const alias = comp.id.replace(/-/g, '_')
                if (children.length > 0) {
                    lines.push(`${indent}component "${comp.name}" as ${alias} {`)
                    children.forEach(child => renderComponent(child, indent + '  '))
                    lines.push(`${indent}}`)
                } else {
                    lines.push(`${indent}component "${comp.name}" as ${alias}`)
                }
            }
            this.rootComponents.forEach(c => renderComponent(c))
            lines.push('')
            this.interfaces.forEach(iface => {
                const reqId = iface.requiredComponentId.replace(/-/g, '_')
                const provId = iface.providedComponentId.replace(/-/g, '_')
                lines.push(`${reqId} #--( ${provId} : "${iface.name}"`)
            })
            lines.push('')
            lines.push('@enduml')
            return lines.join('\n')
        },
    },
})
