"""Component screening API — anomaly detection, prediction, risk scoring"""
import numpy as np
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.orm_models import Component, Measurement
from app.ml.isolation_forest import get_detector
from app.ml.xgboost_predictor import get_predictor
from app.ml.risk_engine import calculate_risk
from app.generators.data_generator import PARAM_CONFIG
from app.api.data import get_session

router = APIRouter()


def _get_measurements_dict(component_id: str, db: Session) -> Dict:
    """Pull measurements for a component from DB into a flat dict."""
    meas = db.query(Measurement).filter(Measurement.component_id == component_id).all()
    result = {}
    for m in meas:
        cp = m.checkpoint
        result[f"voltage_{cp}h"] = m.voltage
        result[f"current_{cp}h"] = m.current
        result[f"resistance_{cp}h"] = m.resistance
        result[f"leakage_current_{cp}h"] = m.leakage_current
        result[f"power_consumption_{cp}h"] = m.power_consumption
        result[f"temperature_{cp}h"] = m.temperature
        result[f"frequency_{cp}h"] = m.frequency
        result[f"noise_{cp}h"] = m.noise
    return result


@router.post("/screen-lot/{lot_id}")
def screen_lot(lot_id: str, db: Session = Depends(get_db)):
    """Run full AI screening on a complete lot."""
    session = get_session()
    observable = session.get("observable")
    ground_truth = session.get("ground_truth")

    if observable is None:
        raise HTTPException(status_code=400, detail="No data generated. Call /api/data/generate first.")

    detector = get_detector()
    predictor = get_predictor()

    lot_obs = observable[observable["lot_id"] == lot_id].copy()
    lot_gt = ground_truth[ground_truth["lot_id"] == lot_id].copy() if ground_truth is not None else None

    if lot_obs.empty:
        raise HTTPException(status_code=404, detail=f"Lot {lot_id} not found in session data.")

    # Compute lot-level stats for deviation scoring
    lot_stats = {}
    for param in PARAM_CONFIG:
        col = f"{param}_96h"
        if col in lot_obs.columns:
            vals = lot_obs[col].dropna()
            lot_stats[f"{param}_median"] = float(vals.median())
            lot_stats[f"{param}_mad"] = float((vals - vals.median()).abs().median())

    # Anomaly detection
    if_results = None
    if detector.is_trained:
        if_results = detector.predict(lot_obs)
        if_dict = dict(zip(if_results["component_id"], if_results["anomaly_score"]))
    else:
        if_dict = {}

    # Predictions
    pred_dict = {}
    if predictor.is_trained:
        batch_preds = predictor.predict_batch(lot_obs)
        for _, row in batch_preds.iterrows():
            pred_dict[row["component_id"]] = row.to_dict()

    # Risk + decisions
    results = []
    for _, comp_row in lot_obs.iterrows():
        cid = comp_row["component_id"]
        meas = {f"{p}_{cp}h": comp_row.get(f"{p}_{cp}h") for p in PARAM_CONFIG for cp in [0, 24, 96]}

        anomaly_score = if_dict.get(cid, 0.0)
        pred_info = pred_dict.get(cid, {})
        predicted_168h = pred_info.get("predicted_168h")
        conf_lower = pred_info.get("confidence_lower")
        conf_upper = pred_info.get("confidence_upper")

        risk = calculate_risk(
            measurements=meas,
            anomaly_score=anomaly_score,
            predicted_168h=predicted_168h,
            confidence_lower=conf_lower,
            confidence_upper=conf_upper,
            lot_stats=lot_stats,
        )

        # Get actual 168h if available (ground truth)
        actual_168h = None
        pred_error = None
        if lot_gt is not None:
            gt_row = lot_gt[lot_gt["component_id"] == cid]
            if not gt_row.empty:
                actual_168h = float(gt_row["power_consumption_168h"].iloc[0])
                if predicted_168h is not None:
                    pred_error = round(actual_168h - predicted_168h, 4)

        # Update DB
        comp_obj = db.query(Component).filter(Component.component_id == cid).first()
        if comp_obj:
            comp_obj.risk_score = risk["risk_score"]
            comp_obj.decision = risk["decision"]
            comp_obj.anomaly_score = anomaly_score
            comp_obj.predicted_168h = predicted_168h
            comp_obj.actual_168h = actual_168h
            comp_obj.prediction_error = pred_error

        behavior = comp_row.get("behavior_type", "Healthy")

        results.append({
            "component_id": cid,
            "lot_id": lot_id,
            "behavior_type": behavior,
            "anomaly_score": round(anomaly_score, 1),
            "is_anomalous": anomaly_score > 50,
            "predicted_168h": round(predicted_168h, 4) if predicted_168h is not None else None,
            "actual_168h": round(actual_168h, 4) if actual_168h is not None else None,
            "prediction_error": round(pred_error, 4) if pred_error is not None else None,
            "confidence_lower": round(conf_lower, 4) if conf_lower is not None else None,
            "confidence_upper": round(conf_upper, 4) if conf_upper is not None else None,
            "risk": risk,
            "decision": risk["decision"],
            "measurements_0h": {p: round(comp_row.get(f"{p}_0h", 0), 4) for p in PARAM_CONFIG},
            "measurements_24h": {p: round(comp_row.get(f"{p}_24h", 0), 4) for p in PARAM_CONFIG},
            "measurements_96h": {p: round(comp_row.get(f"{p}_96h", 0), 4) for p in PARAM_CONFIG},
        })

    db.commit()

    decision_counts = {}
    for r in results:
        d = r["decision"]
        decision_counts[d] = decision_counts.get(d, 0) + 1

    return {
        "lot_id": lot_id,
        "total_components": len(results),
        "decision_summary": decision_counts,
        "avg_risk": round(np.mean([r["risk"]["risk_score"] for r in results]), 1),
        "anomaly_rate": round(sum(1 for r in results if r["is_anomalous"]) / len(results) * 100, 1),
        "results": results,
        "lot_stats": lot_stats,
    }


@router.get("/component/{component_id}")
def get_component_screening(component_id: str, db: Session = Depends(get_db)):
    """Get full screening result for a single component."""
    session = get_session()
    observable = session.get("observable")
    ground_truth = session.get("ground_truth")

    if observable is None:
        raise HTTPException(status_code=400, detail="No data in session")

    row = observable[observable["component_id"] == component_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Component {component_id} not found")

    comp_row = row.iloc[0]
    lot_id = comp_row.get("lot_id", "")
    lot_obs = observable[observable["lot_id"] == lot_id].copy()

    # Lot stats
    lot_stats = {}
    for param in PARAM_CONFIG:
        col = f"{param}_96h"
        if col in lot_obs.columns:
            vals = lot_obs[col].dropna()
            lot_stats[f"{param}_median"] = float(vals.median())
            lot_stats[f"{param}_mad"] = float((vals - vals.median()).abs().median())

    detector = get_detector()
    predictor = get_predictor()

    anomaly_score = 0.0
    if detector.is_trained:
        if_res = detector.predict(lot_obs)
        row_res = if_res[if_res["component_id"] == component_id]
        if not row_res.empty:
            anomaly_score = float(row_res["anomaly_score"].iloc[0])

    predicted_168h = None
    conf_lower = None
    conf_upper = None
    all_predictions = {}
    feature_importance = {}

    if predictor.is_trained:
        pred = predictor.predict_single(comp_row, lot_obs)
        all_predictions = pred
        pc = pred.get("power_consumption", {})
        predicted_168h = pc.get("predicted")
        conf_lower = pc.get("confidence_lower")
        conf_upper = pc.get("confidence_upper")
        feature_importance = pc.get("feature_importance", {})

    meas = {f"{p}_{cp}h": comp_row.get(f"{p}_{cp}h") for p in PARAM_CONFIG for cp in [0, 24, 96]}
    risk = calculate_risk(
        measurements=meas,
        anomaly_score=anomaly_score,
        predicted_168h=predicted_168h,
        confidence_lower=conf_lower,
        confidence_upper=conf_upper,
        lot_stats=lot_stats,
    )

    # Ground truth (revealed only when requested)
    actual_168h = None
    if ground_truth is not None:
        gt_row = ground_truth[ground_truth["component_id"] == component_id]
        if not gt_row.empty:
            actual_168h = float(gt_row["power_consumption_168h"].iloc[0])

    # Forensic: static limit check (traditional)
    static_pass = True
    for param, cfg in PARAM_CONFIG.items():
        v96 = comp_row.get(f"{param}_96h")
        if v96 is not None:
            if v96 < cfg["spec_min"] or v96 > cfg["spec_max"]:
                static_pass = False
                break
    traditional_decision = "PASS" if static_pass else "FAIL"

    return {
        "component_id": component_id,
        "lot_id": lot_id,
        "behavior_type": comp_row.get("behavior_type", "Healthy"),
        "anomaly_score": round(anomaly_score, 1),
        "is_anomalous": anomaly_score > 50,
        "predicted_168h": round(predicted_168h, 4) if predicted_168h is not None else None,
        "actual_168h": round(actual_168h, 4) if actual_168h is not None else None,
        "confidence_lower": round(conf_lower, 4) if conf_lower is not None else None,
        "confidence_upper": round(conf_upper, 4) if conf_upper is not None else None,
        "risk": risk,
        "decision": risk["decision"],
        "traditional_decision": traditional_decision,
        "measurements": {
            f"{p}_{cp}h": round(comp_row.get(f"{p}_{cp}h", 0), 4)
            for p in PARAM_CONFIG for cp in [0, 24, 96]
        },
        "all_predictions": all_predictions,
        "feature_importance": feature_importance,
        "lot_stats": lot_stats,
    }


@router.get("/reveal/{component_id}")
def reveal_future(component_id: str):
    """Reveal the hidden 168h actual value for a component."""
    session = get_session()
    ground_truth = session.get("ground_truth")
    observable = session.get("observable")

    if ground_truth is None:
        raise HTTPException(status_code=400, detail="No ground truth available")

    gt_row = ground_truth[ground_truth["component_id"] == component_id]
    if gt_row.empty:
        raise HTTPException(status_code=404, detail="Component not found in ground truth")

    gt = gt_row.iloc[0]
    obs_row = observable[observable["component_id"] == component_id].iloc[0] if observable is not None else None

    predictor = get_predictor()
    predicted = None
    if predictor.is_trained and obs_row is not None:
        lot_obs = observable[observable["lot_id"] == obs_row["lot_id"]].copy()
        pred = predictor.predict_single(obs_row, lot_obs)
        pc = pred.get("power_consumption", {})
        predicted = pc.get("predicted")

    actuals = {p: round(float(gt.get(f"{p}_168h", 0)), 4) for p in PARAM_CONFIG}
    observeds_96 = {p: round(float(obs_row.get(f"{p}_96h", 0)), 4) for p in PARAM_CONFIG} if obs_row is not None else {}

    return {
        "component_id": component_id,
        "actual_168h": actuals,
        "observed_96h": observeds_96,
        "predicted_power_168h": round(predicted, 4) if predicted is not None else None,
        "prediction_error": round(actuals["power_consumption"] - predicted, 4) if predicted is not None else None,
        "behavior_type": gt.get("behavior_type", "Healthy"),
    }
