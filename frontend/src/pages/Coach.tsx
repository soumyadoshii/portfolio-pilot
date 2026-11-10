import { useApp } from "@/contexts/AppContext";
import { runHistoricalComparison } from "@shared/backtest";
import { deterministicCoachAnswer } from "@shared/finance";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button, Card, Empty, Title } from "@/components/common";
import { ReportDownload } from "@/components/ReportDownload";

export function Coach() {
  const { state, setState, user, demo, api, saveAccountState } = useApp();
  const backtestResult = runHistoricalComparison(
    state.historicalReturns,
    state.backtestConfig
  );
  const [q, setQ] = useState(""),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const prompts = [
    "How diversified is my portfolio?",
    "Which sector has the most exposure?",
    "How are my goals progressing?",
    "What if equities fall 20%?",
    "How much gold do I hold?",
    "What if I invest more each month?",
    "What changed in my portfolio?",
    "How did these allocations compare historically?",
  ];
  async function ask(question = q) {
    if (!question.trim()) return;
    setQ(question);
    setBusy(true);
    setError("");
    try {
      let result: { answer: string; source: "ai" | "deterministic" };
      if (user) {
        if (state.preferences.aiCoachConsent) await saveAccountState(state);
        const out = await api("/api/app/coach", {
          method: "POST",
          body: JSON.stringify({
            question,
            aiConsent: state.preferences.aiCoachConsent,
          }),
        });
        if (
          typeof out.answer !== "string" ||
          !["ai", "deterministic"].includes(out.source)
        )
          throw new Error("Invalid Coach response.");
        result = out;
      } else
        result = {
          answer: deterministicCoachAnswer(question, state, backtestResult),
          source: "deterministic",
        };
      setAnswer(result.answer);
      const msg = {
        id: `coach-${Date.now()}`,
        question,
        answer: result.answer,
        source:
          result.source === "ai" ? ("ai" as const) : ("deterministic" as const),
        createdAt: new Date().toISOString(),
      };
      setState({ ...state, coachMessages: [...state.coachMessages, msg] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coach request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="PORTFOLIOPILOT COACH"
          title="Ask about this portfolio."
          sub="Answers use the values and goals in the active workspace. The Coach explains; it does not invent positions or make trades."
        />
        <ReportDownload state={state} section="coach" title="Coach conversation" />
      </div>
      <div className="coach-layout">
        <Card className="coach-panel">
          <div className="card-heading">
            <div>
              <span className="eyebrow">CONTEXTUAL EXPLANATIONS</span>
              <h2>What would you like to understand?</h2>
            </div>
            <MessageCircle />
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor="coach-q">
              Ask about your portfolio
            </label>
            <textarea
              id="coach-q"
              rows={3}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="For example: What happens if equities fall 20%?"
            />
            <div className="form-actions">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={state.preferences.aiCoachConsent}
                  onChange={e =>
                    setState({
                      ...state,
                      preferences: {
                        ...state.preferences,
                        aiCoachConsent: e.target.checked,
                      },
                    })
                  }
                  disabled={!user}
                />{" "}
                Allow account AI for this question{" "}
                {user ? "(optional)" : "(account only)"}
              </label>
              <Button type="submit" disabled={busy || !q.trim()}>
                {busy ? "Thinking…" : "Explain this"}
              </Button>
            </div>
          </form>
          {error && <p className="error-box">{error}</p>}
          {answer && (
            <div className="coach-answer">
              <b>
                Grounded explanation ·{" "}
                {state.preferences.aiCoachConsent && user
                  ? "server response"
                  : "deterministic"}
              </b>
              <p>{answer}</p>
              <small>
                Assumptions can be incomplete. This is educational, not
                personalized investment advice.
              </small>
            </div>
          )}
          <div className="prompt-grid">
            {prompts.map(p => (
              <button key={p} className="prompt-chip" onClick={() => void ask(p)}>
                {p}
              </button>
            ))}
          </div>
          {demo && (
            <p className="note">
              Demo Coach runs locally in this browser. It does not call the
              Coach API.
            </p>
          )}
        </Card>
        <Card>
          <span className="eyebrow">RECENT QUESTIONS</span>
          <h2>Your conversation</h2>
          {state.coachMessages.length ? (
            state.coachMessages
              .slice()
              .reverse()
              .map(m => (
                <div key={m.id} className="history-item">
                  <b>{m.question}</b>
                  <small>
                    {m.source} explanation ·{" "}
                    {new Date(m.createdAt).toLocaleString()}
                  </small>
                  <p>{m.answer}</p>
                </div>
              ))
          ) : (
            <Empty
              title="A private, useful starting point"
              body="Ask a question or choose a prompt. Guest answers stay local."
            />
          )}
        </Card>
      </div>
    </>
  );
}
