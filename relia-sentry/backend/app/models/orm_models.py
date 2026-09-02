"""SQLAlchemy ORM Models for ReliaSentry"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Lot(Base):
    __tablename__ = "lots"
    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(String, unique=True, index=True)
    component_type = Column(String, default="IC")
    total_components = Column(Integer)
    burn_in_duration = Column(Integer, default=168)
    temperature = Column(Float, default=125.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    components = relationship("Component", back_populates="lot")


class Component(Base):
    __tablename__ = "components"
    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(String, unique=True, index=True)
    lot_id = Column(String, ForeignKey("lots.lot_id"), index=True)
    behavior_type = Column(String, default="Healthy")
    risk_score = Column(Float, nullable=True)
    decision = Column(String, nullable=True)  # PASS / REVIEW / REJECT
    anomaly_score = Column(Float, nullable=True)
    predicted_168h = Column(Float, nullable=True)
    actual_168h = Column(Float, nullable=True)
    prediction_error = Column(Float, nullable=True)
    review_status = Column(String, default="PENDING")
    assigned_to = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lot = relationship("Lot", back_populates="components")
    measurements = relationship("Measurement", back_populates="component")
    predictions = relationship("Prediction", back_populates="component")


class Measurement(Base):
    __tablename__ = "measurements"
    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(String, ForeignKey("components.component_id"), index=True)
    checkpoint = Column(Integer)  # 0, 24, 96, 168
    voltage = Column(Float)
    current = Column(Float)
    resistance = Column(Float)
    leakage_current = Column(Float)
    power_consumption = Column(Float)
    temperature = Column(Float)
    frequency = Column(Float)
    noise = Column(Float)
    component = relationship("Component", back_populates="measurements")


class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(String, ForeignKey("components.component_id"), index=True)
    parameter = Column(String)
    predicted_value = Column(Float)
    confidence_lower = Column(Float, nullable=True)
    confidence_upper = Column(Float, nullable=True)
    actual_value = Column(Float, nullable=True)
    prediction_error = Column(Float, nullable=True)
    model_version = Column(String, default="xgb-v1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    component = relationship("Component", back_populates="predictions")


class ModelStatus(Base):
    __tablename__ = "model_status"
    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String, unique=True)
    is_trained = Column(Boolean, default=False)
    training_samples = Column(Integer, nullable=True)
    validation_samples = Column(Integer, nullable=True)
    test_samples = Column(Integer, nullable=True)
    mae = Column(Float, nullable=True)
    rmse = Column(Float, nullable=True)
    version = Column(String, default="v1")
    trained_at = Column(DateTime(timezone=True), nullable=True)
    feature_importance = Column(JSON, nullable=True)


class Mission(Base):
    __tablename__ = "missions"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(String, unique=True, index=True)
    lot_id = Column(String, ForeignKey("lots.lot_id"))
    components_launched = Column(Integer)
    start_date = Column(DateTime(timezone=True), server_default=func.now())
    current_day = Column(Integer, default=0)
    status = Column(String, default="PRE_LAUNCH")  # PRE_LAUNCH / ORBIT / ANOMALY / COMPLETE
    health_score = Column(Float, default=100.0)
    telemetry_events = relationship("TelemetryEvent", back_populates="mission")


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(String, ForeignKey("missions.mission_id"), index=True)
    component_id = Column(String, index=True)
    mission_day = Column(Integer)
    power_consumption = Column(Float)
    current = Column(Float)
    voltage = Column(Float)
    temperature = Column(Float)
    frequency = Column(Float)
    signal_strength = Column(Float)
    is_anomalous = Column(Boolean, default=False)
    anomaly_type = Column(String, nullable=True)
    expected_power = Column(Float, nullable=True)
    deviation_pct = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    mission = relationship("Mission", back_populates="telemetry_events")


class MissedDetection(Base):
    __tablename__ = "missed_detections"
    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(String, index=True)
    mission_id = Column(String)
    burn_in_decision = Column(String)
    orbit_anomaly_day = Column(Integer)
    anomaly_type = Column(String)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FeedbackCycle(Base):
    __tablename__ = "feedback_cycles"
    id = Column(Integer, primary_key=True, index=True)
    cycle_number = Column(Integer)
    lot_id = Column(String)
    missed_detections = Column(Integer)
    detection_rate = Column(Float)
    false_positive_rate = Column(Float)
    previous_threshold = Column(Float)
    new_threshold = Column(Float)
    adjustment_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
