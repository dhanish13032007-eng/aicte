"""Synthetic Data Generator for ReliaSentry
Generates realistic electronic component burn-in test data using mathematical behaviour models.
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field

# Parameter nominal values and spec limits
PARAM_CONFIG = {
    "voltage": {"nominal": 3.3, "spec_min": 3.0, "spec_max": 3.6, "unit": "V"},
    "current": {"nominal": 100.0, "spec_min": 80.0, "spec_max": 130.0, "unit": "mA"},
    "resistance": {"nominal": 1000.0, "spec_min": 900.0, "spec_max": 1100.0, "unit": "Ω"},
    "leakage_current": {"nominal": 5.0, "spec_min": 0.0, "spec_max": 15.0, "unit": "µA"},
    "power_consumption": {"nominal": 330.0, "spec_min": 240.0, "spec_max": 430.0, "unit": "mW"},
    "temperature": {"nominal": 45.0, "spec_min": 30.0, "spec_max": 85.0, "unit": "°C"},
    "frequency": {"nominal": 100.0, "spec_min": 95.0, "spec_max": 105.0, "unit": "MHz"},
    "noise": {"nominal": 2.0, "spec_min": 0.0, "spec_max": 8.0, "unit": "mV"},
}

CHECKPOINTS = [0, 24, 96, 168]
BEHAVIOR_TYPES = [
    "Healthy", "GradualDrift", "AcceleratingDrift",
    "SuddenSpike", "Noisy", "Borderline", "Multivariate"
]


def _rng(seed: Optional[int] = None) -> np.random.Generator:
    return np.random.default_rng(seed)


def _generate_single_parameter_trajectory(
    param: str,
    behavior: str,
    rng: np.random.Generator,
    lot_bias: float = 0.0,
) -> Dict[int, float]:
    """Generate measurements at 0h, 24h, 96h, 168h for one parameter."""
    cfg = PARAM_CONFIG[param]
    nominal = cfg["nominal"] + lot_bias * cfg["nominal"] * 0.03
    natural_noise = cfg["nominal"] * 0.005  # 0.5% natural variation

    checkpoints = CHECKPOINTS
    values = {}

    if behavior == "Healthy":
        for cp in checkpoints:
            values[cp] = nominal + rng.normal(0, natural_noise)

    elif behavior == "GradualDrift":
        drift_rate = rng.uniform(0.003, 0.007)  # 0.3–0.7% per 10h
        direction = rng.choice([-1, 1])
        for cp in checkpoints:
            drift = direction * drift_rate * cp * nominal / 10
            values[cp] = nominal + drift + rng.normal(0, natural_noise)

    elif behavior == "AcceleratingDrift":
        k = rng.uniform(0.0001, 0.0004)
        direction = rng.choice([-1, 1])
        for cp in checkpoints:
            drift = direction * k * (cp ** 1.8) * nominal / 100
            values[cp] = nominal + drift + rng.normal(0, natural_noise)

    elif behavior == "SuddenSpike":
        # Normal until some checkpoint, then sudden jump
        spike_onset = rng.integers(24, 96)
        spike_magnitude = rng.uniform(0.15, 0.35)
        direction = rng.choice([-1, 1])
        for cp in checkpoints:
            if cp < spike_onset:
                values[cp] = nominal + rng.normal(0, natural_noise)
            else:
                jump = direction * spike_magnitude * nominal
                values[cp] = nominal + jump + rng.normal(0, natural_noise * 2)

    elif behavior == "Noisy":
        noise_scale = natural_noise * rng.uniform(6, 12)
        for cp in checkpoints:
            values[cp] = nominal + rng.normal(0, noise_scale)

    elif behavior == "Borderline":
        # Values near spec limits
        spec_range = cfg["spec_max"] - cfg["spec_min"]
        margin = spec_range * rng.uniform(0.02, 0.08)
        target = rng.choice([cfg["spec_min"] + margin, cfg["spec_max"] - margin])
        slow_drift_to = target
        for cp in checkpoints:
            t = cp / 168
            val = nominal + (slow_drift_to - nominal) * t
            values[cp] = val + rng.normal(0, natural_noise)

    elif behavior == "Multivariate":
        # Individually OK but combined is abnormal — slight drift on all params
        drift = rng.uniform(0.05, 0.10) * nominal * rng.choice([-1, 1])
        for cp in checkpoints:
            t = cp / 168
            values[cp] = nominal + drift * t + rng.normal(0, natural_noise)

    else:
        for cp in checkpoints:
            values[cp] = nominal + rng.normal(0, natural_noise)

    return values


def generate_lot_data(
    lot_id: str,
    n_components: int = 100,
    burn_in_hours: int = 168,
    temperature: float = 125.0,
    seed: Optional[int] = None,
    behavior_distribution: Optional[Dict[str, float]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generate a complete lot of component burn-in data.
    Returns:
        observable_df: measurements at 0h, 24h, 96h (what AI can see)
        ground_truth_df: full data including 168h (hidden)
    """
    if behavior_distribution is None:
        behavior_distribution = {
            "Healthy": 0.80,
            "GradualDrift": 0.07,
            "AcceleratingDrift": 0.04,
            "SuddenSpike": 0.03,
            "Noisy": 0.02,
            "Borderline": 0.02,
            "Multivariate": 0.02,
        }

    rng = _rng(seed)

    # Assign behaviors
    behaviors = rng.choice(
        list(behavior_distribution.keys()),
        size=n_components,
        p=list(behavior_distribution.values()),
    )

    # Lot-level bias (manufacturing variation between lots)
    lot_bias = rng.normal(0, 0.5)

    # Make component IDs unique per lot by embedding a lot hash prefix
    import hashlib
    lot_hash = int(hashlib.md5(lot_id.encode()).hexdigest()[:4], 16) % 10000

    records = []
    for i, behavior in enumerate(behaviors):
        comp_id = f"C-{lot_hash:04d}-{i+1:04d}"
        comp_seed = int(rng.integers(0, 1_000_000))
        comp_rng = _rng(comp_seed)
        comp_lot_bias = lot_bias + comp_rng.normal(0, 0.1)

        row = {
            "component_id": comp_id,
            "lot_id": lot_id,
            "behavior_type": behavior,
        }

        for param in PARAM_CONFIG:
            traj = _generate_single_parameter_trajectory(
                param, behavior, comp_rng, comp_lot_bias
            )
            for cp in CHECKPOINTS:
                col = f"{param}_{cp}h"
                row[col] = round(traj[cp], 4)

        records.append(row)

    df = pd.DataFrame(records)

    # Build observable (hide 168h)
    hidden_cols = [f"{p}_168h" for p in PARAM_CONFIG]
    observable_df = df.drop(columns=hidden_cols)
    ground_truth_df = df  # Contains everything

    return observable_df, ground_truth_df


def generate_historical_data(
    n_lots: int = 5,
    components_per_lot: int = 200,
    base_seed: int = 42,
) -> pd.DataFrame:
    """
    Generate a historical training dataset (different lots from the live demo).
    ALL checkpoints including 168h are available for training.
    """
    frames = []
    for i in range(n_lots):
        lot_id = f"HIST-LOT-{2025}_{chr(65 + i)}"
        _, full_df = generate_lot_data(
            lot_id=lot_id,
            n_components=components_per_lot,
            seed=base_seed + i * 100,
        )
        frames.append(full_df)
    return pd.concat(frames, ignore_index=True)


def get_spec_margins(df_row: pd.Series) -> Dict[str, float]:
    """Calculate specification margins for a component at each checkpoint."""
    margins = {}
    for param, cfg in PARAM_CONFIG.items():
        spec_range = cfg["spec_max"] - cfg["spec_min"]
        for cp in [0, 24, 96]:
            val = df_row.get(f"{param}_{cp}h")
            if val is not None:
                dist_min = (val - cfg["spec_min"]) / spec_range
                dist_max = (cfg["spec_max"] - val) / spec_range
                margins[f"{param}_{cp}h_margin"] = min(dist_min, dist_max)
    return margins


def get_param_config():
    return PARAM_CONFIG
