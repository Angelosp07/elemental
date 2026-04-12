export class JumpProcess {
  constructor(private jumpUp: number, private jumpDown: number) {}

  apply(price: number, event: number): number {
    if (event === 1) return price * (1 + this.jumpUp)
    if (event === -1) return price * (1 - this.jumpDown)
    return price
  }
}
