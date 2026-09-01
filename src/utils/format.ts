export function formatProb(p: number): string {
    if (p === 0) return '0'
    if (Math.abs(p) < 0.0001) return p.toExponential(2)
    return p.toFixed(4)
}
