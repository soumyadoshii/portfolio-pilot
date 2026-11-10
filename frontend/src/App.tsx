import type { ReactNode } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { AppProvider, useApp } from "@/contexts/AppContext";
import BacktestPage from "@/BacktestPage";
import { Layout } from "@/components/Layout";
import { Mark } from "@/components/common";
import { Auth } from "@/pages/Auth";
import { Coach } from "@/pages/Coach";
import { Dashboard } from "@/pages/Dashboard";
import { GoalDetail } from "@/pages/GoalDetail";
import { Goals } from "@/pages/Goals";
import { Help } from "@/pages/Help";
import { Landing } from "@/pages/Landing";
import { NotFoundPage } from "@/pages/NotFound";
import { Notifications } from "@/pages/Notifications";
import { Onboarding } from "@/pages/Onboarding";
import { Portfolio } from "@/pages/Portfolio";
import { Rebalance } from "@/pages/Rebalance";
import { SettingsPage } from "@/pages/Settings";
import { StressTest } from "@/pages/StressTest";

/**
 * Routing rules:
 *  - "/" is public.
 *  - "/login" and "/register" show Google sign-in; a signed-in user is sent on
 *    to the questionnaire (if unfinished) or the dashboard.
 *  - Everything else needs an account (or demo mode). An account whose
 *    questionnaire is unfinished can only see "/onboarding".
 */
function ApplicationRoute() {
  const [loc] = useLocation();
  const { user, demo, ready, state } = useApp();
  const path = loc.replace(/\/$/, "") || "/";
  const onboarded = typeof state.profile.riskScore === "number";

  if (!ready && path !== "/")
    return (
      <div className="loading">
        <Mark />
        <p>Loading your workspace…</p>
      </div>
    );
  if (path === "/") return <Landing />;
  if (path === "/login" || path === "/register")
    return user ? (
      <Redirect to={onboarded ? "/dashboard" : "/onboarding"} replace />
    ) : (
      <Auth />
    );
  if (!user && !demo) return <Auth />;
  if (path === "/onboarding") return <Onboarding />;
  if (user && !onboarded) return <Redirect to="/onboarding" replace />;

  let page: ReactNode;
  if (path === "/dashboard") page = <Dashboard />;
  else if (path === "/portfolio") page = <Portfolio />;
  else if (path === "/backtest") page = <BacktestPage />;
  else if (path === "/goals") page = <Goals />;
  else if (path.startsWith("/goals/"))
    page = <GoalDetail id={decodeURIComponent(path.split("/")[2])} />;
  else if (path === "/stress-test") page = <StressTest />;
  else if (path === "/rebalance") page = <Rebalance />;
  else if (path === "/ai-coach") page = <Coach />;
  else if (path === "/notifications") page = <Notifications />;
  else if (path === "/settings") page = <SettingsPage />;
  else if (path === "/help") page = <Help />;
  else return <NotFoundPage />;
  return <Layout>{page}</Layout>;
}

export default function App() {
  return (
    <AppProvider>
      <Switch>
        <Route component={ApplicationRoute} />
      </Switch>
    </AppProvider>
  );
}
