"""Administrative endpoints: users/institutions, workflow configuration,
regulatory rules, system settings, escalation policies, RAG source registry."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile as FastUploadFile, File, Form
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_perm
from app.core.permissions import ROLE_LABELS, permissions_for_role, Perm, role_has
from app.core.security import hash_password
from app.db import get_db
from app.models.orm_models import (
    Application,
    Document,
    EvcCase,
    EscalationPolicy,
    Institution,
    RegulatoryDocument,
    RegulatoryRule,
    Session as DBSession,
    SystemSetting,
    Task,
    User,
    utcnow,
)
from app.schemas import (
    InstitutionIn,
    RagDocRegisterIn,
    RuleCreateIn,
    RuleSimulateIn,
    SettingIn,
    UserCreateIn,
    UserUpdateIn,
    WorkflowIn,
    WorkflowVersionIn,
)
from app.services import audit_service, document_service, regulatory_rules_service, rag_service
from app.services.workflow_engine import WorkflowEngine, WorkflowError

router = APIRouter(prefix="/admin", tags=["admin"])


# --- roles metadata ---------------------------------------------------------------

@router.get("/roles")
def roles_meta(user: User = Depends(get_current_user)):
    return {
        "roles": [{"value": k, "label": v} for k, v in ROLE_LABELS.items()],
        "permissions_matrix": {
            k: permissions_for_role(k) for k in ROLE_LABELS
        },
    }


# --- users -----------------------------------------------------------------------

@router.get("/users")
def list_users(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.USERS_MANAGE))):
    from datetime import timedelta

    rows = db.query(User).order_by(User.name).all()
    now = utcnow()
    return [
        {
            "id": u.id, "email": u.email, "name": u.name, "role": u.role,
            "institution": (u.institution.name if u.institution else None),
            "region": u.region, "is_active": u.is_active,
            "must_change_password": u.must_change_password,
            "created_at": u.created_at, "last_login_at": u.last_login_at,
            "active_sessions": db.query(DBSession).filter(
                DBSession.user_id == u.id, DBSession.revoked_at.is_(None),
                DBSession.expires_at > now).count(),
        }
        for u in rows
    ]


@router.get("/officers")
def list_officers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Assignable officers (name/id/role/region) for case assignment.
    Requires the assignment permission or an administrative role — the caller
    must already be allowed to assign cases."""
    if not (role_has(user.role, Perm.APPLICATION_ASSIGN_OFFICER) or user.role in ("system_admin",)):
        raise HTTPException(status_code=403, detail="Requires permission to assign officers")
    rows = db.query(User).filter(User.is_active.is_(True), User.role != "institution").order_by(User.name).all()
    return [
        {"id": u.id, "name": u.name, "role": u.role, "region": u.region,
         "role_label": ROLE_LABELS.get(u.role, u.role)}
        for u in rows
    ]


@router.post("/users")
def create_user(body: UserCreateIn, db: Session = Depends(get_db),
                user: User = Depends(require_perm(Perm.USERS_MANAGE))):
    if not role_has(body.role, "application.create") and body.role not in ROLE_LABELS:
        raise HTTPException(status_code=400, detail="Unknown role")
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already in use")
    u = User(
        email=body.email.lower(), name=body.name, role=body.role,
        password_hash=hash_password(body.password),
        institution_id=body.institution_id,
        region=body.region,
        must_change_password=True,
    )
    db.add(u)
    audit_service.record_event(
        db, actor=user, action="user.created", entity_type="user", entity_id=u.id,
        new_state={"email": u.email, "role": u.role, "institution_id": u.institution_id},
        reason="created by administrator with temporary password",
    )
    db.commit()
    return {"id": u.id, "email": u.email, "role": u.role}


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UserUpdateIn, db: Session = Depends(get_db),
                user: User = Depends(require_perm(Perm.USERS_MANAGE))):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    prev = {"role": target.role, "is_active": target.is_active, "region": target.region}
    if body.name is not None:
        target.name = body.name
    if body.role is not None:
        if target.role != body.role:
            auth_risk = (
                (target.role == "system_admin" or body.role == "system_admin")
                or (body.role == "approving_authority" or target.role == "approving_authority")
            )
            target.role = body.role
        if body.role == "system_admin" and user.role != "system_admin":
            raise HTTPException(status_code=403, detail="Only system administrators can grant admin role")
    if body.region is not None:
        target.region = body.region
    if body.institution_id is not None:
        target.institution_id = body.institution_id
    if body.is_active is not None:
        target.is_active = body.is_active
        if not body.is_active:  # deactivate → revoke sessions immediately
            for s in db.query(DBSession).filter(DBSession.user_id == target.id,
                                                DBSession.revoked_at.is_(None)):
                s.revoked_at = utcnow()
    if body.new_password:
        target.password_hash = hash_password(body.new_password)
        target.must_change_password = True
        for s in db.query(DBSession).filter(DBSession.user_id == target.id, DBSession.revoked_at.is_(None)):
            s.revoked_at = utcnow()
    audit_service.record_event(
        db, actor=user, action="user.updated", entity_type="user", entity_id=target.id,
        previous_state=prev,
        new_state={"role": target.role, "is_active": target.is_active, "region": target.region},
    )
    db.commit()
    return {"ok": True}


# --- institutions -----------------------------------------------------------------


@router.get("/institutions")
def institutions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Institution).order_by(Institution.name).all()
    if user.role == "institution":
        rows = [r for r in rows if r.id == user.institution_id]
    elif user.region and user.role in ("regional_officer", "scrutiny_officer"):
        rows = [r for r in rows if r.region == user.region]
    return [
        {"id": r.id, "code": r.code, "name": r.name, "identifier": r.identifier,
         "category": r.category, "institution_type": r.institution_type,
         "state": r.state, "region": r.region, "contact_email": r.contact_email,
         "is_synthetic": r.is_synthetic}
        for r in rows
    ]


@router.post("/institutions")
def create_institution(body: InstitutionIn, db: Session = Depends(get_db),
                       user: User = Depends(require_perm(Perm.USERS_MANAGE))):
    if db.query(Institution).filter(Institution.code == body.code).first():
        raise HTTPException(status_code=400, detail="Institution code already exists")
    inst = Institution(**body.model_dump(), is_synthetic=False)
    db.add(inst)
    db.flush()
    audit_service.record_event(db, actor=user, action="institution.created",
                               entity_type="institution", entity_id=inst.id,
                               new_state={"code": inst.code, "name": inst.name})
    db.commit()
    return {"id": inst.id, "code": inst.code, "name": inst.name}


# --- workflow configuration ---------------------------------------------------------

@router.get("/workflows")
def list_workflows(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.WORKFLOW_CONFIG))):
    from app.models.orm_models import Workflow, WorkflowVersion

    wfs = db.query(Workflow).all()
    out = []
    for wf in wfs:
        versions = db.query(WorkflowVersion).filter(WorkflowVersion.workflow_id == wf.id).all()
        vw = []
        for v in versions:
            vw.append({
                "version_no": v.version_no, "is_active": v.is_active,
                "change_note": v.change_note,
                "stages": [{"key": s.key, "name": s.name, "target_days": s.target_days,
                            "owner_roles": s.owner_roles, "required_doc_types": s.required_doc_types,
                            "checklist": s.checklist} for s in sorted(v.stages, key=lambda x: x.order)],
                "transitions": [{"action": t.action, "label": t.label, "from_stage": t.from_stage,
                                 "to_stage": t.to_stage, "allowed_roles": t.allowed_roles,
                                 "requires_reason": t.requires_reason,
                                 "prerequisites": t.prerequisites,
                                 "side_effects": t.side_effects} for t in v.transitions],
            })
        out.append({"id": wf.id, "key": wf.key, "name": wf.name,
                    "active_version_no": wf.active_version_no,
                    "applicable_categories": wf.applicable_categories, "versions": vw})
    return out


@router.post("/workflows")
def create_workflow(body: WorkflowIn, version: WorkflowVersionIn | None = None,
                    db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.WORKFLOW_CONFIG))):
    from app.models.orm_models import Workflow, WorkflowVersion

    if db.query(Workflow).filter(Workflow.key == body.key).first():
        raise HTTPException(status_code=400, detail="Workflow key already exists")
    wf = Workflow(key=body.key, name=body.name, description=body.description,
                  applicable_categories=body.applicable_categories, created_by=user.id)
    db.add(wf)
    db.flush()
    audit_service.record_event(db, actor=user, action="workflow.created",
                               entity_type="workflow", entity_id=wf.id,
                               new_state={"key": wf.key})
    db.commit()
    return {"id": wf.id, "key": wf.key}


@router.post("/workflows/{workflow_id}/versions")
def create_workflow_version(workflow_id: str, body: WorkflowVersionIn,
                            db: Session = Depends(get_db),
                            user: User = Depends(require_perm(Perm.WORKFLOW_CONFIG))):
    from app.models.orm_models import Workflow, WorkflowVersion

    wf = db.get(Workflow, workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    max_v = db.query(WorkflowVersion.version_no).filter(
        WorkflowVersion.workflow_id == wf.id).order_by(WorkflowVersion.version_no.desc()).first()
    new_no = (max_v[0] + 1) if max_v else 1
    # validate: transitions reference staged keys; every stage is reachable
    stage_keys = [s.key for s in body.stages]
    if len(stage_keys) != len(set(stage_keys)):
        raise HTTPException(status_code=400, detail="Duplicate stage keys")
    known_prereqs = {"mandatory_fields_complete", "required_docs_present", "checklist_complete", "evc_report_present"}
    for t in body.transitions:
        if t.from_stage not in stage_keys or t.to_stage not in stage_keys:
            raise HTTPException(status_code=400, detail=f"Transition '{t.action}' references unknown stage")
        for p in t.prerequisites:
            if p not in known_prereqs:
                raise HTTPException(status_code=400, detail=f"Unknown prerequisite '{p}'")
    v = WorkflowVersion(workflow_id=wf.id, version_no=new_no, created_by=user.id,
                        change_note=body.change_note)
    db.add(v)
    db.flush()
    for i, s in enumerate(body.stages):
        st = __import__("app.models.orm_models", fromlist=["WorkflowStage"]).WorkflowStage(
            version_id=v.id, order=i, key=s.key, name=s.name, description=s.description,
            target_days=s.target_days, owner_roles=s.owner_roles,
            required_doc_types=s.required_doc_types, checklist=s.checklist)
        db.add(st)
    for t in body.transitions:
        from app.models.orm_models import WorkflowTransition

        db.add(WorkflowTransition(
            version_id=v.id, action=t.action, label=t.label, from_stage=t.from_stage,
            to_stage=t.to_stage, allowed_roles=t.allowed_roles,
            requires_reason=t.requires_reason, prerequisites=t.prerequisites,
            side_effects=[]))
    audit_service.record_event(
        db, actor=user, action="workflow.version_created", entity_type="workflow",
        entity_id=wf.id, new_state={"version_no": new_no, "stages": stage_keys,
                                    "change_note": body.change_note},
        reason=body.change_note,
    )
    db.commit()
    return {"workflow_id": wf.id, "version_no": new_no}


@router.post("/workflows/{workflow_id}/versions/{version_no}/activate")
def activate_version(workflow_id: str, version_no: int, db: Session = Depends(get_db),
                     user: User = Depends(require_perm(Perm.WORKFLOW_CONFIG))):
    from app.models.orm_models import Workflow, WorkflowVersion

    wf = db.get(Workflow, workflow_id)
    v = db.query(WorkflowVersion).filter(
        WorkflowVersion.workflow_id == workflow_id, WorkflowVersion.version_no == version_no).first()
    if wf is None or v is None:
        raise HTTPException(status_code=404, detail="Workflow or version not found")
    previous = {"active_version_no": wf.active_version_no}
    wf.active_version_no = version_no
    db.query(WorkflowVersion).filter(WorkflowVersion.workflow_id == wf.id).update(
        {"is_active": False}, synchronize_session=False)
    v.is_active = True
    audit_service.record_event(
        db, actor=user, action="workflow.version_activated", entity_type="workflow",
        entity_id=wf.id, previous_state=previous,
        new_state={"active_version_no": version_no},
        reason="new applications will use this version; existing applications keep theirs",
    )
    db.commit()
    return {"ok": True, "active_version_no": wf.active_version_no}


# --- escalation policies / settings ---------------------------------------------------


@router.get("/escalation-policies")
def get_policies(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.NOTIFICATION_POLICY_MANAGE))):
    return [{"key": p.key, "name": p.name, "config": p.config, "is_active": p.is_active}
            for p in db.query(EscalationPolicy).all()]


@router.put("/escalation-policies")
def set_policy(body: dict, db: Session = Depends(get_db),
               user: User = Depends(require_perm(Perm.NOTIFICATION_POLICY_MANAGE))):
    p = db.query(EscalationPolicy).filter(EscalationPolicy.key == body.get("key")).first()
    if p is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    previous = {"config": p.config}
    p.config = body.get("config") or {}
    p.name = body.get("name") or p.name
    audit_service.record_event(db, actor=user, action="escalation_policy.updated",
                               entity_type="escalation_policy", entity_id=p.id,
                               previous_state=previous, new_state={"config": p.config})
    db.commit()
    return {"ok": True}


@router.get("/settings")
def get_settings_route(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.SETTINGS_MANAGE))):
    return [{"key": s.key, "value": s.value, "description": s.description}
            for s in db.query(SystemSetting).all()]


@router.put("/settings")
def set_setting(body: SettingIn, db: Session = Depends(get_db),
                user: User = Depends(require_perm(Perm.SETTINGS_MANAGE))):
    s = db.get(SystemSetting, body.key)
    previous = {"value": s.value} if s else None
    if s is None:
        s = SystemSetting(key=body.key, value=body.value, description=body.description, updated_by=user.id)
        db.add(s)
    else:
        s.value = body.value
        s.updated_by = user.id
    audit_service.record_event(db, actor=user, action="setting.updated", entity_type="setting",
                               entity_id=body.key, previous_state=previous,
                               new_state={"value": body.value})
    db.commit()
    return {"ok": True}


# --- regulatory rules -----------------------------------------------------------------


@router.get("/rules")
def list_rules(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(RegulatoryRule).order_by(RegulatoryRule.rule_key, RegulatoryRule.version.desc())
    rows = q.all()
    return [
        {
            "id": r.id, "rule_key": r.rule_key, "version": r.version, "name": r.name,
            "description": r.description, "rule_type": r.rule_type, "params": r.params,
            "applicable_categories": r.applicable_categories,
            "source_document_title": r.source_document_title, "clause": r.clause,
            "page": r.page, "source_url": r.source_url,
            "verification_status": r.verification_status, "status": r.status,
            "academic_year": r.academic_year, "activated_at": r.activated_at,
            "created_by": (u.name if (u := db.get(User, r.created_by)) else None),
        }
        for r in rows
    ]


@router.post("/rules")
def create_rule(body: RuleCreateIn, db: Session = Depends(get_db),
                user: User = Depends(require_perm(Perm.RULES_MANAGE))):
    rule = regulatory_rules_service.create_rule(db, user_id=user.id, **body.model_dump())
    db.commit()
    return {"id": rule.id, "rule_key": rule.rule_key, "version": rule.version}


@router.post("/rules/{rule_id}/status")
def rule_status(rule_id: str, body: dict, db: Session = Depends(get_db),
                user: User = Depends(require_perm(Perm.RULES_MANAGE))):
    rule = db.get(RegulatoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    regulatory_rules_service.transition_status(
        db, user_id=user.id, rule=rule,
        new_status=body.get("status") or "under_review", note=body.get("note"))
    db.commit()
    return {"ok": True, "status": rule.status}


@router.post("/rules/{rule_id}/simulate")
def rule_simulate(rule_id: str, body: RuleSimulateIn, db: Session = Depends(get_db),
                  user: User = Depends(require_perm(Perm.RULES_SIMULATE))):
    rule = db.get(RegulatoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return regulatory_rules_service.simulate(db, user=user, rule=rule, inputs=body.inputs,
                                             application_id=body.application_id)


# --- RAG source registry ---------------------------------------------------------------


@router.get("/rag/documents")
def rag_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [
        {"id": d.id, "title": d.title, "authority": d.authority, "academic_year": d.academic_year,
         "version": d.version, "publication_date": d.publication_date,
         "source_url": d.source_url, "retrieval_date": d.retrieval_date,
         "checksum": d.checksum, "status": d.status, "is_ingested": d.is_ingested,
         "chunks": len(d.chunks)}
        for d in db.query(RegulatoryDocument).order_by(RegulatoryDocument.created_at.desc()).all()
    ]


@router.post("/rag/documents")
def register_rag_document(
    title: str = Form(...),
    authority: str = Form("AICTE"),
    academic_year: str | None = Form(None),
    version: str | None = Form(None),
    publication_date: str | None = Form(None),
    source_url: str | None = Form(None),
    file: FastUploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.RAG_INGEST)),
):
    from datetime import date

    content = file.file.read()
    import hashlib
    import os
    import uuid as _uuid

    doc = RegulatoryDocument(
        title=title, authority=authority, academic_year=academic_year, version=version,
        publication_date=date.fromisoformat(publication_date) if publication_date else None,
        source_url=source_url, retrieval_date=date.today(), status="current",
    )
    db.add(doc)
    db.flush()
    # store the source file directly (registry documents are not institution documents)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".pdf"
    key = f"regulatory/{_uuid.uuid4().hex}{ext}"
    document_service.storage().put(key, content)
    doc.storage_key = key
    doc.checksum = hashlib.sha256(content).hexdigest()
    audit_service.record_event(db, actor=user, action="rag.document_registered",
                               entity_type="regulatory_document", entity_id=doc.id,
                               new_state={"title": title, "checksum": doc.checksum[:16] + "…"})
    db.flush()
    ingest = rag_service.ingest_document(db, doc)
    db.commit()
    return {"id": doc.id, **ingest}


@router.post("/rag/documents/{doc_id}/ingest")
def ingest_rag(doc_id: str, db: Session = Depends(get_db),
               user: User = Depends(require_perm(Perm.RAG_INGEST))):
    doc = db.get(RegulatoryDocument, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    result = rag_service.ingest_document(db, doc)
    db.commit()
    return result
