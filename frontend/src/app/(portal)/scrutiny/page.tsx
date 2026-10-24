"use client";

import { PageHeader } from "../../../components/common/ui";
import { ScrutinyWorkbench } from "../../../components/scrutiny/ScrutinyWorkbench";

export default function ScrutinyPage() {
  return (
    <div>
      <PageHeader
        title="Scrutiny & re-scrutiny"
        description="Cases awaiting scrutiny action. Work the checklist, review extracted document fields, and return cases for clarification with a recorded reason."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Scrutiny & Re-scrutiny" }]}
      />
      <ScrutinyWorkbench
        stages={["scrutiny", "re_scrutiny", "intake_validation"]}
        emptyTitle="No cases awaiting scrutiny"
        emptyHint="Cases appear here when the workflow routes them into scrutiny or intake validation."
      />
    </div>
  );
}
