export class BrownianMotion {
  constructor(private mu: number, private sigma: number) {}

  step(dt: number): number {
    const z = this.randomNormal()
    return (this.mu - 0.5 * this.sigma ** 2) * dt + this.sigma * Math.sqrt(dt) * z
  }

  private randomNormal(): number {
    let u = 0, v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  }
}
