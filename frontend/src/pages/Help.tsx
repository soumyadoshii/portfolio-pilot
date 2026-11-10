import { Card, Title } from "@/components/common";

export function Help() {
  return (
    <>
      <Title
        eyebrow="HELP & LIMITATIONS"
        title="How PortfolioPilot works."
        sub="A prototype for understanding—not executing—portfolio decisions."
      />
      <div className="help-grid">
        {[
          [
            "What data does it use?",
            "Demo data is synthetic. Guest workspaces and demo edits stay in local browser storage. Account state is sent only to the relative same-origin app API.",
          ],
          [
            "Does it connect to my broker?",
            "No. PortfolioPilot does not ask for broker credentials, access live brokerage accounts, move money or place trades.",
          ],
          [
            "Are projections predictions?",
            "No. Goal estimates use a fixed annual return, inflation and monthly-contribution assumption. Stress scenarios apply percentage-point shocks to current holding values.",
          ],
          [
            "What does the health score mean?",
            "It is a product methodology score, not an official rating: asset class 30%, sector 20%, security concentration 20%, correlation 20%, geography 10%. Demo correlations are synthetic.",
          ],
          [
            "How do account AI explanations work?",
            "The account Coach requires explicit opt-in in the prompt. The server returns its source. Guest/demo answers are deterministic and local; they do not call the Coach API.",
          ],
          [
            "What are the limitations?",
            "No live prices, broker data, trades, tax/transaction cost calculation, security constraints, guaranteed returns or personalized investment advice. User imports are not independently verified.",
          ],
        ].map(([q, a]) => (
          <Card key={q}>
            <h2>{q}</h2>
            <p>{a}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
