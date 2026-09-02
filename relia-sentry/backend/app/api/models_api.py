"""Models training and status API"""
import traceback
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.orm_models import ModelStatus
from app.ml.isolation_forest import get_detector
from app.ml.xgboost_predictor import get_predictor
from app.generators.data_generator import generate_historical_data
from app.api.data import get_session

router = APIRouter()


@router.post("/train")
def train_models(db: Session = Depends(get_db)):
    """Train XGBoost and Isolation Forest on historical data."""
    try:
        session = get_session()

        # Generate or use existing historical data
        if "historical" not in session:
            hist_df = generate_historical_data(n_lots=5, components_per_lot=200, base_seed=42)
            session["historical"] = hist_df
        else:
            hist_df = session["historical"]

        # Train Isolation Forest
        detector = get_detector()
        if_result = detector.train(hist_df)

        # Train XGBoost
        predictor = get_predictor()
        xgb_results = predictor.train(hist_df)

        # Save status to DB
        now = datetime.utcnow()
        metrics = predictor.get_overall_metrics()

        for model_name, status_data in [
            ("XGBoost", {
                "is_trained": True,
                "training_samples": predictor.training_samples,
                "validation_samples": predictor.validation_samples,
                "test_samples": predictor.test_samples,
                "mae": metrics.get("avg_mae"),
                "rmse": metrics.get("avg_rmse"),
                "feature_importance": predictor.feature_importance,
            }),
            ("IsolationForest", {
                "is_trained": True,
                "training_samples": if_result.get("samples", 0),
                "mae": None,
                "rmse": None,
            }),
        ]:
            existing = db.query(ModelStatus).filter(ModelStatus.model_name == model_name).first()
            if existing:
                for k, v in status_data.items():
                    setattr(existing, k, v)
                existing.trained_at = now
                existing.version = "v1"
            else:
                obj = ModelStatus(
                    model_name=model_name,
                    trained_at=now,
                    version="v1",
                    **status_data,
                )
                db.add(obj)
        db.commit()

        return {
            "status": "success",
            "isolation_forest": if_result,
            "xgboost": xgb_results,
            "metrics": metrics,
            "training_samples": predictor.training_samples,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}\n{traceback.format_exc()}")


@router.get("/status")
def get_model_status(db: Session = Depends(get_db)):
    """Get training status for all models."""
    statuses = db.query(ModelStatus).all()
    result = {}
    for s in statuses:
        result[s.model_name] = {
            "is_trained": s.is_trained,
            "training_samples": s.training_samples,
            "validation_samples": s.validation_samples,
            "test_samples": s.test_samples,
            "mae": s.mae,
            "rmse": s.rmse,
            "version": s.version,
            "trained_at": s.trained_at.isoformat() if s.trained_at else None,
            "feature_importance": s.feature_importance,
        }

    # Also check in-memory state
    predictor = get_predictor()
    detector = get_detector()
    result["_runtime"] = {
        "xgboost_in_memory": predictor.is_trained,
        "isolation_forest_in_memory": detector.is_trained,
    }
    return result


@router.post("/load")
def load_models():
    """Load pre-trained models from disk."""
    predictor = get_predictor()
    detector = get_detector()
    xgb_loaded = predictor.load()
    if_loaded = detector.load()
    return {
        "xgboost_loaded": xgb_loaded,
        "isolation_forest_loaded": if_loaded,
    }
