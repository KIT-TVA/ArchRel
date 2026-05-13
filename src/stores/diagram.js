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

        allComponentMaxf(state) {
            if (state.maxFailureProbability === null) return {}

            const result = {}
            const providerIds = new Set(state.interfaces.map(i => i.providedComponentId))
            const roots = state.components.filter(c => !c.parentId && !providerIds.has(c.id))

            if (roots.length === 0) return {}

            const rootMaxf = 1 - Math.pow(1 - state.maxFailureProbability, 1 / roots.length)

            const allocateDown = (componentId, maxf) => {
                const comp = state.components.find(c => c.id === componentId)
                const effectiveMaxf = (comp?.customMaxf != null) ? Math.min(comp.customMaxf, maxf) : maxf

                if (result[componentId] === undefined) {
                    result[componentId] = effectiveMaxf
                } else {
                    result[componentId] = Math.min(result[componentId], effectiveMaxf)
                }

                const children = state.components.filter(c => c.parentId === componentId)
                const providers = state.interfaces
                    .filter(i => i.requiredComponentId === componentId)
                    .map(i => state.components.find(c => c.id === i.providedComponentId))
                    .filter(Boolean)

                const allDeps = [...children, ...providers]
                // +1 for intrinsic failure event (never has a custom override)
                const totalInputs = allDeps.length + 1
                if (totalInputs <= 1) return

                const customDeps = allDeps.filter(d => d.customMaxf != null)
                const nonCustomDeps = allDeps.filter(d => d.customMaxf == null)
                const nonCustomCount = nonCustomDeps.length + 1 // +1 for intrinsic

                const customProduct = customDeps.reduce((acc, d) => acc * (1 - d.customMaxf), 1)
                const remainingProduct = (1 - effectiveMaxf) / customProduct

                if (remainingProduct <= 0 || remainingProduct >= 1) {
                    const fallback = remainingProduct <= 0 ? 1 : 0
                    nonCustomDeps.forEach(d => allocateDown(d.id, fallback))
                } else {
                    const defaultChildMaxf = 1 - Math.pow(remainingProduct, 1 / nonCustomCount)
                    nonCustomDeps.forEach(d => allocateDown(d.id, defaultChildMaxf))
                }
                customDeps.forEach(d => allocateDown(d.id, d.customMaxf))
            }

            roots.forEach(root => allocateDown(root.id, rootMaxf))

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
            let rootId = componentId
            let comp = this.components.find(c => c.id === rootId)
            const parent = comp
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
                requiredComponentId: rootId,
                providedComponentId: providedComp.id,
                waypoints: [],
            }
            this.interfaces.push(iface)
            this.selectItem(iface.id, 'interface')

            // Regenerate requirer's CFT (now includes provider as dependency)
            // and system CFT (provider is excluded from system level)
            const cftStore = useCftStore()
            cftStore.regenerateComponentCft(rootId)
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
            // Sync all failureRates from CFTs before checking
            const cftStoreRef = useCftStore()
            this.components.forEach(comp => cftStoreRef.validateAgainstComponent(comp.id))

            const errors = []
            console.log('=== Diagram Verification Started ===')
            console.log(`Total Components: ${this.components.length}`)
            console.log('')

            this.components.forEach(comp => {
                console.log(`Verifying Component: "${comp.name}" (id: ${comp.id})`)
                console.log(`  Failure Rate: ${comp.failureRate}`)

                const children = this.components.filter(c => c.parentId === comp.id)
                console.log(`  Children Count: ${children.length}`)

                if (children.length > 0) {
                    children.forEach(child => {
                        console.log(`    - Child "${child.name}": failureRate=${child.failureRate}`)
                    })
                }

                const childFailureRate = 1 - children.reduce((mul, c) => mul * (1 - c.failureRate), 1)
                console.log(`  Combined Child Failure Rate: ${childFailureRate}`)

                /*PART A of system validity definition*/
                if (comp.failureRate < childFailureRate) {
                    const msg = `Component "${comp.name}" has failure rate (${comp.failureRate}) less than combined child failure rate (${childFailureRate}).`
                    errors.push(msg)
                    console.log(` PART A FAILED: ${msg}`)
                } else {
                    console.log(` PART A PASSED: failureRate >= childFailureRate`)
                }

                console.log('================================')
            })

            /*PART B: system failure probability vs maxf(S)*/
            const systemCft = cftStoreRef.cfts[SYSTEM_CFT_KEY]
            let systemFailureProbability = null
            if (systemCft) {
                const outPort = systemCft.nodes.find(n => n.type === 'outputPort')
                if (outPort) {
                    systemFailureProbability = cftStoreRef.evaluateProbability(SYSTEM_CFT_KEY, outPort.id, 0)
                    console.log(`System Failure Probability: ${systemFailureProbability}`)
                    if (this.maxFailureProbability !== null && systemFailureProbability > this.maxFailureProbability) {
                        const msg = `System failure probability (${systemFailureProbability.toFixed(6)}) exceeds maxf(S) = ${this.maxFailureProbability}.`
                        errors.push(msg)
                        console.log(` PART B FAILED: ${msg}`)
                    } else {
                        console.log(` PART B PASSED`)
                    }
                }
            }

            console.log('=== Verification Summary ===')
            if (errors.length > 0) {
                console.log(`Diagram Verification Failed (${errors.length} errors):\n` + errors.join('\n'))
            } else {
                console.log('Diagram is valid!')
            }

            return {
                valid: errors.length === 0,
                errors,
                systemFailureProbability,
            }
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
