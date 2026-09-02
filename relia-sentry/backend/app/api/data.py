"""Data generation and upload API"""
import io
import json
import traceback
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel, Field
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.orm_models import Lot, Component, Measurement
from app.generators.data_generator import generate_lot_data, generate_historical_data, PARAM_CONFIG, CHECKPOINTS

router = APIRouter()

# In-memory store for current session data
_session_data = {}


class GenerateRequest(BaseModel):
    lot_id: str = "LOT-2026-A7"
    n_components: int = Field(100, ge=10, le=2000)
    burn_in_hours: int = Field(168, ge=24, le=500)
    temperature: float = Field(125.0, ge=25.0, le=200.0)
    seed: Optional[int] = None
    component_type: str = "IC"
    behavior_distribution: Optional[Dict[str, float]] = None


@router.post("/generate")
def generate_data(req: GenerateRequest, db: Session = Depends(get_db)):
    try:
        observable_df, ground_truth_df = generate_lot_data(
            lot_id=req.lot_id,
            n_components=req.n_components,
            burn_in_hours=req.burn_in_hours,
            temperature=req.temperature,
            seed=req.seed,
            behavior_distribution=req.behavior_distribution,
        )

        # Store in memory for ML use
        _session_data["observable"] = observable_df
        _session_data["ground_truth"] = ground_truth_df
        _session_data["lot_id"] = req.lot_id

        # Persist to DB — delete existing lot data cleanly (order matters for FK)
        existing_comps = [c.component_id for c in db.query(Component).filter(Component.lot_id == req.lot_id).all()]
        if existing_comps:
            db.query(Measurement).filter(Measurement.component_id.in_(existing_comps)).delete(synchronize_session=False)
            db.query(Component).filter(Component.lot_id == req.lot_id).delete(synchronize_session=False)
        db.query(Lot).filter(Lot.lot_id == req.lot_id).delete(synchronize_session=False)
        db.flush()

        lot_obj = Lot(
            lot_id=req.lot_id,
            component_type=req.component_type,
            total_components=req.n_components,
            burn_in_duration=req.burn_in_hours,
            temperature=req.temperature,
        )
        db.add(lot_obj)

        components_out = []
        for _, row in ground_truth_df.iterrows():
            comp = Component(
                component_id=row["component_id"],
                lot_id=req.lot_id,
                behavior_type=row.get("behavior_type", "Healthy"),
            )
            db.add(comp)
            for cp in CHECKPOINTS:
                meas = Measurement(
                    component_id=row["component_id"],
                    checkpoint=cp,
                    voltage=row.get(f"voltage_{cp}h", 0),
                    current=row.get(f"current_{cp}h", 0),
                    resistance=row.get(f"resistance_{cp}h", 0),
                    leakage_current=row.get(f"leakage_current_{cp}h", 0),
                    power_consumption=row.get(f"power_consumption_{cp}h", 0),
                    temperature=row.get(f"temperature_{cp}h", 0),
                    frequency=row.get(f"frequency_{cp}h", 0),
                    noise=row.get(f"noise_{cp}h", 0),
                )
                db.add(meas)

            # Summary for response
            components_out.append({
                "component_id": row["component_id"],
                "behavior_type": row.get("behavior_type", "Healthy"),
                "measurements": {
                    f"{p}_0h": round(row.get(f"{p}_0h", 0), 4)
                    for p in PARAM_CONFIG
                },
            })

        db.commit()

        return {
            "status": "success",
            "lot_id": req.lot_id,
            "n_components": req.n_components,
            "components_preview": components_out[:5],
            "behavior_summary": ground_truth_df["behavior_type"].value_counts().to_dict(),
            "parameters": list(PARAM_CONFIG.keys()),
            "checkpoints": CHECKPOINTS,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-historical")
def generate_historical(db: Session = Depends(get_db)):
    """Generate historical training dataset."""
    try:
        hist_df = generate_historical_data(n_lots=5, components_per_lot=200, base_seed=42)
        _session_data["historical"] = hist_df
        return {
            "status": "success",
            "total_samples": len(hist_df),
            "lots": hist_df["lot_id"].nunique(),
            "behavior_distribution": hist_df["behavior_type"].value_counts().to_dict(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session-data")
def get_session_data():
    """Return current session data summary."""
    if "lot_id" not in _session_data:
        return {"status": "no_data"}
    gt = _session_data.get("ground_truth")
    obs = _session_data.get("observable")
    return {
        "status": "ready",
        "lot_id": _session_data["lot_id"],
        "n_components": len(gt) if gt is not None else 0,
        "has_historical": "historical" in _session_data,
        "behavior_distribution": gt["behavior_type"].value_counts().to_dict() if gt is not None else {},
    }


def get_session():
    return _session_data
