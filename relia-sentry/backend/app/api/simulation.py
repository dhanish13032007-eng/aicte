"""Simulation API — burn-in and satellite mission"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.orm_models import Mission, TelemetryEvent, MissedDetection, Component
from app.generators.telemetry_generator import generate_mission_telemetry, detect_missed_detections

router = APIRouter()

# In-memory mission store
_mission_store = {}


class MissionRequest(BaseModel):
    lot_id: str
    mission_days: int = 730
    seed: Optional[int] = None


@router.post("/satellite/launch")
def launch_satellite(req: MissionRequest, db: Session = Depends(get_db)):
    """Launch a simulated satellite mission with PASS components from a lot."""
    # Get PASS components
    pass_components = db.query(Component).filter(
        Component.lot_id == req.lot_id,
        Component.decision == "PASS"
    ).all()

    if not pass_components:
        # If not screened yet, use all components
        pass_components = db.query(Component).filter(Component.lot_id == req.lot_id).all()

    component_ids = [c.component_id for c in pass_components]
    burn_in_decisions = {c.component_id: c.decision or "PASS" for c in pass_components}

    if not component_ids:
        raise HTTPException(status_code=400, detail="No components found for this lot")

    mission_id = f"MISSION-{req.lot_id}-{uuid.uuid4().hex[:6].upper()}"

    # Generate telemetry
    telemetry_df, archetypes = generate_mission_telemetry(
        component_ids=component_ids,
        mission_days=req.mission_days,
        seed=req.seed,
    )

    # Store in memory
    _mission_store[mission_id] = {
        "lot_id": req.lot_id,
        "component_ids": component_ids,
        "telemetry": telemetry_df,
        "archetypes": archetypes,
        "burn_in_decisions": burn_in_decisions,
        "mission_days": req.mission_days,
    }

    # Detect missed detections
    missed = detect_missed_detections(component_ids, burn_in_decisions, telemetry_df)

    # Save mission to DB
    mission = Mission(
        mission_id=mission_id,
        lot_id=req.lot_id,
        components_launched=len(component_ids),
        status="ORBIT",
    )
    db.add(mission)

    for m in missed:
        md = MissedDetection(
            component_id=m["component_id"],
            mission_id=mission_id,
            burn_in_decision=m["burn_in_decision"],
            orbit_anomaly_day=m["orbit_anomaly_day"],
            anomaly_type=m["anomaly_type"],
            description=m["description"],
        )
        db.add(md)

    db.commit()

    # Summary
    total_anomalous = telemetry_df[telemetry_df["is_anomalous"]]["component_id"].nunique()

    return {
        "mission_id": mission_id,
        "lot_id": req.lot_id,
        "components_launched": len(component_ids),
        "mission_days": req.mission_days,
        "missed_detections": len(missed),
        "mission_anomalous_components": total_anomalous,
        "archetype_distribution": {
            k: sum(1 for v in archetypes.values() if v == k)
            for k in set(archetypes.values())
        },
    }


@router.get("/satellite/{mission_id}/telemetry")
def get_telemetry(
    mission_id: str,
    day_from: int = 0,
    day_to: int = 730,
    limit: int = 100,
):
    """Get telemetry data for a mission between two days."""
    if mission_id not in _mission_store:
        raise HTTPException(status_code=404, detail="Mission not found")

    store = _mission_store[mission_id]
    df = store["telemetry"]
    filtered = df[(df["mission_day"] >= day_from) & (df["mission_day"] <= day_to)]

    # Limit rows
    filtered = filtered.head(limit)

    return {
        "mission_id": mission_id,
        "data": filtered.to_dict(orient="records"),
        "total_records": len(filtered),
        "anomalous_count": int(filtered["is_anomalous"].sum()),
    }


@router.get("/satellite/{mission_id}/anomalies")
def get_mission_anomalies(mission_id: str):
    """Get all anomalous telemetry events for a mission."""
    if mission_id not in _mission_store:
        raise HTTPException(status_code=404, detail="Mission not found")

    store = _mission_store[mission_id]
    df = store["telemetry"]
    anomalies = df[df["is_anomalous"]].copy()

    # First anomaly per component
    first_anomalies = anomalies.sort_values("mission_day").groupby("component_id").first().reset_index()

    return {
        "mission_id": mission_id,
        "total_anomalous_events": len(anomalies),
        "anomalous_components": int(anomalies["component_id"].nunique()),
        "first_anomalies": first_anomalies.to_dict(orient="records"),
    }


@router.get("/satellite/{mission_id}/missed-detections")
def get_missed_detections(mission_id: str, db: Session = Depends(get_db)):
    """Get missed detection events for a mission."""
    missed = db.query(MissedDetection).filter(MissedDetection.mission_id == mission_id).all()
    return {
        "mission_id": mission_id,
        "count": len(missed),
        "missed_detections": [
            {
                "component_id": m.component_id,
                "burn_in_decision": m.burn_in_decision,
                "orbit_anomaly_day": m.orbit_anomaly_day,
                "anomaly_type": m.anomaly_type,
                "description": m.description,
            }
            for m in missed
        ],
    }


@router.get("/satellite/{mission_id}/summary")
def get_mission_summary(mission_id: str):
    """Full mission summary with health metrics."""
    if mission_id not in _mission_store:
        raise HTTPException(status_code=404, detail="Mission not found")

    store = _mission_store[mission_id]
    df = store["telemetry"]

    total_comps = len(store["component_ids"])
    anomalous_comps = df[df["is_anomalous"]]["component_id"].nunique()
    healthy_comps = total_comps - anomalous_comps
    health_score = round(healthy_comps / total_comps * 100, 1) if total_comps > 0 else 100.0

    archetype_dist = {
        k: sum(1 for v in store["archetypes"].values() if v == k)
        for k in set(store["archetypes"].values())
    }

    return {
        "mission_id": mission_id,
        "lot_id": store["lot_id"],
        "total_components": total_comps,
        "healthy_components": healthy_comps,
        "anomalous_components": anomalous_comps,
        "health_score": health_score,
        "mission_days": store["mission_days"],
        "archetype_distribution": archetype_dist,
        "status": "SIMULATED MISSION — NOT REAL SPACECRAFT DATA",
    }


@router.get("/missions")
def list_missions(db: Session = Depends(get_db)):
    missions = db.query(Mission).all()
    return [
        {
            "mission_id": m.mission_id,
            "lot_id": m.lot_id,
            "components_launched": m.components_launched,
            "status": m.status,
            "start_date": m.start_date.isoformat() if m.start_date else None,
        }
        for m in missions
    ]
