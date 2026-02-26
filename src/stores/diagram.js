import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

export const useDiagramStore = defineStore('diagram', {
    state: () => ({
        components: [],       // { id, name, x, y, width, height, parentId }
        interfaces: [],       // { id, name, requiredComponentId, providedComponentId, waypoints: [{x, y}] }
        selectedId: null,
        selectedType: null,   // 'component' | 'interface'
    }),

    getters: {
        rootComponents: (state) => state.components.filter(c => !c.parentId),
        childrenOf: (state) => (parentId) => state.components.filter(c => c.parentId === parentId),
        interfacesOf: (state) => (componentId) => state.interfaces.filter(
            i => i.requiredComponentId === componentId || i.providedComponentId === componentId
        ),
        selectedComponent: (state) => state.components.find(c => c.id === state.selectedId),
        selectedInterface: (state) => state.interfaces.find(i => i.id === state.selectedId),
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

        addComponent(parentId = null, x = 200, y = 200) {
            const comp = {
                id: uuidv4(),
                name: 'Component',
                x,
                y,
                width: 180,
                height: 120,
                parentId,
                failureRate: 0,
                maxFailureRate: 0,
            }
            this.components.push(comp)
            this.selectItem(comp.id, 'component')
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

            // Create the child component
            const child = this.addComponent(parentId, childX, childY)
            // Use updateComponent for reactivity
            this.updateComponent(child.id, {
                name: 'SubComponent',
                width: 160,
                height: 100,
            })
            return child
        },

        updateComponent(id, updates) {
            const idx = this.components.findIndex(c => c.id === id)
            if (idx !== -1) {
                this.components[idx] = { ...this.components[idx], ...updates }
            }
        },

        removeComponent(id) {
            // Remove interfaces involving this component
            this.interfaces = this.interfaces.filter(
                i => i.requiredComponentId !== id && i.providedComponentId !== id
            )
            // Remove children
            const children = this.components.filter(c => c.parentId === id)
            children.forEach(c => this.removeComponent(c.id))
            // Remove component
            this.components = this.components.filter(c => c.id !== id)
            if (this.selectedId === id) this.deselect()
        },

        addInterface(componentId) {
            // Walk up to the root-level parent
            let rootId = componentId
            let comp = this.components.find(c => c.id === rootId)
            while (comp && comp.parentId) {
                rootId = comp.parentId
                comp = this.components.find(c => c.id === rootId)
            }
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
                waypoints: [], // [{x, y}] for line routing
            }
            this.interfaces.push(iface)
            this.selectItem(iface.id, 'interface')
            return iface
        },

        clearAll() {
            this.components = []
            this.interfaces = []
            this.deselect()
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
            this.interfaces = this.interfaces.filter(i => i.id !== id)
            if (this.selectedId === id) this.deselect()
        },

        saveDiagram() {
            const data = {
                version: 2,
                components: this.components,
                interfaces: this.interfaces,
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
                this.components = data.components || []
                this.interfaces = data.interfaces || []
                this.deselect()
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
