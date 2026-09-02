"""XGBoost Predictor for ReliaSentry — Predicts 168h value from 0h/24h/96h observations"""
import numpy as np
import pandas as pd
import pickle
import json
import os
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error
from typing import Dict, Optional, List
from app.generators.data_generator import PARAM_CONFIG

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_DIR = os.path.join(_BASE_DIR, "trained_models")


def _build_xgb_features(df: pd.DataFrame, param: str) -> pd.DataFrame:
    """
    Build feature matrix for XGBoost prediction of 168h value.
    Must match the feature engineering used in train_from_csv.py.
    """
    c0 = f"{param}_0h"
    c24 = f"{param}_24h"
    c96 = f"{param}_96h"

    if not all(c in df.columns for c in [c0, c24, c96]):
        raise ValueError(f"Missing measurement columns for {param}: {[c0, c24, c96]}")

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
    f[f"{param}_slope_0_24"] = (df[c24] - df[c0]) / 24.0
    f[f"{param}_slope_24_96"] = (df[c96] - df[c24]) / 72.0
    f[f"{param}_slope_0_96"] = (df[c96] - df[c0]) / 96.0

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
        if global_mad == 0 or np.isnan(global_mad):
            global_mad = 1.0
        std_val = df[c96].std() if (hasattr(df[c96], 'std') and df[c96].std() > 0) else 1.0
        f[f"{param}_lot_zscore"] = (df[c96] - df[c96].mean()) / (std_val + 1e-9)
        f[f"{param}_lot_madscore"] = (df[c96] - global_med) / (global_mad + 1e-9)

    # Cross-parameter relationships
    if param in ("power_consumption", "power") and "voltage_96h" in df.columns and "current_96h" in df.columns:
        f["vi_product_96h"] = df["voltage_96h"] * df["current_96h"]

    if param == "current" and "voltage_96h" in df.columns and "resistance_96h" in df.columns:
        f["ohm_deviation_96h"] = df[c96] - (df["voltage_96h"] / (df["resistance_96h"] + 1e-9))

    return f.fillna(0.0)


class XGBoostPredictor:
    def __init__(self):
        self.models: Dict[str, XGBRegressor] = {}
        self.scalers: Dict[str, StandardScaler] = {}
        self.feature_columns: Dict[str, List[str]] = {}
        self.is_trained = False
        self.training_samples = 0
        self.validation_samples = 0
        self.test_samples = 0
        self.metrics: Dict[str, Dict] = {}
        self.feature_importance: Dict[str, Dict] = {}

    def train(self, historical_df: pd.DataFrame) -> Dict:
        results = {}
        all_train = 0

        for param in PARAM_CONFIG:
            target_col = f"{param}_168h"
            if target_col not in historical_df.columns:
                continue

            try:
                X = _build_xgb_features(historical_df.copy(), param)
                y = historical_df[target_col]

                # Split: 70% train, 15% val, 15% test
                X_train, X_temp, y_train, y_temp = train_test_split(
                    X, y, test_size=0.30, random_state=42
                )
                X_val, X_test, y_val, y_test = train_test_split(
                    X_temp, y_temp, test_size=0.50, random_state=42
                )

                scaler = StandardScaler()
                X_train_s = scaler.fit_transform(X_train)
                X_val_s = scaler.transform(X_val)
                X_test_s = scaler.transform(X_test)

                model = XGBRegressor(
                    n_estimators=300,
                    max_depth=6,
                    learning_rate=0.05,
                    subsample=0.8,
                    colsample_bytree=0.8,
                    random_state=42,
                    eval_metric="mae",
                    early_stopping_rounds=30,
                    verbosity=0,
                )
                model.fit(
                    X_train_s, y_train,
                    eval_set=[(X_val_s, y_val)],
                    verbose=False,
                )

                y_pred = model.predict(X_test_s)
                mae = mean_absolute_error(y_test, y_pred)
                rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))

                self.models[param] = model
                self.scalers[param] = scaler
                self.feature_columns[param] = list(X.columns)
                self.metrics[param] = {"mae": round(mae, 4), "rmse": round(rmse, 4)}

                # Feature importance
                imp = model.feature_importances_
                feat_names = list(X.columns)
                sorted_imp = sorted(
                    zip(feat_names, imp), key=lambda x: x[1], reverse=True
                )[:10]
                self.feature_importance[param] = {k: round(float(v), 4) for k, v in sorted_imp}

                all_train = len(X_train)
                self.validation_samples = len(X_val)
                self.test_samples = len(X_test)

                # Save
                os.makedirs(MODEL_DIR, exist_ok=True)
                with open(f"{MODEL_DIR}/xgb_{param}.pkl", "wb") as f:
                    pickle.dump(model, f)
                with open(f"{MODEL_DIR}/xgb_scaler_{param}.pkl", "wb") as f:
                    pickle.dump(scaler, f)
                with open(f"{MODEL_DIR}/xgb_features_{param}.json", "w") as f:
                    json.dump({"feature_columns": list(X.columns), "mae": mae, "rmse": rmse}, f, indent=2)

                results[param] = {"mae": mae, "rmse": rmse}

            except Exception as e:
                results[param] = {"error": str(e)}

        self.training_samples = all_train
        self.is_trained = len(self.models) > 0
        return results

    def load(self) -> bool:
        loaded = 0
        for param in PARAM_CONFIG:
            model_path = os.path.join(MODEL_DIR, f"xgb_{param}.pkl")
            scaler_path = os.path.join(MODEL_DIR, f"xgb_scaler_{param}.pkl")
            feat_path = os.path.join(MODEL_DIR, f"xgb_features_{param}.json")
            if os.path.exists(model_path) and os.path.exists(scaler_path):
                try:
                    with open(model_path, "rb") as f:
                        self.models[param] = pickle.load(f)
                    with open(scaler_path, "rb") as f:
                        self.scalers[param] = pickle.load(f)
                    if os.path.exists(feat_path):
                        with open(feat_path, "r") as f:
                            feat_info = json.load(f)
                            self.feature_columns[param] = feat_info.get("feature_columns", [])
                            if "mae" in feat_info and "rmse" in feat_info:
                                self.metrics[param] = {"mae": feat_info["mae"], "rmse": feat_info["rmse"]}
                    loaded += 1
                except Exception as e:
                    print(f"[XGBoost load error {param}]: {e}")

        # Try loading summary
        summary_path = os.path.join(MODEL_DIR, "training_summary.json")
        if os.path.exists(summary_path):
            try:
                with open(summary_path, "r") as f:
                    summary = json.load(f)
                    self.training_samples = summary.get("train_rows", 0)
                    for p, m in summary.get("xgboost_results", {}).items():
                        if p not in self.metrics:
                            self.metrics[p] = {"mae": m.get("mae", 0), "rmse": m.get("rmse", 0)}
            except Exception:
                pass

        self.is_trained = loaded > 0
        return self.is_trained

    def predict_single(self, component_row: pd.Series, lot_df: pd.DataFrame) -> Dict:
        """Predict 168h values for a single component given lot context."""
        if not self.is_trained:
            raise RuntimeError("XGBoost models not trained")

        # Build single-row DataFrame with lot context
        single_df = pd.DataFrame([component_row])
        if "lot_id" in component_row and not lot_df.empty:
            context_df = pd.concat([lot_df, single_df], ignore_index=True)
        else:
            context_df = single_df

        predictions = {}
        for param in PARAM_CONFIG:
            if param not in self.models:
                continue
            try:
                X = _build_xgb_features(context_df.copy(), param)
                # Align columns if saved feature column list exists
                if param in self.feature_columns:
                    for col in self.feature_columns[param]:
                        if col not in X.columns:
                            X[col] = 0.0
                    X = X[self.feature_columns[param]]

                X_single = X.iloc[[-1]]
                X_scaled = self.scalers[param].transform(X_single)
                pred = float(self.models[param].predict(X_scaled)[0])

                rmse = self.metrics.get(param, {}).get("rmse", max(abs(pred) * 0.05, 0.05))
                predictions[param] = {
                    "predicted": round(pred, 4),
                    "confidence_lower": round(pred - 1.96 * rmse, 4),
                    "confidence_upper": round(pred + 1.96 * rmse, 4),
                    "feature_importance": self.feature_importance.get(param, {}),
                }
            except Exception as e:
                predictions[param] = {"error": str(e)}

        return predictions

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Vectorized batch prediction for all components in df.
        Runs in milliseconds across all parameters.
        """
        if not self.is_trained or df.empty:
            return pd.DataFrame({
                "component_id": df["component_id"] if "component_id" in df.columns else [],
                "predicted_168h": [0.0] * len(df),
                "confidence_lower": [0.0] * len(df),
                "confidence_upper": [0.0] * len(df),
            })

        # Store predictions per param: param -> array of float
        param_preds: Dict[str, np.ndarray] = {}

        for param in PARAM_CONFIG:
            if param not in self.models:
                continue
            try:
                X = _build_xgb_features(df.copy(), param)
                if param in self.feature_columns:
                    for col in self.feature_columns[param]:
                        if col not in X.columns:
                            X[col] = 0.0
                    X = X[self.feature_columns[param]]

                X_scaled = self.scalers[param].transform(X)
                param_preds[param] = self.models[param].predict(X_scaled)
            except Exception as e:
                print(f"[predict_batch error for {param}]: {e}")

        # Power consumption is primary signal
        pc_preds = param_preds.get("power_consumption")
        pc_rmse = self.metrics.get("power_consumption", {}).get("rmse", 0.7452)

        results = []
        for i, row in df.reset_index(drop=True).iterrows():
            cid = str(row.get("component_id", f"C-{i}"))
            all_p = {}
            for p, preds_arr in param_preds.items():
                p_val = float(preds_arr[i])
                r = self.metrics.get(p, {}).get("rmse", max(abs(p_val) * 0.05, 0.05))
                all_p[p] = {
                    "predicted": round(p_val, 4),
                    "confidence_lower": round(p_val - 1.96 * r, 4),
                    "confidence_upper": round(p_val + 1.96 * r, 4),
                }

            if pc_preds is not None:
                pc_val = float(pc_preds[i])
                conf_l = pc_val - 1.96 * pc_rmse
                conf_u = pc_val + 1.96 * pc_rmse
            else:
                pc_val = 0.0
                conf_l = 0.0
                conf_u = 0.0

            results.append({
                "component_id": cid,
                "predicted_168h": round(pc_val, 4),
                "confidence_lower": round(conf_l, 4),
                "confidence_upper": round(conf_u, 4),
                "all_predictions": all_p,
            })

        return pd.DataFrame(results)

    def get_overall_metrics(self) -> Dict:
        if not self.metrics:
            return {}
        all_mae = [v["mae"] for v in self.metrics.values() if "mae" in v]
        all_rmse = [v["rmse"] for v in self.metrics.values() if "rmse" in v]
        return {
            "avg_mae": round(np.mean(all_mae), 4) if all_mae else 0,
            "avg_rmse": round(np.mean(all_rmse), 4) if all_rmse else 0,
            "per_parameter": self.metrics,
        }


# Singleton
_predictor = XGBoostPredictor()


def get_predictor() -> XGBoostPredictor:
    return _predictor
