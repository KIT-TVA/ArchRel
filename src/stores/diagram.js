import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { useCftStore, SYSTEM_CFT_KEY } from './cft.js'

export const useDiagramStore = defineStore('diagram', {
    state: () => ({
        components: [],       // { id, name, x, y, width, height, parentId, failureRate, intrinsicFailureRate }
        interfaces: [],       // { id, name, requiredComponentId, providedComponentId, waypoints: [{x, y}] }
        selectedId: null,
        selectedType: null,   // 'component' | 'interface'
        maxFailureProbability: null, // system-level max failure, float 0-1 or null
        pendingComponentId: null,    // set after creation to trigger the name/failure-rate dialog
    }),

    getters: {
        rootComponents: (state) => state.components.filter(c => !c.parentId),
        childrenOf: (state) => (parentId) => state.components.filter(c => c.parentId === parentId),
        interfacesOf: (state) => (componentId) => state.interfaces.filter(
            i => i.requiredComponentId === componentId || i.providedComponentId === componentId
        ),
        selectedComponent: (state) => state.components.find(c => c.id === state.selectedId),
        selectedInterface: (state) => state.interfaces.find(i => i.id === state.selectedId),

        /**
         * Cofactor-based maxf for any component.
         * Finds the component as a subcomponent reference in the system or parent CFT,
         * computes P0/P1 via Shannon cofactors, and respects any customMaxf cap.
         * Returns a function (componentId) => number|null so Vue tracks dependencies.
         */
        componentCofactorMaxf(state) {
            if (state.maxFailureProbability === null) return () => null
            const cftStore = useCftStore()
            const systemCft = cftStore.cfts[SYSTEM_CFT_KEY]
            if (!systemCft) return () => null
            const sysOutPort = systemCft.nodes.find(n => n.type === 'outputPort')
            if (!sysOutPort) return () => null

            const iv = state.maxFailureProbability
            const computeCofactor = (scId) => {
                const p0 = cftStore.evaluateProbability(SYSTEM_CFT_KEY, sysOutPort.id, 0, [], { [scId]: 0 })
                const p1 = cftStore.evaluateProbability(SYSTEM_CFT_KEY, sysOutPort.id, 0, [], { [scId]: 1 })
                if (Math.abs(p1 - p0) < 1e-12) return null
                if (iv < p0 - 1e-12) return null
                const natural = (iv - p0) / (p1 - p0)
                // Natural > 1 means element is unconstrained (other elements already satisfy budget)
                if (natural > 1 + 1e-10) return null
                return Math.max(0, natural)
            }

            return (componentId) => {
                let cofactorResult = null

                const sysSc = systemCft.subComponents.find(sc => sc.refComponentId === componentId)
                if (sysSc) {
                    cofactorResult = computeCofactor(sysSc.id)
                } else {
                    const comp = state.components.find(c => c.id === componentId)
                    if (comp?.parentId) {
                        const parentCft = cftStore.cfts[comp.parentId]
                        const parentSc = parentCft?.subComponents.find(sc => sc.refComponentId === componentId)
                        if (parentSc) cofactorResult = computeCofactor(parentSc.id)
                    }
                }

                if (cofactorResult === null) return null
                const comp = state.components.find(c => c.id === componentId)
                if (comp?.customMaxf != null) return Math.min(comp.customMaxf, cofactorResult)
                return cofactorResult
            }
        },

        /**
         * Maxf map for the currently active CFT, keyed by element ID at the OUTPUT side.
         * Keys: gate.id (gate output), sc.id (subcomponent output), event/inputPort node IDs.
         * Values: cofactor-based maxf (null if infeasible or no budget set).
         */
        slotMaxfMap(state) {
            if (state.maxFailureProbability === null) return {}
            const cftStore = useCftStore()
            if (!cftStore.activeComponentId) return {}
            const systemCft = cftStore.cfts[SYSTEM_CFT_KEY]
            if (!systemCft) return {}
            const sysOutPort = systemCft.nodes.find(n => n.type === 'outputPort')
            if (!sysOutPort) return {}

            const iv = state.maxFailureProbability
            const computeMaxf = (elementId) => {
                const p0 = cftStore.evaluateProbability(SYSTEM_CFT_KEY, sysOutPort.id, 0, [], { [elementId]: 0 })
                const p1 = cftStore.evaluateProbability(SYSTEM_CFT_KEY, sysOutPort.id, 0, [], { [elementId]: 1 })
                if (Math.abs(p1 - p0) < 1e-12) return null
                if (iv < p0 - 1e-12) return null
                const natural = (iv - p0) / (p1 - p0)
                if (natural > 1 + 1e-10) return null
                return Math.max(0, natural)
            }

            const activeCft = cftStore.cfts[cftStore.activeComponentId]
            if (!activeCft) return {}

            const result = {}
            for (const gate of (activeCft.gates ?? [])) {
                result[gate.id] = computeMaxf(gate.id)
            }
            for (const sc of (activeCft.subComponents ?? [])) {
                result[sc.id] = computeMaxf(sc.id)
            }
            // For edge sources not already covered (events, input ports), key by source element ID
            for (const edge of (activeCft.edges ?? [])) {
                if (!(edge.sourceId in result)) {
                    result[edge.sourceId] = computeMaxf(edge.sourceId)
                }
            }
            return result
        },
    },

    actions: {
        selectItem(id, type) {
            this.selectedId = id
            this.selectedType = type
        },

        deselect() {
            this.selectedId = null
            this.selectedType = null
        },

        setMaxFailureProbability(value) {
            if (value === null || value === '' || isNaN(value)) {
                this.maxFailureProbability = null
            } else {
                this.maxFailureProbability = Math.min(1, Math.max(0, Number(value)))
            }
        },

        addComponent(parentId = null, x = 200, y = 200, promptUser = false) {
            const comp = {
                id: uuidv4(),
                name: 'Component',
                x,
                y,
                width: 180,
                height: 120,
                parentId,
                failureRate: 0,
                intrinsicFailureRate: 0,
            }
            this.components.push(comp)
            this.selectItem(comp.id, 'component')
            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(comp.id)
            if (!parentId) {
                cftStore.regenerateSystemCft()
            }
            if (promptUser) this.pendingComponentId = comp.id
            return comp
        },

        addSubcomponent(parentId) {
            const parent = this.components.find(c => c.id === parentId)
            if (!parent) return

            const PADDING = 20
            const HEADER = 50
            const MIN_PARENT_W = 400
            const MIN_PARENT_H = 300

            // Enlarge parent if needed
            const newW = Math.max(parent.width, MIN_PARENT_W)
            const newH = Math.max(parent.height, MIN_PARENT_H)
            this.updateComponent(parentId, { width: newW, height: newH })

            // Find existing children to offset the new one
            const existingChildren = this.components.filter(c => c.parentId === parentId)
            const offset = existingChildren.length * 20
            const childX = parent.x + PADDING + offset
            const childY = parent.y + HEADER + PADDING + offset

            // Create the child component (addComponent already calls regenerateSystemCft for null parentId,
            // but we pass parentId here so we must handle system regeneration manually)
            const child = this.addComponent(parentId, childX, childY)
            this.updateComponent(child.id, {
                name: 'SubComponent',
                width: 160,
                height: 100,
            })

            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(parentId)
            cftStore.regenerateSystemCft()

            this.pendingComponentId = child.id
            return child
        },

        updateComponent(id, updates) {
            const idx = this.components.findIndex(c => c.id === id)
            if (idx !== -1) {
                this.components[idx] = { ...this.components[idx], ...updates }
                // When intrinsicFailureRate changes, rebuild the auto subtree and sync failureRate
                if ('intrinsicFailureRate' in updates) {
                    const cftStore = useCftStore()
                    cftStore.regenerateComponentCft(id)
                    cftStore.validateAgainstComponent(id)
                }
            }
        },

        removeComponent(id) {
            const comp = this.components.find(c => c.id === id)
            const parentId = comp?.parentId ?? null
            // Remove interfaces involving this component
            this.interfaces = this.interfaces.filter(
                i => i.requiredComponentId !== id && i.providedComponentId !== id
            )
            // Remove children
            const children = this.components.filter(c => c.parentId === id)
            children.forEach(c => this.removeComponent(c.id))
            // Remove component
            this.components = this.components.filter(c => c.id !== id)
            // Clean up associated CFT data
            const cftStore = useCftStore()
            cftStore.removeCft(id)
            if (this.selectedId === id) this.deselect()
            // Regenerate CFTs after removal
            if (parentId) {
                cftStore.regenerateComponentCft(parentId)
            }
            cftStore.regenerateSystemCft()
        },

        addInterface(componentId) {
            const parent = this.components.find(c => c.id === componentId)
            // Create a new provided component to the right
            const providedComp = this.addComponent(
                null,
                parent ? parent.x + parent.width + 160 : 400,
                parent ? parent.y : 200
            )
            providedComp.name = 'Provider'

            const iface = {
                id: uuidv4(),
                name: 'Interface',
                requiredComponentId: componentId,
                providedComponentId: providedComp.id,
                waypoints: [],
            }
            this.interfaces.push(iface)
            this.selectItem(iface.id, 'interface')

            // Regenerate requirer's CFT (now includes provider as dependency)
            // and system CFT (provider is excluded from system level)
            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(componentId)
            cftStore.regenerateSystemCft()

            return iface
        },

        clearAll() {
            this.components = []
            this.interfaces = []
            this.maxFailureProbability = null
            this.pendingComponentId = null
            const cftStore = useCftStore()
            cftStore.cfts = {}
            if (cftStore.activeComponentId) cftStore.closeCft()
            this.deselect()
        },

        verifyDiagram() {
            const cftStoreRef = useCftStore()
            this.components.forEach(comp => cftStoreRef.validateAgainstComponent(comp.id))

            const errors = []

            // Part A: each component's failure rate must be >= combined child failure rate
            this.components.forEach(comp => {
                const children = this.components.filter(c => c.parentId === comp.id)
                const childFailureRate = 1 - children.reduce((mul, c) => mul * (1 - c.failureRate), 1)
                if (comp.failureRate < childFailureRate) {
                    errors.push(
                        `Component "${comp.name}" has failure rate (${comp.failureRate.toExponential(3)}) ` +
                        `less than combined child failure rate (${childFailureRate.toExponential(3)}).`
                    )
                }
            })

            // Part B: system failure probability must not exceed maxf(S)
            const systemCft = cftStoreRef.cfts[SYSTEM_CFT_KEY]
            let systemFailureProbability = null
            if (systemCft) {
                const outPort = systemCft.nodes.find(n => n.type === 'outputPort')
                if (outPort) {
                    systemFailureProbability = cftStoreRef.evaluateProbability(SYSTEM_CFT_KEY, outPort.id, 0)
                    if (this.maxFailureProbability !== null && systemFailureProbability > this.maxFailureProbability) {
                        errors.push(
                            `System failure probability (${systemFailureProbability.toFixed(6)}) exceeds maxf(S) = ${this.maxFailureProbability}.`
                        )
                    }
                }
            }

            return { valid: errors.length === 0, errors, systemFailureProbability }
        },

        updateInterface(id, updates) {
            const idx = this.interfaces.findIndex(i => i.id === id)
            if (idx !== -1) {
                this.interfaces[idx] = { ...this.interfaces[idx], ...updates }
            }
        },

        addWaypoint(ifaceId, index, x, y) {
            const iface = this.interfaces.find(i => i.id === ifaceId)
            if (!iface) return
            if (!iface.waypoints) iface.waypoints = []
            iface.waypoints.splice(index, 0, { x, y })
        },

        updateWaypoint(ifaceId, index, x, y) {
            const iface = this.interfaces.find(i => i.id === ifaceId)
            if (!iface || !iface.waypoints || !iface.waypoints[index]) return
            iface.waypoints[index] = { x, y }
        },

        removeWaypoint(ifaceId, index) {
            const iface = this.interfaces.find(i => i.id === ifaceId)
            if (!iface || !iface.waypoints) return
            iface.waypoints.splice(index, 1)
        },

        removeInterface(id) {
            const iface = this.interfaces.find(i => i.id === id)
            const requirerId = iface?.requiredComponentId
            this.interfaces = this.interfaces.filter(i => i.id !== id)
            if (this.selectedId === id) this.deselect()
            // Regenerate requirer's CFT (provider no longer a dependency) + system CFT
            const cftStore = useCftStore()
            if (requirerId) cftStore.regenerateComponentCft(requirerId)
            cftStore.regenerateSystemCft()
        },

        saveDiagram() {
            const data = {
                version: 5,
                maxFailureProbability: this.maxFailureProbability,
                components: this.components,
                interfaces: this.interfaces,
                cfts: useCftStore().cfts,
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'diagram.json'
            a.click()
            URL.revokeObjectURL(url)
        },

        loadDiagram(jsonText) {
            try {
                const data = JSON.parse(jsonText)
                this.components = (data.components || []).map(c => {
                    const { maxFailureRate, ...rest } = c
                    return { intrinsicFailureRate: 0, ...rest }
                })
                this.interfaces = data.interfaces || []
                this.maxFailureProbability = data.maxFailureProbability ?? null
                const cftStore = useCftStore()
                cftStore.cfts = data.cfts || {}
                this.deselect()
                cftStore.regenerateAllStrictCfts()
            } catch (e) {
                console.error('Failed to load diagram:', e)
            }
        },

        exportPlantUML() {
            const lines = ['@startuml', '']
            const renderComponent = (comp, indent = '') => {
                const children = this.components.filter(c => c.parentId === comp.id)
                if (children.length > 0) {
                    lines.push(`${indent}component "${comp.name}" as ${comp.id.replace(/-/g, '_')} {`)
                    children.forEach(child => renderComponent(child, indent + '  '))
                    lines.push(`${indent}}`)
                } else {
                    lines.push(`${indent}component "${comp.name}" as ${comp.id.replace(/-/g, '_')}`)
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
