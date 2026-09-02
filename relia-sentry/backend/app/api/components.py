"""Components and lots listing API"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.orm_models import Component, Lot, Measurement
from app.api.data import get_session
from app.generators.data_generator import PARAM_CONFIG

router = APIRouter()


@router.get("/lots")
def list_lots(db: Session = Depends(get_db)):
    lots = db.query(Lot).all()
    result = []
    for lot in lots:
        components = db.query(Component).filter(Component.lot_id == lot.lot_id).all()
        decisions = [c.decision for c in components if c.decision]
        risk_scores = [c.risk_score for c in components if c.risk_score is not None]
        result.append({
            "lot_id": lot.lot_id,
            "component_type": lot.component_type,
            "total_components": lot.total_components,
            "burn_in_duration": lot.burn_in_duration,
            "temperature": lot.temperature,
            "created_at": lot.created_at.isoformat() if lot.created_at else None,
            "screened": len(decisions),
            "pass_count": decisions.count("PASS"),
            "review_count": decisions.count("REVIEW"),
            "reject_count": decisions.count("REJECT"),
            "avg_risk": round(sum(risk_scores) / len(risk_scores), 1) if risk_scores else None,
            "max_risk": round(max(risk_scores), 1) if risk_scores else None,
        })
    return result


@router.get("/")
def list_components(
    lot_id: Optional[str] = None,
    decision: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(Component)
    if lot_id:
        query = query.filter(Component.lot_id == lot_id)
    if decision:
        query = query.filter(Component.decision == decision)
    total = query.count()
    components = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "components": [
            {
                "component_id": c.component_id,
                "lot_id": c.lot_id,
                "behavior_type": c.behavior_type,
                "risk_score": c.risk_score,
                "decision": c.decision,
                "anomaly_score": c.anomaly_score,
                "predicted_168h": c.predicted_168h,
                "actual_168h": c.actual_168h,
                "prediction_error": c.prediction_error,
                "review_status": c.review_status,
                "assigned_to": c.assigned_to,
            }
            for c in components
        ],
    }


@router.get("/{component_id}/measurements")
def get_component_measurements(component_id: str, db: Session = Depends(get_db)):
    meas = db.query(Measurement).filter(Measurement.component_id == component_id).all()
    if not meas:
        raise HTTPException(status_code=404, detail="Component measurements not found")

    result = {}
    for m in meas:
        result[m.checkpoint] = {
            "voltage": m.voltage,
            "current": m.current,
            "resistance": m.resistance,
            "leakage_current": m.leakage_current,
            "power_consumption": m.power_consumption,
            "temperature": m.temperature,
            "frequency": m.frequency,
            "noise": m.noise,
        }
    return {"component_id": component_id, "measurements": result}


@router.patch("/{component_id}/review")
def update_review(component_id: str, update: dict, db: Session = Depends(get_db)):
    comp = db.query(Component).filter(Component.component_id == component_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component not found")
    for field in ["review_status", "assigned_to", "notes", "decision"]:
        if field in update:
            setattr(comp, field, update[field])
    db.commit()
    return {"status": "updated", "component_id": component_id}


@router.get("/lot-analysis/{lot_id}")
def lot_analysis(lot_id: str, db: Session = Depends(get_db)):
    session = get_session()
    obs = session.get("observable")
    gt = session.get("ground_truth")

    components = db.query(Component).filter(Component.lot_id == lot_id).all()
    if not components:
        raise HTTPException(status_code=404, detail="Lot not found or not screened")

    decisions = [c.decision for c in components if c.decision]
    risk_scores = [c.risk_score for c in components if c.risk_score is not None]
    anomaly_scores = [c.anomaly_score for c in components if c.anomaly_score is not None]
    pred_errors = [c.prediction_error for c in components if c.prediction_error is not None]

    import numpy as np

    # Behavior distribution from session if available
    behavior_dist = {}
    if obs is not None:
        lot_obs = obs[obs["lot_id"] == lot_id]
        if not lot_obs.empty:
            behavior_dist = lot_obs["behavior_type"].value_counts().to_dict()

    return {
        "lot_id": lot_id,
        "total_components": len(components),
        "pass_count": decisions.count("PASS"),
        "review_count": decisions.count("REVIEW"),
        "reject_count": decisions.count("REJECT"),
        "screened_count": len(decisions),
        "avg_risk": round(np.mean(risk_scores), 1) if risk_scores else None,
        "max_risk": round(np.max(risk_scores), 1) if risk_scores else None,
        "min_risk": round(np.min(risk_scores), 1) if risk_scores else None,
        "anomaly_rate": round(sum(1 for s in anomaly_scores if s > 50) / len(anomaly_scores) * 100, 1) if anomaly_scores else None,
        "avg_anomaly_score": round(np.mean(anomaly_scores), 1) if anomaly_scores else None,
        "mae": round(np.mean([abs(e) for e in pred_errors]), 4) if pred_errors else None,
        "risk_histogram": _make_histogram(risk_scores, bins=10, range_=(0, 100)),
        "behavior_distribution": behavior_dist,
        "top_risky": sorted(
            [{"component_id": c.component_id, "risk_score": c.risk_score, "decision": c.decision}
             for c in components if c.risk_score is not None],
            key=lambda x: x["risk_score"] or 0, reverse=True
        )[:10],
    }


def _make_histogram(values, bins=10, range_=(0, 100)):
    import numpy as np
    if not values:
        return []
    counts, edges = np.histogram(values, bins=bins, range=range_)
    return [
        {"range": f"{edges[i]:.0f}–{edges[i+1]:.0f}", "count": int(counts[i])}
        for i in range(len(counts))
    ]
