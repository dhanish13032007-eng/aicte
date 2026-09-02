"""Telemetry streaming API"""
from fastapi import APIRouter
router = APIRouter()

@router.get("/stream/{mission_id}")
def stream_telemetry(mission_id: str, day: int = 0):
    """Get telemetry snapshot at a specific mission day."""
    from app.api.simulation import _mission_store
    if mission_id not in _mission_store:
        return {"error": "Mission not found"}
    store = _mission_store[mission_id]
    df = store["telemetry"]
    day_data = df[df["mission_day"] == day]
    return {
        "mission_id": mission_id,
        "day": day,
        "telemetry": day_data.to_dict(orient="records"),
        "anomaly_count": int(day_data["is_anomalous"].sum()),
    }
