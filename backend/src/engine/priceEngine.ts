import { BrownianMotion } from './brownian'
import { BirthDeathProcess } from './birthDeath'
import { JumpProcess } from './jumpProcess'

export class PriceEngine {
  private price: number

  constructor(
    initialPrice: number,
    private brownian: BrownianMotion,
    private birthDeath: BirthDeathProcess,
    private jump: JumpProcess,
  ) {
    this.price = initialPrice
  }

  step(dt: number): number {
    const diffusion = this.brownian.step(dt)
    let newPrice = this.price * Math.exp(diffusion)
    const event = this.birthDeath.step(dt)
    newPrice = this.jump.apply(newPrice, event)
    this.price = Math.max(newPrice, 0.01)
    return this.price
  }

  getPrice(): number {
    return this.price
  }
}
