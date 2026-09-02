"""Reports generation API"""
import json
from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.orm_models import Component, Lot, MissedDetection

router = APIRouter()


@router.get("/generate/{lot_id}")
def generate_report(lot_id: str, format: str = "json", db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    components = db.query(Component).filter(Component.lot_id == lot_id).all()
    decisions = [c.decision for c in components if c.decision]
    risk_scores = [c.risk_score for c in components if c.risk_score is not None]
    pred_errors = [abs(c.prediction_error) for c in components if c.prediction_error is not None]

    import numpy as np
    report = {
        "report_type": "ReliaSentry Screening Report",
        "lot_id": lot_id,
        "component_type": lot.component_type,
        "total_components": lot.total_components,
        "burn_in_duration": lot.burn_in_duration,
        "temperature": lot.temperature,
        "summary": {
            "pass": decisions.count("PASS"),
            "review": decisions.count("REVIEW"),
            "reject": decisions.count("REJECT"),
            "screened": len(decisions),
            "avg_risk": round(np.mean(risk_scores), 1) if risk_scores else None,
            "max_risk": round(np.max(risk_scores), 1) if risk_scores else None,
            "anomaly_rate_pct": round(
                sum(1 for c in components if (c.anomaly_score or 0) > 50) / len(components) * 100, 1
            ) if components else 0,
            "mae": round(np.mean(pred_errors), 4) if pred_errors else None,
        },
        "components": [
            {
                "component_id": c.component_id,
                "decision": c.decision,
                "risk_score": c.risk_score,
                "anomaly_score": c.anomaly_score,
                "predicted_168h": c.predicted_168h,
                "actual_168h": c.actual_168h,
                "prediction_error": c.prediction_error,
                "behavior_type": c.behavior_type,
            }
            for c in components
        ],
        "disclaimer": "ReliaSentry is AI-assisted decision support. Final QA authority remains with a human reviewer.",
    }

    if format == "csv":
        import csv, io
        output = io.StringIO()
        if report["components"]:
            writer = csv.DictWriter(output, fieldnames=list(report["components"][0].keys()))
            writer.writeheader()
            writer.writerows(report["components"])
        return Response(content=output.getvalue(), media_type="text/csv",
                       headers={"Content-Disposition": f"attachment; filename=reliasentry_{lot_id}.csv"})

    return report
