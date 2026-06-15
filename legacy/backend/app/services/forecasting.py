"""Forecasting + anomaly detection.

Forecasts a numeric series via statsmodels SARIMAX (simple non-seasonal
ARIMA-style by default; the model picks reasonable orders for short series).
Returns mean projections plus 80% / 95% confidence bands.

Anomaly detection uses scikit-learn IsolationForest as a robust outlier
flagger that works on small samples.

Both functions operate on Python lists so they're decoupled from the cell
storage — callers pull the column values out of the sheet first.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Iterable

import numpy as np
from sklearn.ensemble import IsolationForest
from statsmodels.tsa.statespace.sarimax import SARIMAX


@dataclass
class ForecastPoint:
    index: int            # 0-based offset from the last known datapoint
    mean: float
    lower_80: float
    upper_80: float
    lower_95: float
    upper_95: float


@dataclass
class ForecastResult:
    history: list[float]
    forecast: list[ForecastPoint]
    order: tuple[int, int, int]
    fit_aic: float


@dataclass
class AnomalyPoint:
    index: int
    value: float
    score: float
    is_outlier: bool


def _coerce_series(values: Iterable) -> list[float]:
    out: list[float] = []
    for v in values:
        if v is None or v == "":
            continue
        try:
            out.append(float(v))
        except (TypeError, ValueError):
            continue
    return out


def _pick_order(n: int) -> tuple[int, int, int]:
    """Heuristic SARIMAX order based on series length."""
    if n < 10:
        return (1, 0, 0)
    if n < 30:
        return (1, 1, 0)
    return (1, 1, 1)


def forecast_series(values: Iterable, periods: int = 12) -> ForecastResult:
    """Fit a SARIMAX model and project `periods` steps forward."""
    history = _coerce_series(values)
    if len(history) < 3:
        raise ValueError("Need at least 3 numeric points to forecast")
    if periods < 1 or periods > 365:
        raise ValueError("periods must be between 1 and 365")

    order = _pick_order(len(history))
    series = np.asarray(history, dtype=float)

    with warnings.catch_warnings():
        # statsmodels emits a lot of convergence noise on short series — fine
        # for v1 demos; we surface AIC in the response so the user can spot
        # bad fits.
        warnings.simplefilter("ignore")
        model = SARIMAX(series, order=order, enforce_stationarity=False, enforce_invertibility=False)
        fitted = model.fit(disp=False)

    pred = fitted.get_forecast(steps=periods)
    means = pred.predicted_mean
    ci80 = pred.conf_int(alpha=0.2)
    ci95 = pred.conf_int(alpha=0.05)

    forecast: list[ForecastPoint] = []
    for i in range(periods):
        forecast.append(
            ForecastPoint(
                index=i,
                mean=float(means[i]),
                lower_80=float(ci80[i, 0]),
                upper_80=float(ci80[i, 1]),
                lower_95=float(ci95[i, 0]),
                upper_95=float(ci95[i, 1]),
            )
        )
    return ForecastResult(
        history=history,
        forecast=forecast,
        order=order,
        fit_aic=float(fitted.aic),
    )


def _detrend(values: np.ndarray) -> np.ndarray:
    """Subtract a linear fit so IsolationForest sees deviations from trend,
    not the trend itself (otherwise a growing series flags its endpoints)."""
    n = len(values)
    if n < 3:
        return values - values.mean()
    x = np.arange(n, dtype=float)
    slope, intercept = np.polyfit(x, values, 1)
    return values - (slope * x + intercept)


def detect_anomalies(values: Iterable, contamination: float = 0.1) -> list[AnomalyPoint]:
    """IsolationForest outlier detection on a 1-D numeric series.

    The series is linearly detrended before fitting so a growing or shrinking
    column flags real spikes/dips rather than its first/last values.
    """
    raw: list[tuple[int, float]] = []
    for idx, v in enumerate(values):
        if v is None or v == "":
            continue
        try:
            raw.append((idx, float(v)))
        except (TypeError, ValueError):
            continue
    if len(raw) < 4:
        raise ValueError("Need at least 4 numeric points to detect anomalies")
    if not 0 < contamination < 0.5:
        raise ValueError("contamination must be in (0, 0.5)")

    original = np.array([v for _, v in raw], dtype=float)
    residuals = _detrend(original).reshape(-1, 1)
    model = IsolationForest(
        contamination=contamination,
        random_state=42,
        n_estimators=100,
    )
    model.fit(residuals)
    scores = model.score_samples(residuals)
    preds = model.predict(residuals)  # -1 = outlier, 1 = inlier

    out: list[AnomalyPoint] = []
    for (orig_idx, value), score, label in zip(raw, scores, preds):
        out.append(
            AnomalyPoint(
                index=orig_idx,
                value=value,
                score=float(score),
                is_outlier=bool(label == -1),
            )
        )
    return out
