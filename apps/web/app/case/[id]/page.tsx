"use client";
// Human-in-the-loop gate, full page. Wraps the same CaseReview used in the
// dashboard panel. Falls back to a matching mock case when the gateway is down.
import { useParams } from "next/navigation";
import { CaseReview } from "../../../components/CaseReview";
import { UIcon } from "../../../components/icons";
import { TopNav } from "../../../components/shell";
import { Button, ThemeToggle } from "../../../components/ui";
import { MOCK_CASES } from "../../../lib/viewmodel";
import { useRouter } from "next/navigation";

export default function CasePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const initial = MOCK_CASES.find((c) => c.id === id);

  return (
    <div className="col" style={{ height: "100%", overflowY: "auto" }}>
      <TopNav
        left={
          <Button variant="ghost" icon={<UIcon name="chevronLeft" size={15} />} onClick={() => router.push("/dashboard")}>
            Dashboard
          </Button>
        }
        right={<ThemeToggle />}
      />
      <div style={{ flex: 1, padding: "32px 16px 80px" }} className="page-in">
        <div className="card rise case-full-card" style={{ overflow: "visible" }}>
          <CaseReview caseId={id} initial={initial} />
        </div>
      </div>
    </div>
  );
}
