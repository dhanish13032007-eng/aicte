"""Satellite Mission Telemetry Generator"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional

DEGRADATION_ARCHETYPES = [
    "Healthy", "SlowDegradation", "SuddenDegradation",
    "IntermittentFault", "ThermalStress", "PowerDrift", "NoiseIncrease"
]

SUBSYSTEMS = ["Power", "Thermal", "Communication", "Attitude Control", "Payload"]


def assign_subsystem(component_id: str) -> str:
    """Map component ID to satellite subsystem."""
    idx = int(component_id.split("-")[-1]) % len(SUBSYSTEMS)
    return SUBSYSTEMS[idx]


def generate_mission_telemetry(
    component_ids: List[str],
    mission_days: int = 730,
    seed: Optional[int] = None,
) -> pd.DataFrame:
    """Generate synthetic satellite telemetry for all mission components."""
    rng = np.random.default_rng(seed or 12345)
    records = []

    # Assign degradation archetype per component
    archetypes = {}
    for cid in component_ids:
        # Most components are healthy
        prob = rng.random()
        if prob < 0.85:
            archetype = "Healthy"
        elif prob < 0.90:
            archetype = "SlowDegradation"
        elif prob < 0.93:
            archetype = "SuddenDegradation"
        elif prob < 0.95:
            archetype = "IntermittentFault"
        elif prob < 0.97:
            archetype = "ThermalStress"
        elif prob < 0.99:
            archetype = "PowerDrift"
        else:
            archetype = "NoiseIncrease"
        archetypes[cid] = archetype

    # Generate daily telemetry (sample every 30 days for performance)
    sample_days = list(range(0, mission_days + 1, 30))

    for day in sample_days:
        t = day / mission_days  # normalized time 0–1

        for cid in component_ids:
            arch = archetypes[cid]
            nominal_power = 12.0  # mA
            nominal_temp = 45.0   # °C
            nominal_voltage = 3.3  # V
            nominal_current = 100.0  # mA
            nominal_freq = 100.0  # MHz
            nominal_signal = -70.0  # dBm

            noise = rng.normal(0, 0.05)

            if arch == "Healthy":
                power = nominal_power + rng.normal(0, 0.1)
                temp = nominal_temp + rng.normal(0, 0.5)
                anomalous = False
                anomaly_type = None

            elif arch == "SlowDegradation":
                power = nominal_power * (1 + 0.3 * t) + rng.normal(0, 0.15)
                temp = nominal_temp + 5 * t + rng.normal(0, 0.5)
                anomalous = power > nominal_power * 1.20
                anomaly_type = "slow_degradation" if anomalous else None

            elif arch == "SuddenDegradation":
                # Normal until day 500 then sudden jump
                onset = 500
                if day < onset:
                    power = nominal_power + rng.normal(0, 0.1)
                    anomalous = False
                    anomaly_type = None
                else:
                    power = nominal_power * 3.5 + rng.normal(0, 0.5)
                    anomalous = True
                    anomaly_type = "sudden_degradation"
                temp = nominal_temp + rng.normal(0, 0.5)

            elif arch == "IntermittentFault":
                # Occasional spikes
                if rng.random() < 0.15:
                    power = nominal_power * 2.5 + rng.normal(0, 0.3)
                    anomalous = True
                    anomaly_type = "intermittent_fault"
                else:
                    power = nominal_power + rng.normal(0, 0.1)
                    anomalous = False
                    anomaly_type = None
                temp = nominal_temp + rng.normal(0, 1)

            elif arch == "ThermalStress":
                power = nominal_power + rng.normal(0, 0.1)
                temp = nominal_temp + 30 * t + rng.normal(0, 1)
                anomalous = temp > nominal_temp * 1.5
                anomaly_type = "thermal_stress" if anomalous else None

            elif arch == "PowerDrift":
                power = nominal_power * (1 + 0.5 * t ** 2) + rng.normal(0, 0.1)
                temp = nominal_temp + rng.normal(0, 0.5)
                anomalous = power > nominal_power * 1.30
                anomaly_type = "power_drift" if anomalous else None

            elif arch == "NoiseIncrease":
                noise_level = 0.1 * (1 + 5 * t)
                power = nominal_power + rng.normal(0, noise_level)
                temp = nominal_temp + rng.normal(0, noise_level * 5)
                anomalous = noise_level > 0.4
                anomaly_type = "noise_increase" if anomalous else None

            else:
                power = nominal_power
                temp = nominal_temp
                anomalous = False
                anomaly_type = None

            deviation_pct = ((power - nominal_power) / nominal_power * 100) if nominal_power != 0 else 0

            records.append({
                "component_id": cid,
                "subsystem": assign_subsystem(cid),
                "degradation_archetype": arch,
                "mission_day": day,
                "power_consumption": round(max(0, power), 3),
                "current": round(max(0, nominal_current * (power / nominal_power)), 3),
                "voltage": round(nominal_voltage + rng.normal(0, 0.01), 3),
                "temperature": round(max(-10, temp), 2),
                "frequency": round(nominal_freq + rng.normal(0, 0.1), 3),
                "signal_strength": round(nominal_signal + rng.normal(0, 0.5), 2),
                "is_anomalous": anomalous,
                "anomaly_type": anomaly_type,
                "expected_power": round(nominal_power, 3),
                "deviation_pct": round(deviation_pct, 2),
            })

    return pd.DataFrame(records), archetypes


def detect_missed_detections(
    component_ids: List[str],
    burn_in_decisions: Dict[str, str],
    telemetry_df: pd.DataFrame,
) -> List[Dict]:
    """
    Find components that PASSED burn-in but became anomalous in orbit.
    """
    missed = []
    anomalous_components = (
        telemetry_df[telemetry_df["is_anomalous"]]
        .groupby("component_id")["mission_day"]
        .min()
        .to_dict()
    )

    for cid in component_ids:
        burn_decision = burn_in_decisions.get(cid, "PASS")
        if burn_decision == "PASS" and cid in anomalous_components:
            first_anomaly_day = anomalous_components[cid]
            archetype = telemetry_df[
                telemetry_df["component_id"] == cid
            ]["degradation_archetype"].iloc[0] if len(telemetry_df[telemetry_df["component_id"] == cid]) > 0 else "Unknown"

            missed.append({
                "component_id": cid,
                "burn_in_decision": burn_decision,
                "orbit_anomaly_day": int(first_anomaly_day),
                "anomaly_type": archetype,
                "description": (
                    f"Component passed burn-in screening but exhibited {archetype} "
                    f"behaviour beginning at mission day {first_anomaly_day}."
                ),
            })

    return missed
