/**
 * SignificanceTester - Statistical significance testing
 * Implements t-test, chi-square, and Bayesian analysis
 */

import type { SignificanceResult, TestType } from './types.js';

/**
 * Sample data for significance testing
 */
export interface SampleData {
  mean: number;
  variance: number;
  sampleSize: number;
}

/**
 * Proportion data for chi-square test
 */
export interface ProportionData {
  successes: number;
  total: number;
}

export class SignificanceTester {
  /**
   * Perform significance test between control and treatment
   */
  test(
    control: SampleData,
    treatment: SampleData,
    confidenceLevel: number,
    testType: TestType = 't-test',
  ): SignificanceResult {
    switch (testType) {
      case 't-test':
        return this.tTest(control, treatment, confidenceLevel);
      case 'chi-square':
        return this.chiSquareTest(control, treatment, confidenceLevel);
      case 'bayesian':
        return this.bayesianTest(control, treatment, confidenceLevel);
      default:
        throw new Error(`Unsupported test type: ${testType}`);
    }
  }

  /**
   * Two-sample t-test for continuous metrics
   * Tests if means are significantly different
   */
  tTest(control: SampleData, treatment: SampleData, confidenceLevel: number): SignificanceResult {
    const { mean: mean1, variance: var1, sampleSize: n1 } = control;
    const { mean: mean2, variance: var2, sampleSize: n2 } = treatment;

    // Calculate pooled standard error
    const pooledSE = Math.sqrt(var1 / n1 + var2 / n2);

    // Calculate t-statistic
    const tStatistic = (mean2 - mean1) / pooledSE;

    // Degrees of freedom (Welch-Satterthwaite equation)
    const df = Math.pow(var1 / n1 + var2 / n2, 2) / (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));

    // Calculate p-value (two-tailed)
    const pValue = this.tTestPValue(Math.abs(tStatistic), df);

    // Calculate effect size (Cohen's d)
    const pooledSD = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
    const effectSize = (mean2 - mean1) / pooledSD;

    // Determine if significant
    const alpha = 1 - confidenceLevel;
    const isSignificant = pValue < alpha;

    // Calculate power and required sample size
    const powerAnalysis = this.calculatePower(control, treatment, confidenceLevel);

    return {
      testType: 't-test',
      pValue,
      isSignificant,
      confidenceLevel,
      effectSize,
      powerAnalysis,
      metadata: {
        tStatistic,
        degreesOfFreedom: df,
        pooledStandardError: pooledSE,
      },
    };
  }

  /**
   * Chi-square test for proportions
   * Tests if proportions are significantly different
   */
  chiSquareTest(
    control: SampleData,
    treatment: SampleData,
    confidenceLevel: number,
  ): SignificanceResult {
    // For proportions, mean is the proportion and variance can be calculated
    const p1 = control.mean;
    const p2 = treatment.mean;
    const n1 = control.sampleSize;
    const n2 = treatment.sampleSize;

    // Pooled proportion
    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);

    // Standard error
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

    // Z-statistic
    const zStatistic = (p2 - p1) / se;

    // Calculate p-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zStatistic)));

    // Effect size (relative risk or odds ratio)
    const effectSize = p2 - p1; // Absolute difference for proportions

    // Determine if significant
    const alpha = 1 - confidenceLevel;
    const isSignificant = pValue < alpha;

    // Power analysis
    const powerAnalysis = this.calculatePower(control, treatment, confidenceLevel);

    return {
      testType: 'chi-square',
      pValue,
      isSignificant,
      confidenceLevel,
      effectSize,
      powerAnalysis,
      metadata: {
        zStatistic,
        pooledProportion: pooledP,
        standardError: se,
      },
    };
  }

  /**
   * Bayesian A/B test using Beta-Binomial model
   */
  bayesianTest(
    control: SampleData,
    treatment: SampleData,
    confidenceLevel: number,
  ): SignificanceResult {
    // Use Beta priors (uniform: alpha=1, beta=1)
    const priorAlpha = 1;
    const priorBeta = 1;

    // Calculate posterior parameters
    const controlSuccesses = control.mean * control.sampleSize;
    const treatmentSuccesses = treatment.mean * treatment.sampleSize;

    const controlAlpha = priorAlpha + controlSuccesses;
    const controlBeta = priorBeta + (control.sampleSize - controlSuccesses);

    const treatmentAlpha = priorAlpha + treatmentSuccesses;
    const treatmentBeta = priorBeta + (treatment.sampleSize - treatmentSuccesses);

    // Calculate probability that treatment > control
    // Using Monte Carlo approximation
    const probabilityBetter = this.monteCarloComparison(
      { alpha: controlAlpha, beta: controlBeta },
      { alpha: treatmentAlpha, beta: treatmentBeta },
      10000,
    );

    // Effect size (expected difference)
    const controlMean = controlAlpha / (controlAlpha + controlBeta);
    const treatmentMean = treatmentAlpha / (treatmentAlpha + treatmentBeta);
    const effectSize = treatmentMean - controlMean;

    // For Bayesian, we use probability threshold instead of p-value
    const isSignificant = probabilityBetter > confidenceLevel;
    const pValue = 1 - probabilityBetter;

    return {
      testType: 'bayesian',
      pValue,
      isSignificant,
      confidenceLevel,
      effectSize,
      metadata: {
        probabilityTreatmentBetter: probabilityBetter,
        controlPosterior: { alpha: controlAlpha, beta: controlBeta },
        treatmentPosterior: { alpha: treatmentAlpha, beta: treatmentBeta },
      },
    };
  }

  /**
   * Calculate statistical power
   */
  private calculatePower(
    control: SampleData,
    treatment: SampleData,
    confidenceLevel: number,
  ): SignificanceResult['powerAnalysis'] {
    const effectSize = Math.abs((treatment.mean - control.mean) / Math.sqrt(control.variance));
    const alpha = 1 - confidenceLevel;

    // Simplified power calculation
    // For accurate power, would need non-central t-distribution
    const zAlpha = this.normalInverseCDF(1 - alpha / 2);
    const zBeta = effectSize * Math.sqrt(control.sampleSize / 2) - zAlpha;
    const power = this.normalCDF(zBeta);

    // Required sample size for 80% power
    const requiredN = Math.ceil((2 * Math.pow(zAlpha + 1.28, 2)) / Math.pow(effectSize, 2));

    return {
      power: Math.max(0, Math.min(1, power)),
      requiredSampleSize: requiredN,
    };
  }

  /**
   * Calculate t-test p-value
   * Approximation for two-tailed test
   */
  private tTestPValue(tStat: number, df: number): number {
    // For large df (> 30), t-distribution approximates normal
    if (df > 30) {
      return 2 * (1 - this.normalCDF(tStat));
    }

    // For smaller df, use approximation
    // This is a simplified approximation; for production, use a proper t-distribution library
    const x = df / (df + tStat * tStat);
    const pValue = this.incompleteBeta(df / 2, 0.5, x);

    return Math.min(1, Math.max(0, pValue));
  }

  /**
   * Standard normal cumulative distribution function
   */
  private normalCDF(z: number): number {
    // Approximation using error function
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

    return z > 0 ? 1 - p : p;
  }

  /**
   * Inverse normal CDF (quantile function)
   */
  private normalInverseCDF(p: number): number {
    // Rational approximation
    if (p <= 0 || p >= 1) {
      throw new Error('p must be between 0 and 1');
    }

    const c = [2.515517, 0.802853, 0.010328];
    const d = [1.432788, 0.189269, 0.001308];

    const q = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(q));

    const numerator = c[0] + t * (c[1] + t * c[2]);
    const denominator = 1 + t * (d[0] + t * (d[1] + t * d[2]));

    const result = t - numerator / denominator;

    return p < 0.5 ? -result : result;
  }

  /**
   * Incomplete beta function (approximation)
   */
  private incompleteBeta(a: number, b: number, x: number): number {
    if (x === 0) return 0;
    if (x === 1) return 1;

    // Simplified approximation
    // For production, use a proper implementation
    const lnBeta = this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b);

    // Use series expansion for small x
    if (x < (a + 1) / (a + b + 2)) {
      let sum = 0;
      let term = 1;
      for (let i = 0; i < 100; i++) {
        term *= ((a + b + i) / (a + i + 1)) * x;
        sum += term;
        if (Math.abs(term) < 1e-10) break;
      }
      return Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) * sum / a;
    } else {
      return 1 - this.incompleteBeta(b, a, 1 - x);
    }
  }

  /**
   * Log gamma function (approximation)
   */
  private logGamma(x: number): number {
    // Stirling's approximation
    if (x <= 0) throw new Error('x must be positive');

    const coef = [
      76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
      0.001208650973866179, -0.000005395239384953,
    ];

    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);

    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      ser += coef[j] / ++y;
    }

    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }

  /**
   * Monte Carlo comparison of two beta distributions
   */
  private monteCarloComparison(
    control: { alpha: number; beta: number },
    treatment: { alpha: number; beta: number },
    samples: number,
  ): number {
    let treatmentWins = 0;

    for (let i = 0; i < samples; i++) {
      const controlSample = this.betaSample(control.alpha, control.beta);
      const treatmentSample = this.betaSample(treatment.alpha, treatment.beta);

      if (treatmentSample > controlSample) {
        treatmentWins++;
      }
    }

    return treatmentWins / samples;
  }

  /**
   * Sample from Beta distribution
   */
  private betaSample(alpha: number, beta: number): number {
    // Use gamma distribution relationship: Beta(α,β) = Gamma(α)/(Gamma(α)+Gamma(β))
    const x = this.gammaSample(alpha, 1);
    const y = this.gammaSample(beta, 1);
    return x / (x + y);
  }

  /**
   * Sample from Gamma distribution
   */
  private gammaSample(shape: number, scale: number): number {
    // Marsaglia and Tsang's method
    if (shape < 1) {
      return this.gammaSample(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        x = this.normalSample();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return scale * d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return scale * d * v;
      }
    }
  }

  /**
   * Sample from standard normal distribution
   */
  private normalSample(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
