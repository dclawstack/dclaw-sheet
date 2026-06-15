/**
 * Lightweight, dependency-free forecasting for serverless. Linear-trend regression
 * with optional additive seasonality; confidence bands from in-sample residual std
 * widened with the horizon. Not SARIMAX, but honest, fast, and good enough for the
 * FP&A demo. Anomaly detection = linear detrend then flag residual z-scores.
 */

export interface ForecastPoint {
  i: number;
  yhat: number;
  lo80: number;
  hi80: number;
  lo95: number;
  hi95: number;
}
export interface ForecastResult {
  history: { i: number; y: number }[];
  forecast: ForecastPoint[];
  method: string;
}

function linreg(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const xs = y.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (y[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

export function forecast(series: number[], periods: number, seasonLength = 0): ForecastResult {
  const y = series.filter((v) => Number.isFinite(v));
  const n = y.length;
  const history = y.map((v, i) => ({ i, y: v }));
  if (n < 3) {
    const last = y[n - 1] ?? 0;
    return {
      history,
      method: "insufficient-data (flat)",
      forecast: Array.from({ length: periods }, (_, k) => ({
        i: n + k,
        yhat: last,
        lo80: last,
        hi80: last,
        lo95: last,
        hi95: last,
      })),
    };
  }

  const { slope, intercept } = linreg(y);
  const trend = (i: number) => intercept + slope * i;

  // additive seasonality
  let seasonal = (i: number) => 0;
  if (seasonLength >= 2 && n >= seasonLength * 2) {
    const sums = new Array(seasonLength).fill(0);
    const counts = new Array(seasonLength).fill(0);
    for (let i = 0; i < n; i++) {
      const resid = y[i] - trend(i);
      sums[i % seasonLength] += resid;
      counts[i % seasonLength]++;
    }
    const idx = sums.map((s, k) => (counts[k] ? s / counts[k] : 0));
    seasonal = (i: number) => idx[i % seasonLength];
  }

  const residuals = y.map((v, i) => v - (trend(i) + seasonal(i)));
  const variance = residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2);
  const sd = Math.sqrt(variance);

  const fc: ForecastPoint[] = [];
  for (let k = 0; k < periods; k++) {
    const i = n + k;
    const yhat = trend(i) + seasonal(i);
    const widen = Math.sqrt(1 + (k + 1) / Math.max(1, n)); // grows with horizon
    const e80 = 1.282 * sd * widen;
    const e95 = 1.96 * sd * widen;
    fc.push({ i, yhat, lo80: yhat - e80, hi80: yhat + e80, lo95: yhat - e95, hi95: yhat + e95 });
  }

  return {
    history,
    forecast: fc,
    method: seasonLength >= 2 ? `linear+seasonal(${seasonLength})` : "linear-trend",
  };
}

export interface Anomaly {
  i: number;
  value: number;
  expected: number;
  z: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Robust anomaly detection: linear-detrend, then score residuals by a median/MAD
 * z-score (modified z). MAD resists the outlier-masking that mean/std suffers when
 * a single large spike inflates the std and hides itself.
 */
export function anomalies(series: number[], threshold = 3.5): Anomaly[] {
  const y = series.filter((v) => Number.isFinite(v));
  const n = y.length;
  if (n < 4) return [];
  const { slope, intercept } = linreg(y);
  const resid = y.map((v, i) => v - (intercept + slope * i));
  const med = median(resid);
  const mad = median(resid.map((r) => Math.abs(r - med)));
  if (mad === 0) return [];
  const out: Anomaly[] = [];
  for (let i = 0; i < n; i++) {
    const z = (0.6745 * (resid[i] - med)) / mad; // modified z-score
    if (Math.abs(z) >= threshold) out.push({ i, value: y[i], expected: intercept + slope * i, z });
  }
  return out;
}
