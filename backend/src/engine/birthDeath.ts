export class BirthDeathProcess {
  constructor(private lambdaBirth: number, private lambdaDeath: number) {}

  step(dt: number): number {
    if (Math.random() < this.lambdaBirth * dt) return 1
    if (Math.random() < this.lambdaDeath * dt) return -1
    return 0
  }
}
