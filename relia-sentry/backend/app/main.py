"""ReliaSentry FastAPI Application Entry Point"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.api import data, models_api, screening, components, simulation, telemetry, reports, feedback

# Create all database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ReliaSentry API",
    description="AI-Assisted Burn-In Reliability Screening & Satellite Mission Simulation",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(models_api.router, prefix="/api/models", tags=["Models"])
app.include_router(screening.router, prefix="/api/screening", tags=["Screening"])
app.include_router(components.router, prefix="/api/components", tags=["Components"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["Simulation"])
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["Telemetry"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])

@app.on_event("startup")
def startup_event():
    try:
        from app.ml.xgboost_predictor import get_predictor
        from app.ml.isolation_forest import get_detector
        p = get_predictor()
        d = get_detector()
        p_ok = p.load()
        d_ok = d.load()
        print(f"[STARTUP] Models loaded: XGBoost={p_ok} ({len(p.models)} params), IsolationForest={d_ok}")
    except Exception as e:
        print(f"[STARTUP ERROR] Model loading: {e}")

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ReliaSentry API", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
