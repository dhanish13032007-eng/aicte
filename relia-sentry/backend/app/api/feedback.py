"""Adaptive screening feedback loop API"""
import numpy as np
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.orm_models import FeedbackCycle, MissedDetection
from app.ml.risk_engine import PASS_THRESHOLD, REVIEW_THRESHOLD

router = APIRouter()


@router.post("/analyze/{mission_id}")
def analyze_feedback(mission_id: str, n_cycles: int = 4, db: Session = Depends(get_db)):
    """
    Simulate adaptive screening feedback based on missed detections.
    Returns how the screening threshold would evolve over multiple cycles.
    """
    missed = db.query(MissedDetection).filter(MissedDetection.mission_id == mission_id).all()
    total_components = 100  # placeholder; ideally from mission record

    cycles = []
    current_threshold = float(PASS_THRESHOLD)
    base_missed = len(missed)

    # Simulate improvement across cycles
    rng = np.random.default_rng(42)
    for cycle in range(1, n_cycles + 1):
        # Each cycle adjusts threshold slightly — more missed = lower threshold
        missed_count = max(0, base_missed - int((cycle - 1) * rng.uniform(1.5, 2.5)))
        detection_rate = round(min(100, 100 - (missed_count / max(1, total_components)) * 100), 1)
        false_positive_rate = round(rng.uniform(2, 8) + (current_threshold - PASS_THRESHOLD) * 0.5, 1)

        new_threshold = max(25, current_threshold - rng.uniform(2, 5)) if missed_count > 0 else current_threshold
        reason = (
            f"Threshold reduced from {current_threshold:.1f} to {new_threshold:.1f} "
            f"to capture {missed_count} previously missed components."
            if missed_count > 0
            else "No missed detections — threshold maintained."
        )

        cycle_obj = FeedbackCycle(
            cycle_number=cycle,
            lot_id=mission_id,
            missed_detections=missed_count,
            detection_rate=detection_rate,
            false_positive_rate=false_positive_rate,
            previous_threshold=round(current_threshold, 1),
            new_threshold=round(new_threshold, 1),
            adjustment_reason=reason,
        )
        db.add(cycle_obj)
        cycles.append({
            "cycle": cycle,
            "missed_detections": missed_count,
            "detection_rate": detection_rate,
            "false_positive_rate": false_positive_rate,
            "previous_threshold": round(current_threshold, 1),
            "new_threshold": round(new_threshold, 1),
            "adjustment_reason": reason,
        })
        current_threshold = new_threshold

    db.commit()

    return {
        "mission_id": mission_id,
        "initial_missed_detections": base_missed,
        "cycles": cycles,
        "final_threshold": round(current_threshold, 1),
        "disclaimer": (
            "Simulated adaptive screening feedback. "
            "This does not automatically update a deployed flight model. "
            "Results represent scenario analysis only."
        ),
    }


@router.get("/history")
def get_feedback_history(db: Session = Depends(get_db)):
    cycles = db.query(FeedbackCycle).order_by(FeedbackCycle.cycle_number).all()
    return [
        {
            "cycle_number": c.cycle_number,
            "lot_id": c.lot_id,
            "missed_detections": c.missed_detections,
            "detection_rate": c.detection_rate,
            "false_positive_rate": c.false_positive_rate,
            "previous_threshold": c.previous_threshold,
            "new_threshold": c.new_threshold,
            "adjustment_reason": c.adjustment_reason,
        }
        for c in cycles
    ]
