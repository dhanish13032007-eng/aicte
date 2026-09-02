"""Risk Engine — Combines multiple signals into a unified Risk Score (0–100)"""
import numpy as np
from typing import Dict, Optional
from app.generators.data_generator import PARAM_CONFIG

# Risk thresholds
PASS_THRESHOLD = 40
REVIEW_THRESHOLD = 70

# Risk component weights (sum to 1.0)
WEIGHTS = {
    "anomaly": 0.30,
    "drift": 0.25,
    "spec_margin": 0.15,
    "prediction_risk": 0.15,
    "noise": 0.07,
    "lot_deviation": 0.08,
}


def _calculate_drift_score(measurements: Dict) -> float:
    """Calculate drift score 0–100 from measurement trajectory."""
    drift_scores = []
    for param, cfg in PARAM_CONFIG.items():
        v0 = measurements.get(f"{param}_0h")
        v96 = measurements.get(f"{param}_96h")
        if v0 is None or v96 is None:
            continue
        nominal = cfg["nominal"]
        if abs(nominal) < 1e-9:
            continue
        drift_pct = abs(v96 - v0) / abs(nominal)
        # Scale: 10% drift = 100 score
        drift_scores.append(min(100, drift_pct * 10 * 100))
    return np.mean(drift_scores) if drift_scores else 0.0


def _calculate_spec_margin_score(measurements: Dict) -> float:
    """
    Score 0–100 based on how close values are to spec limits.
    100 = at limit, 0 = at center of spec.
    """
    margin_scores = []
    for param, cfg in PARAM_CONFIG.items():
        v96 = measurements.get(f"{param}_96h")
        if v96 is None:
            continue
        spec_range = cfg["spec_max"] - cfg["spec_min"]
        if spec_range < 1e-9:
            continue
        center = (cfg["spec_max"] + cfg["spec_min"]) / 2
        half_range = spec_range / 2
        distance_from_center = abs(v96 - center) / half_range
        # 0 = center, 1 = at limit (or beyond)
        margin_scores.append(min(100, distance_from_center * 100))
    return np.mean(margin_scores) if margin_scores else 0.0


def _calculate_noise_score(measurements: Dict) -> float:
    """Estimate noise from measurement variability across checkpoints."""
    noise_scores = []
    for param, cfg in PARAM_CONFIG.items():
        v0 = measurements.get(f"{param}_0h")
        v24 = measurements.get(f"{param}_24h")
        v96 = measurements.get(f"{param}_96h")
        if None in [v0, v24, v96]:
            continue
        nominal = cfg["nominal"]
        values = [v0, v24, v96]
        # Compare residuals from linear trend
        slope = (v96 - v0) / 96
        expected_24 = v0 + slope * 24
        residual = abs(v24 - expected_24) / (abs(nominal) + 1e-9)
        noise_scores.append(min(100, residual * 500))
    return np.mean(noise_scores) if noise_scores else 0.0


def _calculate_lot_deviation_score(measurements: Dict, lot_stats: Optional[Dict] = None) -> float:
    """Score based on deviation from lot median."""
    if lot_stats is None:
        return 0.0
    dev_scores = []
    for param in PARAM_CONFIG:
        v96 = measurements.get(f"{param}_96h")
        lot_median = lot_stats.get(f"{param}_median")
        lot_mad = lot_stats.get(f"{param}_mad")
        if None in [v96, lot_median, lot_mad] or lot_mad < 1e-9:
            continue
        z = abs(v96 - lot_median) / lot_mad
        dev_scores.append(min(100, z * 25))  # 4 MADs = 100 score
    return np.mean(dev_scores) if dev_scores else 0.0


def _calculate_prediction_risk_score(
    predicted_168h: Optional[float],
    confidence_lower: Optional[float],
    confidence_upper: Optional[float],
    param: str = "power_consumption",
) -> float:
    """
    Score based on predicted 168h value relative to spec limits.
    Higher score = predicted value closer to or beyond spec limits.
    """
    if predicted_168h is None:
        return 0.0
    cfg = PARAM_CONFIG.get(param, PARAM_CONFIG["power_consumption"])
    spec_range = cfg["spec_max"] - cfg["spec_min"]
    center = (cfg["spec_max"] + cfg["spec_min"]) / 2
    half_range = spec_range / 2
    distance = abs(predicted_168h - center) / (half_range + 1e-9)
    base_score = min(100, distance * 100)

    # Add uncertainty bonus if confidence interval wide
    if confidence_lower is not None and confidence_upper is not None:
        uncertainty = (confidence_upper - confidence_lower) / (spec_range + 1e-9)
        base_score = min(100, base_score + uncertainty * 20)

    return base_score


def calculate_risk(
    measurements: Dict,
    anomaly_score: float = 0.0,
    predicted_168h: Optional[float] = None,
    confidence_lower: Optional[float] = None,
    confidence_upper: Optional[float] = None,
    lot_stats: Optional[Dict] = None,
    custom_weights: Optional[Dict] = None,
) -> Dict:
    """
    Calculate unified risk score (0–100) and decision (PASS/REVIEW/REJECT).

    Args:
        measurements: dict with keys like 'voltage_0h', 'voltage_24h', ...
        anomaly_score: 0–100 from Isolation Forest
        predicted_168h: predicted value at 168h
        confidence_lower/upper: prediction confidence interval
        lot_stats: dict with median/MAD per parameter for lot context
        custom_weights: override default weights

    Returns:
        dict with risk_score, decision, component scores, explanation
    """
    weights = custom_weights or WEIGHTS

    drift_score = _calculate_drift_score(measurements)
    spec_score = _calculate_spec_margin_score(measurements)
    noise_score = _calculate_noise_score(measurements)
    lot_dev_score = _calculate_lot_deviation_score(measurements, lot_stats)
    pred_risk_score = _calculate_prediction_risk_score(
        predicted_168h, confidence_lower, confidence_upper
    )

    # Weighted sum
    risk_score = (
        weights["anomaly"] * anomaly_score
        + weights["drift"] * drift_score
        + weights["spec_margin"] * spec_score
        + weights["prediction_risk"] * pred_risk_score
        + weights["noise"] * noise_score
        + weights["lot_deviation"] * lot_dev_score
    )
    risk_score = min(100, max(0, risk_score))

    # Decision
    if risk_score < PASS_THRESHOLD:
        decision = "PASS"
    elif risk_score < REVIEW_THRESHOLD:
        decision = "REVIEW"
    else:
        decision = "REJECT"

    # Dominant factor
    components = {
        "anomaly": round(anomaly_score, 1),
        "drift": round(drift_score, 1),
        "spec_margin": round(spec_score, 1),
        "prediction_risk": round(pred_risk_score, 1),
        "noise": round(noise_score, 1),
        "lot_deviation": round(lot_dev_score, 1),
    }
    dominant = max(components, key=lambda k: components[k] * weights.get(k, 0))

    return {
        "risk_score": round(risk_score, 1),
        "decision": decision,
        "components": components,
        "dominant_factor": dominant,
        "weights_used": weights,
    }


def get_risk_thresholds():
    return {"pass": PASS_THRESHOLD, "review": REVIEW_THRESHOLD}
