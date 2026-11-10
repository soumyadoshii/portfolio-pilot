# PortfolioPilot

**Your portfolio. Your goals. Your all-weather strategy.**

PortfolioPilot is a goal-oriented portfolio intelligence platform designed to help individuals and families understand their investments, track financial goals, evaluate diversification, and explore how different market scenarios could affect their portfolios.

The platform brings portfolio analysis and goal planning together in one place, with explainable analytics and AI-assisted insights.

> **Disclaimer:** PortfolioPilot is an educational portfolio analysis platform. It is not a broker or a registered investment adviser. It does not execute trades, transfer funds, or require users to connect brokerage accounts. Demo portfolios and scenario outputs are illustrative and should not be treated as financial advice.

## Features

### 1. Portfolio Dashboard
- View consolidated portfolio value and investment allocation.
- Review holdings across equities, mutual funds, exchange-traded funds, gold, debt, and cash.
- Understand portfolio composition and concentration.
- Explore sample portfolios using synthetic demo data.

### 2. Portfolio Management
- Maintain investment holdings and related portfolio information.
- Review asset allocation and portfolio performance.
- Import holdings using supported CSV workflows.
- Track portfolio snapshots and changes over time.

### 3. Financial Goal Planning
- Define financial goals such as retirement, education, home ownership, and travel.
- Set target amounts, target dates, and planned monthly contributions.
- Track progress toward each goal.
- Explore how contribution levels, time horizons, inflation, and return assumptions affect projected outcomes.

### 4. Automatic Monthly Inflation Updates
- Inflation assumptions are updated automatically each month.
- Updated inflation assumptions help keep financial goal projections aligned with changing inflation conditions.
- Inflation-adjusted projections help users understand the potential future cost of financial goals.

*The displayed inflation rate and its update date should be checked in the application when reviewing a projection.*

### 5. Diversification Analysis
- Examine asset allocation across portfolio categories.
- Review diversification indicators and concentration.
- Explore relationships between asset categories using correlation analysis.
- Identify potential areas of overexposure.

### 6. Historical Backtesting
- Evaluate portfolio strategies against historical market data where supported.
- Review historical performance and portfolio behaviour over a selected period.
- Compare results under different assumptions.
- Interpret historical results as analytical evidence, not a guarantee of future performance.

### 7. Stress Testing
Explore how a portfolio might respond to hypothetical or historically inspired market shocks, including:
- Global equity market crises
- Sudden market corrections
- Inflation shocks
- Interest-rate shocks
- Stagflation scenarios

Stress-test outputs depend on the scenario assumptions and asset-level return estimates used.

### 8. Rebalancing Analysis
- Compare current asset allocation with target allocations.
- Identify allocation drift.
- Explore potential adjustments to bring a portfolio closer to its intended allocation.
- Review illustrative rebalancing implications without executing trades.

### 9. AI Coach
- Explore portfolio information through a conversational interface.
- Get explanations of supported portfolio metrics and financial goals.
- Use AI-assisted insights to better understand portfolio behaviour.

AI-generated content is informational and should be reviewed alongside the underlying data and assumptions.

### 10. Reports and Notifications
- Generate portfolio review reports.
- Review goal-related reminders and portfolio notifications.
- Track relevant changes and suggested areas for review.

### 11. Demo Mode
- Explore PortfolioPilot without connecting a brokerage account.
- Use predefined sample personas and synthetic portfolio data.
- Navigate the dashboard, goals, diversification analysis, and other supported features.

Demo values are illustrative and should not be interpreted as live holdings or market quotations.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Routing | Wouter |
| Styling | Tailwind CSS |
| Backend | Node.js, Express |
| Database access | Drizzle ORM |
| Database | MySQL-compatible database / TiDB Cloud, depending on configuration |
| Analytics | TypeScript-based portfolio calculations and supporting Python utilities |
| Market data | Configured historical market-data pipeline |
| Development tools | npm, TypeScript, Git |

## Application Architecture

PortfolioPilot separates the user interface, application logic, persistence, and analytical workflows.

1. **Frontend:** React components provide the landing page, dashboard, portfolio views, goals, reports, stress testing, and other application screens.
2. **Backend:** Express exposes application endpoints for portfolio operations and related workflows.
3. **Data layer:** Drizzle ORM connects application operations to the configured database.
4. **Analytics:** Portfolio calculations support allocation analysis, diversification, goal projections, backtesting, and stress testing.
5. **Market-data workflow:** Supporting data pipelines provide historical data where configured. Synthetic demo data is kept distinguishable from market-derived data.

## Data and Assumptions

PortfolioPilot may use different types of data depending on the feature and operating mode.

- **User-provided data:** Holdings, financial goals, and other information entered by the user.
- **Synthetic demo data:** Predefined holdings, portfolio snapshots, and illustrative scenario inputs used to demonstrate the application.
- **Historical market data:** Data supplied through the configured market-data pipeline for supported analytical workflows.
- **Inflation assumptions:** Updated automatically on a monthly schedule for inflation-sensitive calculations.

Analytical outputs depend on data availability, calculation methods, and user-defined assumptions. Historical returns and hypothetical stress scenarios do not predict future performance.

## Getting Started

### Prerequisites
- Node.js and npm
- Python, if using the supporting Python utilities
- Access to the configured database for features requiring persistent storage
- Environment variables required by the application

### Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd PortfolioPilot
npm install
```

Install Python dependencies if required by the market-data pipeline:

```bash
pip install -r scripts/requirements.txt
```

Configure the environment variables required by your local setup before starting the application.

### Run the Application

Start the combined development server using the project's configured script:

```bash
npm run dev
```

The default server port is `3000`, unless overridden by the `PORT` environment variable.

If running the frontend and backend separately, ensure their ports and the frontend API proxy configuration match your local setup.

### Health Check

When the backend is running, check its health endpoint:

```text
/api/health
```

For a local server running on port `3000`, the full address is:

```text
http://localhost:3000/api/health
```

## Project Structure

```text
PortfolioPilot/
├── backend/
│   ├── _core/
│   ├── data/
│   ├── drizzle/
│   ├── app-api.ts
│   ├── app-repository.ts
│   ├── app-security.ts
│   └── db.ts
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── data/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       ├── App.tsx
│       └── main.tsx
├── scripts/
│   ├── market_pipeline.py
│   ├── requirements.txt
│   └── with-node-env.mjs
├── shared/
├── docs/
├── package.json
└── README.md
```

## Security and Privacy

- Brokerage credentials are not required.
- The application does not execute trades or move money.
- Account-based functionality depends on the configured authentication and backend implementation.
- Demo portfolios use predefined illustrative data.
- AI-assisted functionality should only process information permitted by the application's consent and privacy settings.

## Limitations

- Demo portfolio values and snapshots may be synthetic.
- Market-data availability depends on the configured data source.
- Historical backtesting depends on data quality and modelling assumptions.
- Stress-test results are scenario estimates rather than forecasts.
- Automatically updated inflation assumptions should be checked for their latest update date and source.
- PortfolioPilot does not replace professional financial, tax, or investment advice.

## Project Objective

PortfolioPilot aims to make portfolio analysis more understandable and goal-oriented by bringing investment information, financial planning, diversification analysis, scenario exploration, and explainable insights into one platform.
