"""Configurable workflow engine (backend source of truth).

Applications carry their workflow version; stages, transitions, prerequisites,
reason requirements and side effects are all defined in database rows that
system administrators can configure — nothing regulatory is hardcoded in the
frontend, and the LLM can never change workflow state (only `execute()` on
behalf of an authorized, authenticated user can).

Status-vs-stage separation: each stage entry sets a layered status so an
application can be in the `scrutiny` STAGE with `clarification_required` STATUS.

Deadlines are INTERNAL OPERATIONAL TARGETS (stage target_days, calendar days in
this prototype — business-day calendars are a documented limitation). They are
never presented as statutory deadlines.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.log import get_logger
from app.models.orm_models import (
    Application,
    ChecklistItem,
    Document,
    EvcCase,
    Task,
    User,
    WorkflowStage,
    WorkflowTransition,
    WorkflowVersion,
    utcnow,
)
from app.services import audit_service, notification_service

log = get_logger("workflow")

STATE_OPEN, STATE_CLOSED = "open", "closed"


class WorkflowError(Exception):
    def __init__(self, message: str, code: str = "workflow_error"):
        super().__init__(message)
        self.code = code


class WorkflowForbidden(WorkflowError):
    def __init__(self, message: str):
        super().__init__(message, "forbidden")


STATUS_ON_STAGE_ENTER: dict[str, str] = {
    "draft": "draft",
    "intake_validation": "submitted",
    "scrutiny": "awaiting_scrutiny",
    "clarification": "clarification_required",
    "re_scrutiny": "re_scrutiny",
    "evc": "evc_pending",
    "sac_review": "awaiting_review",
    "decision": "awaiting_decision",
    "closed": "closed",
}


@dataclass
class EngineTransitionView:
    action: str
    label: str
    to_stage: str
    requires_reason: bool
    allowed: bool
    blocked_reason: str | None = None

    def as_json(self) -> dict:
        return {
            "action": self.action,
            "label": self.label,
            "to_stage": self.to_stage,
            "requires_reason": self.requires_reason,
            "allowed": self.allowed,
            "blocked_reason": self.blocked_reason,
        }


def _deadline_for_stage(stage: WorkflowStage) -> datetime | None:
    if stage.target_days is None:
        return None
    return utcnow() + timedelta(days=stage.target_days)


def _required_doc_types_missing(db: Session, app: Application, req: list[str]) -> list[str]:
    if not req:
        return []
    have = {
        d.doc_type
        for d in db.query(Document).filter(
            Document.application_id == app.id, Document.is_current_version.is_(True)
        )
    }
    return [r for r in req if r not in have]


def _checklist_complete(db: Session, app: Application) -> bool:
    items = db.query(ChecklistItem).filter(ChecklistItem.application_id == app.id).all()
    bad = [i for i in items if i.required and i.status in ("pending", "deficient")]
    return not bad


# ---------------------------------------------------------------------------
# prerequisite checks (declarative, version-driven); return None when met,
# otherwise a human-readable blocking reason
# ---------------------------------------------------------------------------


def check_mandatory_fields(db: Session, app: Application, ctx: dict) -> str | None:
    if (
        bool((app.title or "").strip())
        and bool(app.category)
        and bool((app.academic_year or "").strip())
        and bool(app.programmes)
    ):
        return None
    return "Title, category, academic year and at least one programme must be filled before submitting"


def check_required_docs(db: Session, app: Application, ctx: dict) -> str | None:
    missing = _required_doc_types_missing(db, app, ctx.get("required_doc_types") or [])
    if not missing:
        return None
    return "Required document(s) missing: " + ", ".join(missing)


def check_checklist_complete(db: Session, app: Application, ctx: dict) -> str | None:
    if _checklist_complete(db, app):
        return None
    return "All required checklist items must be resolved before proceeding"


def check_evc_completed(db: Session, app: Application, ctx: dict) -> str | None:
    evc = db.query(EvcCase).filter(EvcCase.application_id == app.id).first()
    if evc is not None and evc.status == "completed":
        return None
    return "The EVC case must be completed (visit held and report submitted) before leaving the EVC stage"


PREREQ_CHECKS: dict[str, tuple] = {
    "mandatory_fields_complete": check_mandatory_fields,
    "required_docs_present": check_required_docs,
    "checklist_complete": check_checklist_complete,
    "evc_report_present": check_evc_completed,
}


class WorkflowEngine:
    def __init__(self, db: Session):
        self.db = db

    # -- version / stage helpers -------------------------------------------------

    def version(self, app: Application) -> WorkflowVersion:
        v = (
            self.db.query(WorkflowVersion)
            .filter(
                WorkflowVersion.workflow_id == app.workflow_id,
                WorkflowVersion.version_no == app.workflow_version_no,
            )
            .first()
        )
        if v is None:
            raise WorkflowError("Workflow version missing for application")
        return v

    def stage(self, app: Application, key: str | None = None) -> WorkflowStage | None:
        key = key or app.current_stage
        return next((s for s in self.version(app).stages if s.key == key), None)

    def stage_map(self, app: Application) -> dict[str, WorkflowStage]:
        return {s.key: s for s in self.version(app).stages}

    # -- valid actions -----------------------------------------------------------

    def _evaluate(self, app: Application, tr: WorkflowTransition) -> tuple[bool, str | None, dict[str, WorkflowStage]]:
        stage_map = self.stage_map(app)
        allowed = True
        blocked: str | None = None
        # Documents required to leave the source stage (e.g. a draft's own
        # checklist) plus documents the target stage demands — both govern the
        # same `required_docs_present` prerequisite.
        from_stage = stage_map.get(tr.from_stage)
        to_stage = stage_map.get(tr.to_stage)
        ctx = {
            "required_doc_types": list(
                dict.fromkeys(
                    (from_stage.required_doc_types or []) + (to_stage.required_doc_types or [])
                )
            )
        }
        for prereq in tr.prerequisites or []:
            fn = PREREQ_CHECKS.get(prereq)
            if fn is None:
                log.warning("unknown prerequisite %r on transition %s", prereq, tr.action)
                continue
            problem = fn(self.db, app, ctx)
            if problem:
                allowed = False
                blocked = problem
                break
        return allowed, blocked, stage_map

    def valid_actions(self, app: Application, user: User) -> list[EngineTransitionView]:
        version = self.version(app)
        out: list[EngineTransitionView] = []
        for tr in version.transitions:
            if tr.from_stage != app.current_stage:
                continue
            role_allowed = user.role in (tr.allowed_roles or [])
            prereq_ok, blocked, _ = self._evaluate(app, tr)
            allowed = role_allowed and prereq_ok
            if not role_allowed:
                blocked = blocked or f"Not permitted for role '{user.role}'"
            out.append(
                EngineTransitionView(
                    action=tr.action,
                    label=tr.label,
                    to_stage=tr.to_stage,
                    requires_reason=tr.requires_reason,
                    allowed=allowed,
                    blocked_reason=blocked,
                )
            )
        return out

    def next_action_text(self, app: Application, user: User) -> str | None:
        stage = self.stage(app)
        actions = self.valid_actions(app, user)
        mine = [a for a in actions if a.allowed]
        if mine:
            return f"{mine[0].label} (stage: {app.current_stage})"
        owners = ", ".join(stage.owner_roles or []) if stage else ""
        has_actions = any(a.allowed for _ in [0])  # actions exist for some role? keep simple below
        open_for_anyone = [a for a in actions] or []
        if not open_for_anyone:
            return f"Stage '{app.current_stage}' has no configured outgoing action"
        return f"Waiting on {owners or 'responsible role'} at stage '{app.current_stage}'"

    # -- execution ---------------------------------------------------------------

    def execute(
        self,
        app: Application,
        user: User,
        *,
        action: str,
        reason: str | None = None,
        note: str | None = None,
        meta: dict | None = None,
    ) -> dict:
        version = self.version(app)
        tr: WorkflowTransition | None = next(
            (t for t in version.transitions if t.from_stage == app.current_stage and t.action == action),
            None,
        )
        if tr is None:
            raise WorkflowError(
                f"Action '{action}' is not valid at stage '{app.current_stage}'", "invalid_transition"
            )
        if user.role not in (tr.allowed_roles or []):
            raise WorkflowForbidden(
                f"Role '{user.role}' may not perform '{action}' (requires one of: {', '.join(tr.allowed_roles or [])})"
            )

        stage_map = self.stage_map(app)
        target_stage = stage_map.get(tr.to_stage)
        source_stage = stage_map.get(tr.from_stage)
        ctx = {
            "required_doc_types": list(
                dict.fromkeys(
                    (source_stage.required_doc_types or []) + (target_stage.required_doc_types or [])
                )
            )
        }
        problem = None
        for prereq in tr.prerequisites or []:
            fn = PREREQ_CHECKS.get(prereq)
            if fn is None:
                continue
            problem = fn(self.db, app, ctx)
            if problem:
                break
        if problem:
            raise WorkflowError(problem, "prerequisite_unmet")

        if tr.requires_reason and not (reason or "").strip():
            raise WorkflowError(f"A reason is required for '{action}'", "reason_required")

        previous = {"stage": app.current_stage, "status": app.status, "state": app.state}

        app.current_stage = tr.to_stage
        now = utcnow()
        app.stage_started_at = now
        app.stage_deadline = _deadline_for_stage(target_stage) if target_stage else None
        app.status = STATUS_ON_STAGE_ENTER.get(tr.to_stage, app.status)
        if tr.to_stage == "closed":
            app.state = STATE_CLOSED
            app.closed_at = now
            # the transition action determines the recorded outcome
            if "approve" in action:
                app.decision = "approved"
                app.status = "approved"
            elif "reject" in action:
                app.decision = "rejected"
                app.status = "rejected"
            elif "hold" in action:
                app.decision = "on_hold"
                app.status = "on_hold"
            else:
                app.decision = "closed"
                app.status = "closed"
            app.decision_reason = reason
            app.decision_at = now
            app.decided_by = user.id

        self._apply_side_effects(app, user, tr, target_stage)
        # track how many times a case has been returned for clarification so the
        # delay-risk radar can flag repeated returns (spec §12)
        if tr.to_stage == "clarification":
            app.stage_return_count = (app.stage_return_count or 0) + 1
        app.updated_at = now
        app.next_action = None  # recomputed lazily by valid_actions

        audit_service.record_event(
            self.db,
            actor=user,
            action=f"workflow.{action}",
            entity_type="application",
            entity_id=app.id,
            application_id=app.id,
            previous_state=previous,
            new_state={
                "stage": app.current_stage,
                "status": app.status,
                "state": app.state,
                "to_stage": tr.to_stage,
            },
            reason=reason,
            meta=meta or {},
        )
        self.db.flush()
        return {"transition": tr.action, "stage": app.current_stage, "status": app.status}

    # -- side effects --------------------------------------------------------

    def _apply_side_effects(self, app: Application, user: User, tr: WorkflowTransition, target_stage) -> None:
        # attach checklist when entering a review stage with a checklist template
        if target_stage is not None and target_stage.checklist:
            existing = {i.key for i in self.db.query(ChecklistItem).filter(ChecklistItem.application_id == app.id)}
            for item in target_stage.checklist:
                if item["key"] not in existing:
                    self.db.add(
                        ChecklistItem(
                            application_id=app.id,
                            key=item["key"],
                            label=item["label"],
                            required=bool(item.get("required", True)),
                        )
                    )

        # create the EVC case when entering the EVC stage
        if tr.to_stage == "evc" and tr.from_stage != "evc":
            existing = self.db.query(EvcCase).filter(EvcCase.application_id == app.id).first()
            if existing is None:
                ec = EvcCase(application_id=app.id, status="ready_to_schedule")
                self.db.add(ec)
                self.db.flush()
                notification_service.notify_role(
                    self.db,
                    role="evc_coordinator",
                    type="evc_scheduling_required",
                    title=f"EVC scheduling required for {app.ref_no}",
                    body="A workflow transition created an EVC case that is ready to schedule.",
                    severity="warning",
                    link_path=f"/applications/{app.id}",
                    application_id=app.id,
                    idempotency_key=f"evc:create:{app.id}",
                )

        if tr.to_stage == "closed":
            for t in self.db.query(Task).filter(Task.application_id == app.id, Task.status == "open"):
                t.status = "cancelled"

        self._notify_stage_entry(app, tr, target_stage)

    def _notify_stage_entry(self, app: Application, tr: WorkflowTransition, target_stage) -> None:
        roles = (target_stage.owner_roles if target_stage else []) or []
        for role in roles:
            if role == "institution":
                from app.models.orm_models import User as U

                inst_users = (
                    self.db.query(U)
                    .filter(U.institution_id == app.institution_id, U.is_active.is_(True))
                    .all()
                )
                for u in inst_users:
                    notification_service.notify(
                        self.db,
                        recipient=u,
                        type="application.stage_update",
                        title=f"{app.ref_no}: {tr.label}",
                        body=f"Application {app.ref_no} moved to stage '{tr.to_stage}'.",
                        link_path=f"/applications/{app.id}",
                        application_id=app.id,
                        idempotency_key=f"stage:{app.id}:{tr.action}:{u.id}",
                    )
                continue
            notification_service.notify_role(
                self.db,
                role=role,
                type="application.assigned_action",
                title=f"{app.ref_no} requires action: {tr.label}",
                body=f"Application {app.ref_no} entered stage '{tr.to_stage}' (from '{tr.from_stage}'). Please review.",
                severity="info",
                link_path=f"/applications/{app.id}",
                application_id=app.id,
                idempotency_key=f"stage:{app.id}:{tr.action}:{role}",
            )
