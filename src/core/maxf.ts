import { foldf } from './fold.js'
import { probability } from './probability.js'
import { BF } from './bool-formula.js'
import { InfeasibleError } from './errors.js'
import type { CFT, ComponentIndex, InterfaceMap } from './types.js'

const EPSILON = 1e-12

export function computeMaxf(
    systemCft: CFT,
    componentIndex: ComponentIndex,
    probMap: Map<string, number>,
    targetPortId: string,
    iv: number,
    interfaceMap: InterfaceMap = new Map(),
): number {
    const formulaMap = foldf(systemCft, componentIndex, {
        interfaceMap,
        interceptPortId: targetPortId,
    })

    const systemOutputPortId = systemCft.outputPorts[0]
    const B = formulaMap.get(systemOutputPortId ?? '') ?? BF.const(false)

    const B0 = BF.simplify(BF.substitute(B, '__x__', BF.const(false)))
    const B1 = BF.simplify(BF.substitute(B, '__x__', BF.const(true)))

    const P0 = probability(B0, probMap)
    const P1 = probability(B1, probMap)

    if (Math.abs(P1 - P0) < EPSILON) {
        return 1
    }

    if (iv < P0 - EPSILON) {
        throw new InfeasibleError(iv, P0)
    }

    const maxf = (iv - P0) / (P1 - P0)
    return Math.max(0, Math.min(1, maxf))
}
