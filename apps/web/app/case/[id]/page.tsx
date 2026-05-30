"use client";
// Human-in-the-loop gate (UiPath Track 1 qualifying surface).
// Approve / Save edits / Reject — nothing posts to GitHub until the maintainer
// acts here. The same CaseReview component powers the dashboard side panel.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Logo } from "../../../components/Brand";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { CaseReview } from "../../../components/CaseReview";

export default function CasePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  return (
    <>
      <nav className="nav">
        <Link href="/dashboard"><Logo /></Link>
        <div className="row" style={{ gap: 12 }}>
          <Link href="/dashboard" className="btn btn-ghost">← Dashboard</Link>
          <ThemeToggle />
        </div>
      </nav>
      <div className="container" style={{ maxWidth: 900, padding: "24px" }}>
        <div className="card" style={{ padding: 0 }}>
          <CaseReview caseId={id} />
        </div>
      </div>
    </>
  );
}
