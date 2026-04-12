export interface AssetConfig {
  symbol: string
  initialPrice: number
  mu: number
  sigma: number
  lambdaBirth: number
  lambdaDeath: number
  jumpUp: number
  jumpDown: number
}

export const ASSET_CONFIGS: AssetConfig[] = [
  { symbol: 'GERM',   initialPrice: 1556,  mu: 0.00,  sigma: 0.012, lambdaBirth: 0.08, lambdaDeath: 0.08, jumpUp: 0.015, jumpDown: 0.015 },
  { symbol: 'GALL',   initialPrice: 288,   mu: 0.00,  sigma: 0.014, lambdaBirth: 0.10, lambdaDeath: 0.10, jumpUp: 0.018, jumpDown: 0.018 },
  { symbol: 'TANT',   initialPrice: 155,   mu: 0.00,  sigma: 0.010, lambdaBirth: 0.07, lambdaDeath: 0.07, jumpUp: 0.012, jumpDown: 0.012 },
  { symbol: 'DYOX',   initialPrice: 371,   mu: 0.00,  sigma: 0.013, lambdaBirth: 0.09, lambdaDeath: 0.09, jumpUp: 0.016, jumpDown: 0.016 },
  { symbol: 'PROX',   initialPrice: 102,   mu: 0.00,  sigma: 0.011, lambdaBirth: 0.08, lambdaDeath: 0.08, jumpUp: 0.014, jumpDown: 0.014 },
  { symbol: 'NDOX',   initialPrice: 92,    mu: 0.00,  sigma: 0.011, lambdaBirth: 0.08, lambdaDeath: 0.08, jumpUp: 0.014, jumpDown: 0.014 },
  { symbol: 'COBM',   initialPrice: 40,    mu: 0.00,  sigma: 0.012, lambdaBirth: 0.09, lambdaDeath: 0.09, jumpUp: 0.015, jumpDown: 0.015 },
  { symbol: 'LI2CO3', initialPrice: 20,    mu: 0.00,  sigma: 0.015, lambdaBirth: 0.10, lambdaDeath: 0.10, jumpUp: 0.020, jumpDown: 0.020 },
  { symbol: 'NIBQ',   initialPrice: 20,    mu: 0.00,  sigma: 0.010, lambdaBirth: 0.07, lambdaDeath: 0.07, jumpUp: 0.012, jumpDown: 0.012 },
  { symbol: 'MNSO4',  initialPrice: 1.7,   mu: 0.00,  sigma: 0.013, lambdaBirth: 0.09, lambdaDeath: 0.09, jumpUp: 0.016, jumpDown: 0.016 },
  { symbol: 'GRPH',   initialPrice: 6.9,   mu: 0.00,  sigma: 0.011, lambdaBirth: 0.08, lambdaDeath: 0.08, jumpUp: 0.013, jumpDown: 0.013 },
  { symbol: 'CUCA',   initialPrice: 4.2,   mu: 0.00,  sigma: 0.010, lambdaBirth: 0.07, lambdaDeath: 0.07, jumpUp: 0.012, jumpDown: 0.012 },
  { symbol: 'AL99',   initialPrice: 2.3,   mu: 0.00,  sigma: 0.009, lambdaBirth: 0.06, lambdaDeath: 0.06, jumpUp: 0.010, jumpDown: 0.010 },
  { symbol: 'SN99',   initialPrice: 31,    mu: 0.00,  sigma: 0.010, lambdaBirth: 0.07, lambdaDeath: 0.07, jumpUp: 0.012, jumpDown: 0.012 },
  { symbol: 'SIMG',   initialPrice: 2.2,   mu: 0.00,  sigma: 0.010, lambdaBirth: 0.07, lambdaDeath: 0.07, jumpUp: 0.012, jumpDown: 0.012 },
]
