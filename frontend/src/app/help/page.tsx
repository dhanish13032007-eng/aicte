import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** Help & documentation: setup, demo accounts, architecture pointers. */
export const metadata = { title: "Help & demo guide" };

const ACCOUNTS: [string, string, string][] = [
  ["admin@ops.local", "System administrator", "Users, workflow config, rules, settings, audit"],
  ["office.sunrise@ops.local", "Institution applicant", "Create/submit applications, upload documents, respond"],
  ["scrutiny@ops.local", "Scrutiny officer", "Checklist, clarification, document verification, OCR"],
  ["evc@ops.local", "EVC coordinator", "Schedule visits, participants, reports"],
  ["evcmember@ops.local", "EVC member", "Record visit observations"],
  ["review@ops.local", "SAC/SHC review officer", "Review stage recommendations"],
  ["compliance@ops.local", "Compliance officer", "Obligations, evidence verification, escalation"],
  ["regional@ops.local", "Regional officer", "Jurisdiction workload, assignments, dashboards"],
  ["approver@ops.local", "Approving authority", "Authorized decisions with reasons"],
  ["auditor@ops.local", "Auditor (read-only)", "Audit trail, hash-chain verification, exports"],
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-bold text-white">Help & demonstration guide</p>
          <Link href="/login" className="btn-accent">
            Sign in
          </Link>
        </div>
        <div className="h-1 bg-saffron" aria-hidden />
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <section className="card p-6">
          <h1 className="text-h2 text-navy-700">What this is</h1>
          <p className="mt-2 text-sm text-textmuted">
            An independent Smart India Hackathon prototype for problem statement SIH26262: integrated AICTE approval
            workflow automation, compliance monitoring and alert management. It is not the official AICTE website and
            has no live government integration. All seeded institutions, documents and obligations are synthetic.
          </p>
        </section>

        <section className="card p-6" id="accounts">
          <h2 className="text-h3 text-text">Demo accounts</h2>
          <p className="mt-1 text-sm text-textmuted">
            Password for every account: <strong className="text-text">Demo@12345</strong>. Local development only.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className="th">Email</th>
                  <th className="th">Role</th>
                  <th className="th">What to try</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS.map(([email, role, what]) => (
                  <tr key={email}>
                    <td className="td font-medium">{email}</td>
                    <td className="td">{role}</td>
                    <td className="td text-textmuted">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-h3 text-text">Suggested evaluation journey</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-text">
            <li>Sign in as the institution account → create an application, upload a document, run OCR, submit.</li>
            <li>Sign in as the scrutiny officer → open the case, complete the checklist, return it for clarification (reason required).</li>
            <li>Back as the institution → submit the clarification response.</li>
            <li>Scrutiny officer → send the case to EVC; sign in as the EVC coordinator → propose and confirm a date, add participants, record the visit and report.</li>
            <li>Review officer → record the review recommendation; approving authority → record the decision with reasons.</li>
            <li>Compliance officer → verify submitted evidence; check the alert and escalation queue.</li>
            <li>Open the audit trail and run hash-chain verification to review the recorded sequence.</li>
          </ol>
        </section>

        <section className="card p-6">
          <h2 className="text-h3 text-text">Architecture & documentation</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a className="link inline-flex items-center gap-1" href="/api/docs" target="_blank" rel="noopener noreferrer">
                OpenAPI / Swagger documentation <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
            <li>
              <Link href="/login" className="link">
                Sign in to the portal
              </Link>
            </li>
            <li className="text-textmuted">
              Repository documentation: README (setup), docs/architecture.md, docs/database.md, docs/workflow.md,
              docs/security.md.
            </li>
            <li>
              <a
                className="link inline-flex items-center gap-1"
                href="https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Approval Process Handbook (external reference) <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
          </ul>
        </section>

        <section className="card border-warn/40 bg-warn/5 p-6">
          <h2 className="text-h3 text-text">Honest limitations</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-textmuted">
            <li>Stage deadlines are internal operational targets, not statutory deadlines.</li>
            <li>Regulatory rule parameters are demonstration values pending verification against the applicable handbook.</li>
            <li>AI features require a configured provider; without one they report "not configured" instead of inventing output.</li>
            <li>Email delivery runs in console/simulation mode unless SMTP is configured; simulated operations are labelled.</li>
            <li>SHA-256 event chaining detects alteration but does not make the database immutable on its own.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
