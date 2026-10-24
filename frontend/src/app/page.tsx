import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BookOpenText,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileScan,
  GitBranch,
  LineChart,
  ScrollText,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import { Logo } from "../components/layout/Logo";

export default function LandingPage() {
  const capabilities = [
    {
      icon: GitBranch,
      title: "Configurable workflow engine",
      body: "Versioned stages, transitions, prerequisites and reason requirements. The backend validates every transition; invalid or unauthorized actions are refused.",
    },
    {
      icon: FileScan,
      title: "Documents, OCR and expiry",
      body: "Private file storage, SHA-256 integrity, pdfplumber/Tesseract extraction, field confidence, verification workflow and an expiry calendar.",
    },
    {
      icon: Waypoints,
      title: "EVC scheduling & reporting",
      body: "Prerequisite checks before scheduling, proposed/confirmed dates, committee participants, reschedule reasons and overdue-report tracking.",
    },
    {
      icon: ShieldCheck,
      title: "Compliance & undertakings",
      body: "Obligations with cited internal or official sources, evidence submission, authorized verification, reminders and configurable escalation levels.",
    },
    {
      icon: BellRing,
      title: "SLA, alerts and escalations",
      body: "Stage targets, deadline proximity, in-app and email notification records with idempotency keys, retry history and delivery status.",
    },
    {
      icon: LineChart,
      title: "Explainable delay-risk radar",
      body: "Deterministic, weighted signals with per-factor evidence and a recommended next action — prioritization only, never a legal determination.",
    },
    {
      icon: BookOpenText,
      title: "Source-cited handbook assistant",
      body: "Retrieval over registered Approval Process Handbook sources with page-level citations, abstention when evidence is weak, and injection defenses.",
    },
    {
      icon: ScrollText,
      title: "Hash-chained audit trail",
      body: "Append-only events with SHA-256 chaining, verification tooling, actor and role capture, and CSV export for auditors.",
    },
    {
      icon: Building2,
      title: "Role-based, record-level access",
      body: "Ten roles from institution applicant to approving authority and auditor. Permissions are enforced server-side on every endpoint.",
    },
  ];

  const stages = [
    "Institution submits an application with required documents",
    "Intake validation routes the case to scrutiny",
    "Scrutiny officer works the checklist, requests clarification or recommends EVC",
    "EVC visit is scheduled, held and reported",
    "SAC/SHC review records observations and a recommendation",
    "Authorized decision is recorded with reasons and audit events",
  ];

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-navy-800/60 bg-navy-700">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="leading-tight text-white">
              <p className="text-sm font-bold sm:text-base">AICTE Approval Operations Intelligence</p>
              <p className="text-[11px] text-white/70">Integrated approval, compliance & alert management</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/help" className="btn border-white/30 bg-transparent text-white hover:bg-white/10">
              Help
            </Link>
            <Link href="/login" className="btn-accent">
              Sign in <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      <div className="bg-navy-800">
        <div className="mx-auto max-w-6xl px-4 py-2 text-center text-[11px] text-white/80">
          Independent Smart India Hackathon (SIH26262) prototype — <strong className="font-semibold">not</strong> the
          official AICTE website, not affiliated with or endorsed by AICTE, and with no live government integration.
        </div>
      </div>

      <main>
        <section className="border-b border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 lg:grid-cols-[1.2fr_1fr] lg:py-20">
            <div>
              <span className="badge border-saffron/40 bg-saffron/10 text-saffron-dark">
                Problem statement SIH26262
              </span>
              <h1 className="mt-4 text-3xl font-bold leading-tight text-navy-700 sm:text-4xl">
                Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System
              </h1>
              <p className="mt-4 max-w-2xl text-textmuted">
                A working full-stack regulatory operations platform: institution applications, stage-wise scrutiny,
                Expert Visit Committee scheduling, undertakings, document validity, deadlines, escalations and a
                traceable audit history — with AI used strictly as an assistant around a deterministic workflow core.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/login" className="btn-primary">
                  Open the demo portal <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/help" className="btn-secondary">
                  Setup, accounts & architecture
                </Link>
                <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  API documentation
                </a>
              </div>
              <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["10", "RBAC roles"],
                  ["31", "Portal pages"],
                  ["2", "Versioned workflows"],
                  ["100%", "DB-backed metrics"],
                ].map(([v, l]) => (
                  <div key={l} className="border-l-2 border-saffron pl-3">
                    <dt className="text-xl font-bold text-navy-700">{v}</dt>
                    <dd className="text-xs text-textmuted">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-textmuted">
                End-to-end demonstration journey
              </p>
              <ol className="mt-3 space-y-3">
                {stages.map((s, i) => (
                  <li key={s} className="flex gap-3 text-sm text-text">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-700 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-line pt-3 text-xs text-textmuted">
                Every step above is implemented against real API endpoints and persistent records — including
                clarification loops, prerequisites, notifications and audit events.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-h2 text-navy-700">Platform capabilities</h2>
          <p className="mt-1 max-w-3xl text-sm text-textmuted">
            Deterministic software controls workflow, deadlines, permissions and state transitions. AI helps users
            understand documents, find source material, summarize cases and flag potential issues. Authorized humans
            remain responsible for regulatory interpretation, verification and decisions.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c) => (
              <article key={c.title} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded bg-navy-50 text-navy-700">
                    <c.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold text-text">{c.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-textmuted">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-h2 text-navy-700">Regulatory references</h2>
                <p className="mt-2 text-sm text-textmuted">
                  Regulatory rules in this prototype are configurable, versioned and source-cited. They are
                  demonstration parameters until verified against the applicable handbook — the platform never
                  presents a demo parameter as an official requirement.
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li>
                    <a
                      className="link inline-flex items-center gap-1"
                      href="https://www.aicte.gov.in/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Official AICTE website <ArrowRight className="h-3 w-3" aria-hidden />
                    </a>
                  </li>
                  <li>
                    <a
                      className="link inline-flex items-center gap-1"
                      href="https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Approval Process Handbook (APH) reference PDF <ArrowRight className="h-3 w-3" aria-hidden />
                    </a>
                  </li>
                  <li className="text-xs text-textmuted">
                    Always confirm the latest handbook edition, amendments, circulars and notices on the official site
                    before relying on any rule.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="text-h2 text-navy-700">Built for operational honesty</h2>
                <ul className="mt-4 space-y-3 text-sm text-text">
                  {[
                    "No decorative buttons: every action calls a real, permission-checked endpoint.",
                    "No fabricated approvals, EOA letters or live AICTE integration — simulated operations are labelled as such.",
                    "AI output is untrusted, validated and cited; with no AI key configured the platform reports that clearly.",
                    "OCR and metadata findings are flagged for human review and never treated as proof of authenticity.",
                    "Dashboard numbers are computed from the database, never hardcoded.",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 text-center">
          <CalendarClock className="mx-auto h-7 w-7 text-saffron" aria-hidden />
          <h2 className="mt-3 text-h2 text-navy-700">Ready to evaluate the working prototype?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-textmuted">
            Sign in with one of the documented demo accounts to walk the full journey — from institution submission to
            scrutiny, clarification, EVC, compliance verification and the audit trail.
          </p>
          <Link href="/login" className="btn-accent mt-5">
            Go to sign in <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </main>

      <footer className="border-t border-line bg-navy-800 text-white/70">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed">
          <p className="font-semibold text-white">
            AICTE Approval Operations Intelligence Platform — SIH26262 prototype
          </p>
          <p className="mt-2 max-w-3xl">
            This is an independent Smart India Hackathon demonstration. It is not the official AICTE website, does not
            imply AICTE ownership, endorsement, affiliation or production integration, and must not be used to issue
            or represent official approvals. All seeded institutions, contacts, documents and obligations are
            synthetic.
          </p>
          <p className="mt-3">
            Official references:{" "}
            <a href="https://www.aicte.gov.in/" target="_blank" rel="noopener noreferrer" className="underline">
              aicte.gov.in
            </a>{" "}
            ·{" "}
            <a
              href="https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Approval Process Handbook
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
