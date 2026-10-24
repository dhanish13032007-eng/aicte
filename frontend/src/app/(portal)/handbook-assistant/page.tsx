"use client";

/** AICTE Handbook Assistant: retrieval over registered sources with citations. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Database, ExternalLink, Search } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { fmtDate } from "../../../lib/format";
import { Badge, Card, EmptyState, Notice, PageHeader, Skeleton } from "../../../components/common/ui";
import type { RagAnswer, RagSource } from "../../../lib/types";

const SUGGESTED = [
  "Which documents are required for a new approval application?",
  "What does the handbook say about lease validity?",
  "Which page covers Expert Visit Committee requirements?",
  "What is the requirement for fire and safety certification?",
];

export default function HandbookAssistantPage() {
  const { can } = useSession();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: sources, isLoading: loadingSources } = useQuery<RagSource[]>({
    queryKey: ["rag-sources"],
    queryFn: () => api("/admin/rag/documents"),
  });

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      setAnswer(await api<RagAnswer>("/rag/ask", { method: "POST", json: { question: q.trim() } }));
    } catch (e) {
      setAnswer({
        answer: null,
        abstained: true,
        reason: e instanceof Error ? e.message : "Request failed",
        citations: [],
      });
    } finally {
      setBusy(false);
    }
  };

  const ingested = (sources ?? []).filter((s) => s.is_ingested);

  return (
    <div>
      <PageHeader
        title="AICTE Handbook Assistant"
        description="Ask questions against registered, approved source documents. Answers are grounded in retrieved passages and always cite them — the assistant abstains when the sources do not establish an answer."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "AICTE Handbook Assistant" }]}
        actions={<Badge tone={ingested.length ? "success" : "warning"}>{ingested.length} ingested source(s)</Badge>}
      />

      <Notice kind="warning" className="mb-4">
        This assistant is an independent retrieval aid over registered documents — it is not an official AICTE
        interpretation. Distinguish: what a source explicitly states (cited below), how the platform's configured rules
        interpret it (see Regulatory Rules), and anything requiring authorized human interpretation. Never treat a demo
        parameter as an official requirement.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card>
            <form
              className="space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <label htmlFor="rag-q" className="label">
                Your question
              </label>
              <textarea
                id="rag-q"
                className="input min-h-[90px]"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What does the applicable handbook say about lease duration for a degree programme?"
              />
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={busy || !question.trim()}>
                  <Search className="h-4 w-4" aria-hidden /> {busy ? "Retrieving…" : "Ask"}
                </button>
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => {
                      setQuestion(s);
                      void ask(s);
                    }}
                  >
                    {s.slice(0, 42)}…
                  </button>
                ))}
              </div>
            </form>
          </Card>

          <Card title="Answer" description="Grounded in retrieved passages with citations">
            {busy && <Skeleton rows={5} />}
            {!busy && !answer && (
              <EmptyState
                title="No question asked yet"
                hint="Answers cite document title, page and section. If no reliable evidence is retrieved, the assistant says so."
              />
            )}
            {!busy && answer && (
              <div className="space-y-4 p-4">
                {answer.source_count === 0 && (
                  <Notice kind="warning">{answer.reason}</Notice>
                )}
                {answer.abstained && answer.source_count !== 0 && (
                  <Notice kind="warning">
                    <strong>Abstained:</strong> {answer.reason}
                  </Notice>
                )}
                {!answer.abstained && answer.answer && (
                  <div className="rounded border border-line bg-navy-50/60 p-3">
                    <p className="prose-plain">{answer.answer}</p>
                  </div>
                )}
                {!answer.abstained && !answer.answer && answer.reason && <Notice kind="info">{answer.reason}</Notice>}

                {answer.citations.length > 0 && (
                  <div>
                    <p className="label">Cited sources</p>
                    <ol className="space-y-2">
                      {answer.citations.map((c) => (
                        <li key={c.n} className="rounded border border-line p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="info">[{c.n}]</Badge>
                            <span className="font-semibold text-text">{c.title}</span>
                            <span className="text-xs text-textmuted">
                              {c.authority} · v{c.version ?? "n/a"} · page {c.page}
                              {c.section ? ` · § ${c.section}` : ""}
                            </span>
                            <Badge tone={c.status === "current" ? "success" : "warning"}>{c.status}</Badge>
                            <span className="text-[11px] text-textmuted">
                              {c.score_kind} score {c.score}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-textmuted">“{c.snippet}…”</p>
                          {c.source_url && (
                            <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-navy-600 hover:underline">
                              Open source <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <p className="text-[11px] text-textmuted">
                  Retrieval mode: {answer.retrieval_mode ?? "n/a"} · retrieved content is treated as data, never as
                  instructions; prompt-injection attempts inside uploaded documents are ignored and flagged.
                </p>
              </div>
            )}
          </Card>
        </div>

        <Card title="Registered source documents" description="Registry maintained by administrators">
          {loadingSources && <Skeleton rows={5} />}
          {!loadingSources && (sources ?? []).length === 0 && (
            <EmptyState
              title="No sources registered yet"
              hint="An administrator must register and ingest the applicable Approval Process Handbook (or other approved references) before questions can be answered."
            />
          )}
          <ul className="divide-y divide-line">
            {(sources ?? []).map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <BookOpenText className="h-4 w-4 text-navy-600" aria-hidden />
                  <span className="text-sm font-semibold text-text">{s.title}</span>
                  <Badge tone={s.is_ingested ? "success" : "neutral"}>{s.is_ingested ? "ingested" : "pending"}</Badge>
                </div>
                <p className="mt-1 text-xs text-textmuted">
                  {s.authority} · {s.academic_year ?? "year n/a"} · v{s.version ?? "n/a"} · published {fmtDate(s.publication_date)} ·{" "}
                  {s.chunks} chunks
                </p>
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-navy-600 hover:underline">
                    Source URL
                  </a>
                )}
                {s.checksum && <p className="mt-0.5 break-all text-[10px] text-textmuted">sha256 {s.checksum.slice(0, 24)}…</p>}
              </li>
            ))}
          </ul>
          {can("rag.ingest") && (
            <div className="border-t border-line px-4 py-3">
              <p className="flex items-center gap-1 text-xs text-textmuted">
                <Database className="h-3.5 w-3.5" aria-hidden />
                Register and ingest additional sources from System Settings → RAG sources.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
