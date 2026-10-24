"use client";

import { PageHeader } from "../../../components/common/ui";
import { ScrutinyWorkbench } from "../../../components/scrutiny/ScrutinyWorkbench";

export default function ReviewPage() {
  return (
    <div>
      <PageHeader
        title="SAC/SHC cases"
        description="Cases assigned to the further-review stage: read prior scrutiny observations and EVC reports, record review observations and submit a recommendation."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "SAC/SHC Cases" }]}
      />
      <ScrutinyWorkbench
        stages={["sac_review"]}
        emptyTitle="No cases awaiting SAC/SHC review"
        emptyHint="Cases arrive here after a completed EVC report when the configured workflow routes them to review."
        tabLabels={["Communications", "Documents", "Checklist"]}
      />
    </div>
  );
}
