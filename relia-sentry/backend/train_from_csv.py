"""
ReliaSentry -- Train ML Models from Your CSV Dataset
=====================================================
Supports both column naming formats:
  PREFIX format:  0h_voltage,  24h_current,  96h_power,   168h_current
  SUFFIX format:  voltage_0h,  current_24h,  power_96h,   current_168h

Usage:
    python train_from_csv.py --file reliasentry_burnin_full.csv --inspect
    python train_from_csv.py --file reliasentry_burnin_full.csv
    python train_from_csv.py --file reliasentry_burnin_full.csv --target current
"""

import sys
import os
import argparse
import pickle
import json
import numpy as np
import pandas as pd
from pathlib import Path

# Fix console encoding on Windows
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.ensemble import IsolationForest

try:
    from xgboost import XGBRegressor
    HAS_XGBOOST = True
except ImportError:
    print("[!] xgboost not installed. Run: pip install xgboost")
    HAS_XGBOOST = False

MODEL_DIR = Path(__file__).parent / "trained_models"

CHECKPOINTS = [0, 24, 96, 168]

ALL_PARAMS = [
    "voltage", "current", "resistance",
    "leakage_current", "power", "temperature", "frequency", "noise",
    "power_consumption", "leakage",
]


def detect_and_normalise_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    cols = df.columns.tolist()

    # Detect prefix format: "0h_voltage"
    prefix_hits = sum(1 for c in cols if c.startswith(("0h_", "24h_", "96h_", "168h_")))
    suffix_hits = sum(1 for c in cols if c.endswith(("_0h", "_24h", "_96h", "_168h")))

    if prefix_hits >= suffix_hits and prefix_hits > 0:
        fmt = "PREFIX"
        rename = {}
        for cp in CHECKPOINTS:
            for col in cols:
                if col.startswith(f"{cp}h_"):
                    param = col[len(f"{cp}h_"):]
                    rename[col] = f"{param}_{cp}h"
        df = df.rename(columns=rename)
        print("  [INFO] Detected PREFIX format (e.g. 0h_voltage). Normalised to suffix format.")
    else:
        fmt = "SUFFIX"
        print("  [INFO] Detected SUFFIX format (e.g. voltage_0h). No prefix renaming needed.")

    # Normalise common aliases
    alias_map = {
        "power_0h": "power_consumption_0h",
        "power_24h": "power_consumption_24h",
        "power_96h": "power_consumption_96h",
        "power_168h": "power_consumption_168h",
        "leakage_0h": "leakage_current_0h",
        "leakage_24h": "leakage_current_24h",
        "leakage_96h": "leakage_current_96h",
        "leakage_168h": "leakage_current_168h",
    }
    existing_alias = {k: v for k, v in alias_map.items() if k in df.columns and v not in df.columns}
    if existing_alias:
        df = df.rename(columns=existing_alias)
        print(f"  [INFO] Aliased {len(existing_alias)} columns: {list(existing_alias.keys())}")

    return df, fmt


def normalise_id_columns(df: pd.DataFrame) -> pd.DataFrame:
    if "component_id" not in df.columns:
        for c in ["id", "comp_id", "unit_id", "serial", "component"]:
            if c in df.columns:
                df = df.rename(columns={c: "component_id"})
                print(f"  [INFO] Renamed '{c}' -> 'component_id'")
                break
        else:
            df["component_id"] = [f"C-{i:06d}" for i in range(len(df))]
            print("  [INFO] Generated component_id column")

    if "lot_id" not in df.columns:
        for c in ["lot", "batch", "wafer_lot", "wafer", "manufacturing_batch"]:
            if c in df.columns:
                df = df.rename(columns={c: "lot_id"})
                print(f"  [INFO] Renamed '{c}' -> 'lot_id'")
                break
        else:
            df["lot_id"] = "LOT-USER-001"
            print("  [INFO] Set default lot_id = LOT-USER-001")

    return df


def inspect(df: pd.DataFrame):
    print(f"\n{'-'*65}")
    print("  Column Compatibility Check (after normalisation)")
    print(f"{'-'*65}")

    params_to_check = [
        "voltage", "current", "resistance", "leakage_current",
        "power_consumption", "power", "temperature", "frequency", "noise"
    ]
    trainable = []

    print(f"\n  {'PARAMETER':<25} {'0h':>5} {'24h':>5} {'96h':>5} {'168h (TARGET)':>14}")
    print("  " + "-" * 55)

    for p in params_to_check:
        row = f"  {p:<25}"
        has_all = True
        has_target = False
        for cp in CHECKPOINTS:
            col = f"{p}_{cp}h"
            found = col in df.columns
            if not found:
                has_all = False
            if cp == 168 and found:
                has_target = True
            row += f"  {'[Y]' if found else '[-]':>4}"
        if has_target and has_all:
            trainable.append(p)
            row += "   <- TRAINABLE [OK]"
        elif has_target:
            row += "   <- partial (missing checkpoints)"
        print(row)

    print(f"\n  Trainable parameters: {trainable}")
    print(f"  Total rows: {len(df):,}")

    lots = df["lot_id"].nunique() if "lot_id" in df.columns else "N/A"
    behav_col = "ground_truth_label" if "ground_truth_label" in df.columns else \
                "behaviour_type" if "behaviour_type" in df.columns else \
                "behavior_type" if "behavior_type" in df.columns else None
    behaviors = df[behav_col].value_counts().to_dict() if behav_col else "N/A"
    print(f"  Unique lots: {lots}")
    print(f"  Behaviour distribution: {behaviors}")
    return trainable


def build_features(df: pd.DataFrame, param: str) -> pd.DataFrame:
    c0 = f"{param}_0h"
    c24 = f"{param}_24h"
    c96 = f"{param}_96h"

    f = pd.DataFrame(index=df.index)

    # Raw observations
    f[f"{param}_0h"] = df[c0]
    f[f"{param}_24h"] = df[c24]
    f[f"{param}_96h"] = df[c96]

    # Deltas
    f[f"{param}_delta_0_24"] = df[c24] - df[c0]
    f[f"{param}_delta_24_96"] = df[c96] - df[c24]
    f[f"{param}_delta_0_96"] = df[c96] - df[c0]

    # % changes
    f[f"{param}_pct_0_24"] = (df[c24] - df[c0]) / (df[c0].abs() + 1e-9)
    f[f"{param}_pct_24_96"] = (df[c96] - df[c24]) / (df[c24].abs() + 1e-9)
    f[f"{param}_pct_0_96"] = (df[c96] - df[c0]) / (df[c0].abs() + 1e-9)

    # Slopes
    f[f"{param}_slope_0_24"] = (df[c24] - df[c0]) / 24
    f[f"{param}_slope_24_96"] = (df[c96] - df[c24]) / 72
    f[f"{param}_slope_0_96"] = (df[c96] - df[c0]) / 96

    # Drift acceleration
    f[f"{param}_acceleration"] = f[f"{param}_slope_24_96"] - f[f"{param}_slope_0_24"]

    # Noise / variance across checkpoints
    f[f"{param}_variance"] = df[[c0, c24, c96]].var(axis=1)
    f[f"{param}_std"] = df[[c0, c24, c96]].std(axis=1)
    f[f"{param}_range"] = df[[c0, c24, c96]].max(axis=1) - df[[c0, c24, c96]].min(axis=1)

    # Lot-relative features
    if "lot_id" in df.columns and df["lot_id"].nunique() > 1:
        lot_median = df.groupby("lot_id")[c96].transform("median")
        lot_std = df.groupby("lot_id")[c96].transform("std").fillna(1.0)
        lot_mad = df.groupby("lot_id")[c96].transform(
            lambda x: (x - x.median()).abs().median()
        ).fillna(1.0)
        f[f"{param}_lot_zscore"] = (df[c96] - lot_median) / (lot_std + 1e-9)
        f[f"{param}_lot_madscore"] = (df[c96] - lot_median) / (lot_mad + 1e-9)
    else:
        global_med = df[c96].median()
        global_mad = (df[c96] - global_med).abs().median()
        std_val = df[c96].std() if df[c96].std() > 0 else 1.0
        f[f"{param}_lot_zscore"] = (df[c96] - df[c96].mean()) / (std_val + 1e-9)
        f[f"{param}_lot_madscore"] = (df[c96] - global_med) / (global_mad + 1e-9)

    # Cross-parameter relationships
    if param in ("power_consumption", "power") and "voltage_96h" in df.columns and "current_96h" in df.columns:
        f["vi_product_96h"] = df["voltage_96h"] * df["current_96h"]

    if param == "current" and "voltage_96h" in df.columns and "resistance_96h" in df.columns:
        f["ohm_deviation_96h"] = df[c96] - (df["voltage_96h"] / (df["resistance_96h"] + 1e-9))

    return f.fillna(0.0)


def lot_based_split(df: pd.DataFrame, train=0.70, val=0.15):
    if "lot_id" not in df.columns or df["lot_id"].nunique() < 3:
        print("  [INFO] Less than 3 unique lots -- using stratified/random row split")
        train_df, temp = train_test_split(df, test_size=(1 - train), random_state=42)
        val_df, test_df = train_test_split(temp, test_size=0.5, random_state=42)
        return train_df, val_df, test_df

    lots = df["lot_id"].unique()
    np.random.default_rng(42).shuffle(lots)
    n_train = max(1, int(len(lots) * train))
    n_val = max(1, int(len(lots) * val))

    train_lots = lots[:n_train]
    val_lots = lots[n_train:n_train + n_val]
    test_lots = lots[n_train + n_val:]
    if len(test_lots) == 0:
        test_lots = val_lots

    train_df = df[df["lot_id"].isin(train_lots)].reset_index(drop=True)
    val_df = df[df["lot_id"].isin(val_lots)].reset_index(drop=True)
    test_df = df[df["lot_id"].isin(test_lots)].reset_index(drop=True)

    print("\n  Lot-based split:")
    print(f"    Train lots: {len(train_lots)}  ({len(train_df):,} rows)")
    print(f"    Val   lots: {len(val_lots)}  ({len(val_df):,} rows)")
    print(f"    Test  lots: {len(test_lots)}  ({len(test_df):,} rows)")
    print("    [OK] Component isolation verified across splits")
    return train_df, val_df, test_df


def train_xgboost(train_df, val_df, test_df, param: str) -> dict:
    target_col = f"{param}_168h"

    X_train = build_features(train_df, param)
    y_train = train_df[target_col].fillna(train_df[target_col].median())

    X_val = build_features(val_df, param)
    y_val = val_df[target_col].fillna(val_df[target_col].median())

    X_test = build_features(test_df, param)
    y_test = test_df[target_col].fillna(test_df[target_col].median())

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_val_s = scaler.transform(X_val)
    X_test_s = scaler.transform(X_test)

    model = XGBRegressor(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        eval_metric="mae",
        early_stopping_rounds=40,
        verbosity=0,
    )
    model.fit(
        X_train_s, y_train,
        eval_set=[(X_val_s, y_val)],
        verbose=False,
    )

    y_pred_test = model.predict(X_test_s)
    mae = mean_absolute_error(y_test, y_pred_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_test)))
    denom = np.sum((y_test - y_test.mean()) ** 2)
    r2 = 1.0 - (np.sum((y_test - y_pred_test) ** 2) / denom) if denom > 0 else 0.0

    print(f"     Train={len(X_train):,}  Val={len(X_val):,}  Test={len(X_test):,}")
    print(f"     MAE={mae:.4f}  RMSE={rmse:.4f}  R2={r2:.4f}")

    # Per-behaviour breakdown
    behav_col = "ground_truth_label" if "ground_truth_label" in test_df.columns else \
                "behaviour_type" if "behaviour_type" in test_df.columns else \
                "behavior_type" if "behavior_type" in test_df.columns else None
    if behav_col:
        print("     Breakdown by behaviour archetype:")
        for btype in test_df[behav_col].unique():
            mask = test_df[behav_col] == btype
            if mask.sum() < 3:
                continue
            b_mae = mean_absolute_error(y_test[mask], y_pred_test[mask])
            print(f"       {str(btype):<25} MAE={b_mae:.4f}  (n={mask.sum()})")

    feat_names = list(X_train.columns)
    imp = model.feature_importances_
    top10 = sorted(zip(feat_names, imp), key=lambda x: x[1], reverse=True)[:10]
    feat_importance = {k: round(float(v), 4) for k, v in top10}

    MODEL_DIR.mkdir(exist_ok=True)
    with open(MODEL_DIR / f"xgb_{param}.pkl", "wb") as f:
        pickle.dump(model, f)
    with open(MODEL_DIR / f"xgb_scaler_{param}.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(MODEL_DIR / f"xgb_features_{param}.json", "w") as f:
        json.dump({
            "feature_columns": feat_names,
            "target": target_col,
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "r2": round(r2, 4),
            "top_features": feat_importance
        }, f, indent=2)

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "r2": round(r2, 4),
        "feature_importance": feat_importance,
        "status": "[OK]"
    }


def train_isolation_forest(train_df: pd.DataFrame) -> dict:
    feature_cols = [
        c for c in train_df.columns
        if (c.endswith("_0h") or c.endswith("_24h") or c.endswith("_96h"))
        and c not in ("lot_id", "component_id")
        and not c.endswith("_168h")
    ]

    if not feature_cols:
        print("  [!] No 0h/24h/96h feature columns found for Isolation Forest")
        return {"status": "[FAIL] no features"}

    print(f"\n  Using {len(feature_cols)} feature columns for Isolation Forest")
    X = train_df[feature_cols].fillna(0.0)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.10,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    anomaly_pct = (model.predict(X_scaled) == -1).mean() * 100
    print(f"  [OK] Trained on {len(X):,} samples | Flagged {anomaly_pct:.1f}% as anomalous")

    MODEL_DIR.mkdir(exist_ok=True)
    with open(MODEL_DIR / "isolation_forest.pkl", "wb") as f:
        pickle.dump(model, f)
    with open(MODEL_DIR / "isolation_forest_scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(MODEL_DIR / "isolation_forest_features.json", "w") as f:
        json.dump({
            "feature_columns": feature_cols,
            "contamination": 0.10,
            "n_estimators": 200
        }, f, indent=2)

    return {
        "samples": len(X),
        "features": len(feature_cols),
        "anomaly_rate": f"{anomaly_pct:.1f}%",
        "status": "[OK]"
    }


def main():
    parser = argparse.ArgumentParser(description="Train ReliaSentry ML models from CSV")
    parser.add_argument("--file", default="reliasentry_burnin_full.csv", help="CSV file path")
    parser.add_argument("--target", default=None, help="Specific parameter to train (e.g. current or voltage)")
    parser.add_argument("--inspect", action="store_true", help="Inspect columns only")
    args = parser.parse_args()

    filepath = args.file
    if not os.path.isabs(filepath):
        filepath = str(Path(__file__).parent / filepath)

    if not os.path.exists(filepath):
        print(f"\n[FAIL] File not found: {filepath}")
        sys.exit(1)

    print(f"\n{'='*65}")
    print(f"  ReliaSentry Model Training Pipeline -- {Path(filepath).name}")
    print(f"{'='*65}")

    df = pd.read_csv(filepath)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    print(f"\n[OK] Loaded {len(df):,} rows x {len(df.columns)} columns")

    df, fmt = detect_and_normalise_columns(df)
    df = normalise_id_columns(df)

    trainable = inspect(df)

    if args.inspect:
        print("\n[--inspect mode: completed analysis, exiting without training]\n")
        return

    if not trainable:
        print("\n[FAIL] No trainable parameters found.")
        sys.exit(1)

    if args.target:
        if args.target in trainable:
            trainable = [args.target]
        else:
            print(f"[FAIL] --target '{args.target}' not trainable. Available: {trainable}")
            sys.exit(1)

    train_df, val_df, test_df = lot_based_split(df)

    print(f"\n{'='*65}")
    print("  Training XGBoost Regressors (168h Target Prediction)")
    print(f"{'='*65}")

    xgb_results = {}
    if HAS_XGBOOST:
        for param in trainable:
            print(f"\n  >> Parameter: {param} -> Target: {param}_168h")
            try:
                xgb_results[param] = train_xgboost(train_df, val_df, test_df, param)
            except Exception as e:
                print(f"     [FAIL]: {e}")
                xgb_results[param] = {"status": f"[FAIL]: {e}"}

    print(f"\n{'='*65}")
    print("  Training Isolation Forest (Abnormal Behavior Detector)")
    print(f"{'='*65}")
    if_result = train_isolation_forest(train_df)

    summary = {
        "file": filepath,
        "format_detected": fmt,
        "total_rows": len(df),
        "train_rows": len(train_df),
        "val_rows": len(val_df),
        "test_rows": len(test_df),
        "trainable_parameters": trainable,
        "xgboost_results": {
            k: {kk: vv for kk, vv in v.items() if kk != "feature_importance"}
            for k, v in xgb_results.items()
        },
        "isolation_forest": if_result,
    }
    with open(MODEL_DIR / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\n{'='*65}")
    print("  TRAINING COMPLETE -- SUMMARY")
    print(f"{'='*65}")
    for param, r in xgb_results.items():
        if "mae" in r:
            print(f"  {param:<22} MAE={r['mae']:.4f}  RMSE={r['rmse']:.4f}  R2={r['r2']:.4f}  {r['status']}")
        else:
            print(f"  {param:<22} {r['status']}")
    print(f"  Isolation Forest:      {if_result['status']} ({if_result.get('samples','?')} samples)")
    print(f"\n  Saved models to: {MODEL_DIR}")
    print("  Ready for ReliaSentry live inference!")


if __name__ == "__main__":
    main()
