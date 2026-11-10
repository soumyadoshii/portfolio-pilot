#!/usr/bin/env python3
"""
PortfolioPilot market-data pipeline: fetch -> check -> estimate -> simulate -> validate.

Run from the project root (see README block at the bottom of this docstring):

    python scripts/market_pipeline.py fetch --years 10
    python scripts/market_pipeline.py check
    python scripts/market_pipeline.py estimate
    python scripts/market_pipeline.py simulate --model all --weights equal
    python scripts/market_pipeline.py validate
    python scripts/market_pipeline.py publish        # copies derived JSON for the web app
    python scripts/market_pipeline.py all            # everything above in order

Data: Yahoo Finance via the unofficial `yfinance` package (adjusted for splits and
dividends). Yahoo's data is for personal/research use: keep data/raw and data/market
out of git (see .gitignore lines in the answer) and only publish derived results.

Modelling conventions (stated so they can go straight into a report):
  * Monthly log returns of month-end adjusted closes.
  * The portfolio is rebalanced to fixed weights every month.
  * Contributions are added at the start of each month, then the month's return applies.
  * Covariance uses Ledoit-Wolf shrinkage (few months, many assets).
  * Inflation is a flat assumption used only to express the goal in today's rupees.
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DATA = ROOT / "data" / "market"
RESULTS = DATA / "results"
PUBLIC = ROOT / "frontend" / "public" / "data" / "forecast"

# ---------------------------------------------------------------- universe ---
# Ten large NSE companies across ten sectors (all long-listed, all Nifty 50 members today).
STOCKS = {
    "RELIANCE.NS": "Energy / conglomerate",
    "TCS.NS": "IT services",
    "HDFCBANK.NS": "Private bank",
    "SBIN.NS": "PSU bank",
    "HINDUNILVR.NS": "FMCG",
    "ITC.NS": "FMCG / tobacco",
    "LT.NS": "Infrastructure",
    "SUNPHARMA.NS": "Pharma",
    "MARUTI.NS": "Auto",
    "BHARTIARTL.NS": "Telecom",
}
GOLD = "GOLDBEES.NS"  # Nippon India Gold ETF (INR, tracks domestic gold)
BENCH = "^NSEI"  # Nifty 50 price index; used for regimes, not held in the portfolio
ASSETS = list(STOCKS) + [GOLD]
SEED = 42
MONTHS_PER_YEAR = 12


logging.getLogger("hmmlearn").setLevel(logging.CRITICAL)  # silence "not converging" chatter


def log(msg: str = "") -> None:
    print(msg, flush=True)


def ensure_dirs() -> None:
    for p in (RAW, DATA, RESULTS):
        p.mkdir(parents=True, exist_ok=True)


# ============================================================ 1. FETCH =======
def extract_close(data: pd.DataFrame, tickers: list[str]) -> pd.DataFrame:
    """Adjusted close table (date x ticker) from whatever shape yfinance returned."""
    if isinstance(data.columns, pd.MultiIndex):
        level0 = data.columns.get_level_values(0)
        close = data["Close"] if "Close" in level0 else data.xs("Close", axis=1, level=-1)
    else:  # single ticker comes back flat
        close = data[["Close"]].rename(columns={"Close": tickers[0]})
    close = close.copy()
    close.index = pd.to_datetime(close.index)
    if close.index.tz is not None:
        close.index = close.index.tz_localize(None)
    return close[[t for t in tickers if t in close.columns]]


def download_close(tickers: list[str], start: pd.Timestamp, end: pd.Timestamp, retries: int = 3):
    import yfinance as yf  # imported here so the other steps run without it

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            data = yf.download(
                tickers,
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),  # end is exclusive
                interval="1d",
                auto_adjust=True,  # Close is adjusted for splits AND dividends
                progress=False,
                group_by="column",
            )
            close = extract_close(data, tickers)
            if close.dropna(how="all").empty:
                raise RuntimeError("Yahoo returned no rows")
            return close
        except Exception as exc:  # network, rate limit, parsing
            last_error = exc
            log(f"  attempt {attempt}/{retries} failed: {type(exc).__name__}: {exc}")
            time.sleep(2 * attempt)
    sys.exit(f"Could not download data from Yahoo Finance: {last_error}")


def cmd_fetch(args) -> None:
    ensure_dirs()
    end = pd.Timestamp.today().normalize().replace(day=1)  # first day of this month
    start = end - pd.DateOffset(months=MONTHS_PER_YEAR * args.years + 1)
    tickers = ASSETS + [BENCH]
    log(f"Downloading {len(tickers)} tickers, {start.date()} to {end.date()} (exclusive) ...")
    close = download_close(tickers, start, end)
    missing = [t for t in tickers if t not in close.columns]
    if missing:
        sys.exit(f"Yahoo returned nothing for: {', '.join(missing)}. Check the ticker symbols.")

    close.to_csv(RAW / "prices_daily.csv")
    monthly = close.resample("ME").last()  # last trading day's adjusted close of each month
    monthly = monthly.dropna(how="all")
    monthly.to_csv(DATA / "prices_monthly.csv")
    returns = np.log(monthly).diff().iloc[1:]
    returns.to_csv(DATA / "returns_monthly.csv")

    meta = {
        "source": "Yahoo Finance via yfinance (unofficial; personal/research use)",
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "years": args.years,
        "startRequested": str(start.date()),
        "endExclusive": str(end.date()),
        "firstMonth": monthly.index[0].strftime("%Y-%m"),
        "lastMonth": monthly.index[-1].strftime("%Y-%m"),
        "monthlyReturns": int(len(returns)),
        "adjusted": "splits and dividends (auto_adjust=True)",
        "tickers": {**STOCKS, GOLD: "Gold ETF", BENCH: "Nifty 50 price index (benchmark)"},
    }
    (DATA / "meta.json").write_text(json.dumps(meta, indent=2))
    log(f"Saved daily prices ({len(close)} rows), monthly prices and {len(returns)} monthly returns.")
    log(f"Range: {meta['firstMonth']} to {meta['lastMonth']}. Next: check")


# ============================================================ helpers ========
def load_returns() -> tuple[pd.DataFrame, pd.Series]:
    path = DATA / "returns_monthly.csv"
    if not path.exists():
        sys.exit("No data yet. Run:  python scripts/market_pipeline.py fetch")
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    cols = [c for c in ASSETS if c in df.columns]
    full = df[cols + [BENCH]].dropna()
    return full[cols], full[BENCH]


def max_drawdown(log_returns: pd.Series) -> float:
    wealth = np.exp(log_returns.cumsum())
    return float((wealth / wealth.cummax() - 1).min())


def parse_weights(spec: str, cols: list[str]) -> tuple[np.ndarray, str]:
    n = len(cols)
    if spec == "equal":
        return np.full(n, 1.0 / n), "equal"
    stocks = [c for c in cols if c in STOCKS]
    if spec == "stocks":
        w = np.array([1.0 / len(stocks) if c in STOCKS else 0.0 for c in cols])
        return w, "stocks"
    if spec == "growth":  # 90% equal-weight stocks, 10% gold
        w = np.array([0.9 / len(stocks) if c in STOCKS else 0.1 for c in cols])
        return w, "growth"
    w = np.zeros(n)
    for part in spec.split(","):
        name, _, value = part.partition("=")
        name = name.strip().upper()
        name = name if name in cols else name + ".NS"
        if name not in cols:
            sys.exit(f"Unknown asset in --weights: {part!r}. Known: {', '.join(cols)}")
        w[cols.index(name)] = float(value)
    if (w < 0).any() or abs(w.sum() - 1) > 1e-3:
        sys.exit(f"--weights must be non-negative and sum to 1 (got {w.sum():.4f}).")
    return w / w.sum(), "custom"


# ============================================================ 2. CHECK =======
def cmd_check(args) -> None:
    from scipy import stats

    if not (DATA / "prices_monthly.csv").exists():
        sys.exit("No data yet. Run:  python scripts/market_pipeline.py fetch")
    prices = pd.read_csv(DATA / "prices_monthly.csv", index_col=0, parse_dates=True)
    daily = pd.read_csv(RAW / "prices_daily.csv", index_col=0, parse_dates=True)
    meta = json.loads((DATA / "meta.json").read_text())
    expected = meta["years"] * MONTHS_PER_YEAR
    rets = np.log(prices).diff().iloc[1:]
    daily_rets = np.log(daily).diff()
    bench = rets[BENCH]

    rows, fails, warns = [], [], []
    for t in prices.columns:
        r = rets[t].dropna()
        flags = []
        if (prices[t].dropna() <= 0).any():
            fails.append(f"{t}: non-positive prices")
            flags.append("FAIL:price<=0")
        if len(r) < 60:
            fails.append(f"{t}: only {len(r)} monthly returns (need >= 60)")
            flags.append("FAIL:short")
        elif len(r) < 0.95 * expected:
            warns.append(f"{t}: {len(r)} of {expected} expected months")
            flags.append("short-history")
        if (r.abs() > 0.40).any():
            warns.append(f"{t}: monthly move above 40% (split/data error?) in {list(r[r.abs() > 0.40].index.strftime('%Y-%m'))}")
            flags.append("big-month")
        if int((r == 0).sum()) > 3:
            warns.append(f"{t}: {(r == 0).sum()} months with exactly zero return (stale prices?)")
            flags.append("stale")
        d = daily_rets[t].dropna()
        jumps = d[d.abs() > 0.20]
        if len(jumps):
            warns.append(f"{t}: daily move above 20% on {[x.strftime('%Y-%m-%d') for x in jumps.index[:5]]} (unadjusted split/demerger?)")
            flags.append("daily-jump")
        if t not in (BENCH, GOLD):
            corr = r.corr(bench.reindex(r.index))
            if corr < 0.3:
                warns.append(f"{t}: correlation with Nifty only {corr:.2f}")
                flags.append("low-corr")
        jb = stats.jarque_bera(r)[1] if len(r) > 7 else np.nan
        rows.append({
            "asset": t, "months": len(r),
            "first": r.index[0].strftime("%Y-%m") if len(r) else "-",
            "ann_ret_%": r.mean() * 12 * 100, "ann_vol_%": r.std() * np.sqrt(12) * 100,
            "max_dd_%": max_drawdown(r) * 100, "skew": stats.skew(r), "ex_kurt": stats.kurtosis(r),
            "JB_p": jb, "flags": ",".join(flags) or "ok",
        })
    table = pd.DataFrame(rows).set_index("asset")
    pd.set_option("display.width", 200)
    log(table.round(2).to_string())
    common = rets[ASSETS + [BENCH]].dropna()
    log(f"\nCommon history used for modelling: {len(common)} months "
        f"({common.index[0].strftime('%Y-%m')} to {common.index[-1].strftime('%Y-%m')})")
    nonnormal = int((table["JB_p"] < 0.05).sum())
    log(f"Normality (Jarque-Bera p < 0.05): {nonnormal} of {len(table)} series reject normality "
        f"-> compare GBM against bootstrap/HMM, do not rely on GBM alone.")
    table.round(4).to_csv(DATA / "check_report.csv")
    for w in warns:
        log(f"WARN  {w}")
    for f in fails:
        log(f"FAIL  {f}")
    log("\nRESULT: " + ("FAIL" if fails else "PASS with warnings" if warns else "PASS"))
    if fails:
        sys.exit(1)


# ============================================================ 3. ESTIMATE ====
class Fit:
    """Everything estimated from one window of monthly log returns."""

    def __init__(self, R: np.ndarray, m: np.ndarray, seed: int = SEED, hmm_restarts: int = 8):
        from sklearn.covariance import LedoitWolf

        self.R, self.m = R, m
        self.T, self.N = R.shape
        self.mu = R.mean(axis=0)
        lw = LedoitWolf().fit(R)
        self.cov = lw.covariance_
        self.shrinkage = float(lw.shrinkage_)
        self.chol = np.linalg.cholesky(self.cov)
        self._fit_markov()
        self._fit_hmm(seed, hmm_restarts)

    # -- 3-state Markov chain on Nifty months: down / flat / up -----------------
    def _fit_markov(self) -> None:
        mean, sd = self.m.mean(), self.m.std(ddof=1)
        self.thresholds = (mean - 0.5 * sd, mean + 0.5 * sd)
        states = np.digitize(self.m, self.thresholds)  # 0 down, 1 flat, 2 up
        counts = np.full((3, 3), 0.5)  # small pseudo-count so no row is empty
        for a, b in zip(states[:-1], states[1:]):
            counts[a, b] += 1
        self.markov_P = counts / counts.sum(axis=1, keepdims=True)
        self.markov_current = int(states[-1])
        self.markov_pools = [np.where(states == s)[0] for s in range(3)]

    # -- 2-state Gaussian HMM on Nifty months, calm state first -----------------
    def _fit_hmm(self, seed: int, restarts: int) -> None:
        from hmmlearn.hmm import GaussianHMM

        X = self.m.reshape(-1, 1)
        best = None
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for k in range(restarts):
                h = GaussianHMM(n_components=2, covariance_type="full", n_iter=500,
                                tol=1e-5, random_state=seed + k, min_covar=1e-6)
                try:
                    h.fit(X)
                    score = h.score(X)
                except Exception:
                    continue
                if best is None or score > best[0]:
                    best = (score, h)
        if best is None:
            raise RuntimeError("HMM fit failed for every restart")
        h = best[1]
        order = np.argsort(np.sqrt(h.covars_[:, 0, 0]))  # state 0 = calm (lower vol)
        self.hmm_means = h.means_[order, 0]
        self.hmm_stds = np.sqrt(h.covars_[order, 0, 0])
        self.hmm_A = h.transmat_[np.ix_(order, order)]
        gamma = h.predict_proba(X)[:, order]
        self.hmm_gamma = gamma
        self.hmm_now = gamma[-1]
        self.hmm_loglik = float(best[0])
        # Asset means per regime (posterior-weighted), shrunk toward the pooled mean.
        n_k = gamma.sum(axis=0)
        k_prior = 12.0
        regime_mu = (gamma.T @ self.R) / np.maximum(n_k[:, None], 1e-9)
        self.regime_mu = (n_k[:, None] * regime_mu + k_prior * self.mu) / (n_k[:, None] + k_prior)
        # Regime volatility scales the pooled covariance by the Nifty's regime/overall ratio.
        self.regime_scale = self.hmm_stds / self.m.std(ddof=1)
        evals, evecs = np.linalg.eig(self.hmm_A.T)
        stat = np.real(evecs[:, np.argmax(np.real(evals))])
        self.hmm_stationary = stat / stat.sum()
        self.hmm_counts = n_k


def cmd_estimate(args) -> None:
    ensure_dirs()
    R, m = load_returns()
    fit = Fit(R.to_numpy(), m.to_numpy())
    sample_cov = np.cov(R.to_numpy(), rowvar=False)
    log(f"Window: {R.index[0].strftime('%Y-%m')} to {R.index[-1].strftime('%Y-%m')}  ({fit.T} months, {fit.N} assets)")
    log(f"Ledoit-Wolf shrinkage intensity: {fit.shrinkage:.3f}  "
        f"(condition number {np.linalg.cond(sample_cov):.0f} -> {np.linalg.cond(fit.cov):.0f})")
    mu_tbl = pd.DataFrame({"mean_%/mo": fit.mu * 100, "vol_%/mo": np.sqrt(np.diag(fit.cov)) * 100}, index=R.columns)
    log("\nMonthly estimates (log returns):")
    log(mu_tbl.round(3).to_string())
    log("\nMarkov chain on Nifty months (down / flat / up)")
    log(f"  thresholds: down < {fit.thresholds[0]*100:.2f}%  |  up > {fit.thresholds[1]*100:.2f}%")
    log(pd.DataFrame(fit.markov_P, index=["down", "flat", "up"], columns=["down", "flat", "up"]).round(2).to_string())
    log("  expected streak (months): " + ", ".join(
        f"{n}={1/(1-fit.markov_P[i, i]):.1f}" for i, n in enumerate(["down", "flat", "up"])))
    log(f"  current state: {['down', 'flat', 'up'][fit.markov_current]}")
    names = ["calm", "stressed"]
    log("\nHidden Markov Model on Nifty months (2 regimes)")
    for k in range(2):
        log(f"  {names[k]:9s} mean {fit.hmm_means[k]*100:6.2f}%/mo  vol {fit.hmm_stds[k]*100:5.2f}%/mo  "
            f"stay {fit.hmm_A[k, k]:.2f}  duration {1/(1-fit.hmm_A[k, k]):.1f} mo  "
            f"long-run share {fit.hmm_stationary[k]:.2f}  months {fit.hmm_counts[k]:.0f}")
    log(f"  current regime probabilities: calm {fit.hmm_now[0]:.2f}, stressed {fit.hmm_now[1]:.2f}")
    if fit.hmm_counts.min() < 8:
        log("  WARN: one regime has very few months; treat HMM results as indicative only.")
    params = {
        "window": [R.index[0].strftime("%Y-%m"), R.index[-1].strftime("%Y-%m")],
        "assets": list(R.columns), "muMonthlyLog": fit.mu.tolist(), "covLedoitWolf": fit.cov.tolist(),
        "shrinkage": fit.shrinkage,
        "markov": {"thresholds": list(fit.thresholds), "transition": fit.markov_P.tolist(),
                   "currentState": ["down", "flat", "up"][fit.markov_current]},
        "hmm": {"regimes": names, "means": fit.hmm_means.tolist(), "stds": fit.hmm_stds.tolist(),
                "transition": fit.hmm_A.tolist(), "stationary": fit.hmm_stationary.tolist(),
                "currentProbabilities": fit.hmm_now.tolist()},
    }
    (DATA / "params.json").write_text(json.dumps(params, indent=2))
    log(f"\nSaved {DATA / 'params.json'}")


# ============================================================ 4. SIMULATE ====
MODELS = ["gbm", "bootstrap", "markov", "hmm"]
BLOCK = 3  # months per bootstrap block


def _step(P: np.ndarray, state: np.ndarray, rng) -> np.ndarray:
    cum = P.cumsum(axis=1)[state]
    nxt = (rng.random(len(state))[:, None] > cum).sum(axis=1)
    return np.minimum(nxt, P.shape[0] - 1)


def draw_log_returns(model: str, fit: Fit, c: int, H: int, rng) -> np.ndarray:
    """(c paths, H months, N assets) of monthly log returns."""
    N = fit.N
    if model == "gbm":  # correlated normal log returns (arithmetic mean/vol are implied)
        return fit.mu + rng.standard_normal((c, H, N)) @ fit.chol.T
    if model == "bootstrap":  # moving-block bootstrap of real months
        nb = -(-H // BLOCK)
        starts = rng.integers(0, fit.T - BLOCK + 1, size=(c, nb))
        idx = (starts[:, :, None] + np.arange(BLOCK)).reshape(c, nb * BLOCK)[:, :H]
        return fit.R[idx]
    if model == "markov":  # Nifty state chain; each month resampled from real months in that state
        out = np.empty((c, H, N))
        state = np.full(c, fit.markov_current)
        for t in range(H):
            state = _step(fit.markov_P, state, rng)
            for s in range(3):
                mask = state == s
                k = int(mask.sum())
                if k:
                    pool = fit.markov_pools[s] if len(fit.markov_pools[s]) else np.arange(fit.T)
                    out[mask, t] = fit.R[pool[rng.integers(0, len(pool), size=k)]]
        return out
    if model == "hmm":  # regime-switching: regime mean + regime-scaled covariance
        out = np.empty((c, H, N))
        state = rng.choice(2, size=c, p=fit.hmm_now / fit.hmm_now.sum())
        for t in range(H):
            state = _step(fit.hmm_A, state, rng)
            z = rng.standard_normal((c, N)) @ fit.chol.T
            out[:, t, :] = fit.regime_mu[state] + fit.regime_scale[state][:, None] * z
        return out
    raise ValueError(model)


def portfolio_returns(model: str, fit: Fit, w: np.ndarray, H: int, n: int, rng, chunk: int = 2000) -> np.ndarray:
    """(n paths, H months) of monthly simple portfolio returns, rebalanced monthly."""
    out = np.empty((n, H))
    for a in range(0, n, chunk):
        b = min(n, a + chunk)
        out[a:b] = np.expm1(draw_log_returns(model, fit, b - a, H, rng)) @ w
    return out


def wealth_paths(ret: np.ndarray, w0: float, contribution: float) -> np.ndarray:
    n, H = ret.shape
    out = np.empty((n, H + 1))
    wealth = np.full(n, w0, dtype=float)
    out[:, 0] = wealth
    for t in range(H):
        wealth = (wealth + contribution) * (1 + ret[:, t])
        out[:, t + 1] = wealth
    return out


def summarize(ret: np.ndarray, args) -> dict:
    H = ret.shape[1]
    wealth = wealth_paths(ret, args.initial, args.contribution)
    pct = [5, 25, 50, 75, 95]
    bands = {str(p): np.percentile(wealth, p, axis=0).round(0).tolist() for p in pct}
    terminal = wealth[:, -1]
    real = terminal / (1 + args.inflation) ** (H / MONTHS_PER_YEAR)
    one_year = np.prod(1 + ret[:, : min(12, H)], axis=1) - 1
    q5 = np.percentile(one_year, 5)
    index = np.concatenate([np.ones((ret.shape[0], 1)), np.cumprod(1 + ret, axis=1)], axis=1)
    dd = (index / np.maximum.accumulate(index, axis=1) - 1).min(axis=1)
    return {
        "bands": bands,
        "terminalNominal": {str(p): float(np.percentile(terminal, p)) for p in pct},
        "terminalReal": {str(p): float(np.percentile(real, p)) for p in pct},
        "probGoalReal": float((real >= args.goal).mean()) if args.goal else None,
        "oneYearVaR95": float(-q5),
        "oneYearCVaR95": float(-one_year[one_year <= q5].mean()),
        "maxDrawdownMedian": float(np.median(dd)),
        "maxDrawdownP95Worst": float(np.percentile(dd, 5)),
        "probLossOfContributions": float((terminal < args.initial + args.contribution * H).mean()),
    }


def plot_fan(summary: dict, title: str, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    b = summary["bands"]
    x = np.arange(len(b["50"])) / MONTHS_PER_YEAR
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.fill_between(x, np.array(b["5"]) / 1e5, np.array(b["95"]) / 1e5, alpha=0.20, label="5th-95th percentile")
    ax.fill_between(x, np.array(b["25"]) / 1e5, np.array(b["75"]) / 1e5, alpha=0.35, label="25th-75th percentile")
    ax.plot(x, np.array(b["50"]) / 1e5, linewidth=2, label="Median")
    ax.set_xlabel("Years from today")
    ax.set_ylabel("Portfolio value (Rs lakh, nominal)")
    ax.set_title(title)
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def cmd_simulate(args) -> None:
    ensure_dirs()
    R, m = load_returns()
    w, wname = parse_weights(args.weights, list(R.columns))
    fit = Fit(R.to_numpy(), m.to_numpy())
    meta = json.loads((DATA / "meta.json").read_text()) if (DATA / "meta.json").exists() else {}
    models = MODELS if args.model == "all" else [args.model]
    H = args.horizon
    log(f"Portfolio '{wname}': " + ", ".join(f"{c}={x:.1%}" for c, x in zip(R.columns, w) if x > 0))
    log(f"{args.paths:,} paths x {H} months | start Rs {args.initial:,.0f} | monthly Rs {args.contribution:,.0f} | "
        f"goal Rs {args.goal:,.0f} in today's money | inflation {args.inflation:.1%} | seed {args.seed}\n")
    rows = []
    for model in models:
        rng = np.random.default_rng(args.seed)
        ret = portfolio_returns(model, fit, w, H, args.paths, rng)
        s = summarize(ret, args)
        result = {
            "model": model, "portfolio": wname, "weights": dict(zip(R.columns, w.round(6).tolist())),
            "horizonMonths": H, "paths": args.paths, "seed": args.seed, "initial": args.initial,
            "monthlyContribution": args.contribution, "goalToday": args.goal, "inflation": args.inflation,
            "dataWindow": [R.index[0].strftime("%Y-%m"), R.index[-1].strftime("%Y-%m")],
            "dataSource": meta.get("source"), "regimeNow": dict(zip(["calm", "stressed"], fit.hmm_now.round(3).tolist())),
            **s,
            "note": "Model-based probabilities under stated assumptions; not predictions or advice.",
        }
        (RESULTS / f"forecast_{wname}_{model}.json").write_text(json.dumps(result))
        plot_fan(s, f"{model.upper()} | {wname} portfolio | {args.paths:,} paths", RESULTS / f"fan_{wname}_{model}.png")
        rows.append({
            "model": model,
            "median_Rs_lakh": s["terminalNominal"]["50"] / 1e5,
            "p5_Rs_lakh": s["terminalNominal"]["5"] / 1e5,
            "p95_Rs_lakh": s["terminalNominal"]["95"] / 1e5,
            "P(goal real)": s["probGoalReal"],
            "VaR95_1y": s["oneYearVaR95"], "CVaR95_1y": s["oneYearCVaR95"],
            "median_maxDD": s["maxDrawdownMedian"],
        })
    pd.set_option("display.width", 200)
    log(pd.DataFrame(rows).set_index("model").round(3).to_string())
    log(f"\nSaved JSON + fan charts in {RESULTS}")


# ============================================================ 5. VALIDATE ====
def crps(sample: np.ndarray, y: float) -> float:
    """Continuous ranked probability score of a sample forecast (lower is better)."""
    x = np.sort(sample)
    n = len(x)
    gmd = 2.0 / n**2 * np.sum((2 * np.arange(1, n + 1) - n - 1) * x)  # E|X - X'|
    return float(np.mean(np.abs(x - y)) - 0.5 * gmd)


def cmd_validate(args) -> None:
    ensure_dirs()
    R, m = load_returns()
    w, wname = parse_weights(args.weights, list(R.columns))
    Rn, mn = R.to_numpy(), m.to_numpy()
    T, H, min_train = len(Rn), 12, args.min_train
    if T - H - min_train < 12:
        sys.exit(f"Need more history: {T} months available, need at least {min_train + H + 12}.")
    origins = list(range(min_train, T - H + 1))
    log(f"Walk-forward: {len(origins)} forecast origins, expanding window (min {min_train} months), "
        f"12-month-ahead cumulative return of the '{wname}' portfolio, {args.paths:,} paths per forecast.")
    log("No look-ahead: every forecast is fitted only on months before its origin.\n")
    rows = []
    for i, tau in enumerate(origins):
        fit = Fit(Rn[:tau], mn[:tau], seed=SEED + tau, hmm_restarts=4)
        realized = float(np.prod(1 + np.expm1(Rn[tau:tau + H]) @ w) - 1)
        for model in MODELS:
            rng = np.random.default_rng(SEED + tau)
            cum = np.prod(1 + portfolio_returns(model, fit, w, H, args.paths, rng), axis=1) - 1
            lo5, lo25, hi75, hi95 = np.percentile(cum, [5, 25, 75, 95])
            rows.append({
                "origin": R.index[tau - 1].strftime("%Y-%m"), "model": model, "realized": realized,
                "p5": lo5, "p25": lo25, "p50": float(np.median(cum)), "p75": hi75, "p95": hi95,
                "in90": lo5 <= realized <= hi95, "in50": lo25 <= realized <= hi75,
                "below5": realized < lo5, "above95": realized > hi95,
                "pit": float((cum <= realized).mean()), "crps": crps(cum[:2000], realized),
            })
        if (i + 1) % 10 == 0 or i + 1 == len(origins):
            log(f"  {i + 1}/{len(origins)} origins done")
    df = pd.DataFrame(rows)
    df.round(5).to_csv(DATA / "validation_results.csv", index=False)
    g = df.groupby("model", sort=False)
    summary = pd.DataFrame({
        "coverage_90 (target 0.90)": g["in90"].mean(),
        "coverage_50 (target 0.50)": g["in50"].mean(),
        "below_p5 (target 0.05)": g["below5"].mean(),
        "above_p95 (target 0.05)": g["above95"].mean(),
        "mean_width_90": g.apply(lambda x: (x["p95"] - x["p5"]).mean()),
        "mean_CRPS (lower=better)": g["crps"].mean(),
    })
    pd.set_option("display.width", 200)
    log("\n" + summary.round(3).to_string())
    summary.round(4).to_csv(DATA / "validation_summary.csv")

    worst = df[df["model"] == "gbm"].nsmallest(5, "realized")["origin"].tolist()
    log("\nFive worst realised 12-month windows: percentile rank of the outcome inside each model's forecast")
    log("(a crash the model 'expected' sits near 0.2-0.5; a value near 0.00 means the model was surprised)")
    log(df[df["origin"].isin(worst)].pivot(index="origin", columns="model", values="pit")
        .join(df[df["model"] == "gbm"].set_index("origin")["realized"].rename("realized_12m"))
        .round(3).to_string())
    log(f"\nCaution: windows overlap, so the {len(origins)} origins hold only about {len(origins)/12:.0f} "
        f"independent years. Treat coverage figures as indicative, not proof.")
    plot_validation(df, DATA / "validation.png")
    log(f"Saved {DATA / 'validation_summary.csv'} and validation.png")


def plot_validation(df: pd.DataFrame, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.2), sharey=True)
    for ax, model in zip(axes, ["gbm", "hmm"]):
        d = df[df["model"] == model].reset_index(drop=True)
        ax.fill_between(d.index, d["p5"] * 100, d["p95"] * 100, alpha=0.25, label="5th-95th forecast band")
        ax.plot(d.index, d["p50"] * 100, linewidth=1, label="Forecast median")
        ax.plot(d.index, d["realized"] * 100, color="black", linewidth=1.5, label="Realised 12m return")
        ax.set_title(f"{model.upper()} | coverage {d['in90'].mean():.0%}")
        ax.set_xticks(d.index[::6])
        ax.set_xticklabels(d["origin"][::6], rotation=45, ha="right", fontsize=7)
        ax.grid(alpha=0.3)
    axes[0].set_ylabel("12-month portfolio return (%)")
    axes[0].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


# ============================================================ 6. PUBLISH =====
def cmd_publish(args) -> None:
    """Copy only derived results (no Yahoo price series) to the web app's public folder."""
    PUBLIC.mkdir(parents=True, exist_ok=True)
    copied = []
    for src in sorted(RESULTS.glob("forecast_*.json")) + [DATA / "params.json", DATA / "validation_summary.csv"]:
        if src.exists():
            shutil.copy(src, PUBLIC / src.name)
            copied.append(src.name)
    log(f"Copied {len(copied)} derived files to {PUBLIC}")


# ============================================================ CLI ============
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch", help="download and store Yahoo Finance data")
    f.add_argument("--years", type=int, default=10)

    sub.add_parser("check", help="data-quality report")
    sub.add_parser("estimate", help="mean, Ledoit-Wolf covariance, Markov chain, HMM")

    def sim_args(s):
        s.add_argument("--weights", default="equal", help="equal | stocks | growth | RELIANCE=0.2,TCS=0.1,...")
        s.add_argument("--paths", type=int, default=10_000)
        s.add_argument("--seed", type=int, default=SEED)

    s = sub.add_parser("simulate", help="Monte Carlo / bootstrap / Markov / HMM forecasts")
    s.add_argument("--model", choices=MODELS + ["all"], default="all")
    s.add_argument("--horizon", type=int, default=120, help="months")
    s.add_argument("--initial", type=float, default=1_000_000)
    s.add_argument("--contribution", type=float, default=20_000, help="added every month")
    s.add_argument("--goal", type=float, default=5_000_000, help="target in today's rupees")
    s.add_argument("--inflation", type=float, default=0.05)
    sim_args(s)

    v = sub.add_parser("validate", help="walk-forward test of all four models")
    v.add_argument("--min-train", type=int, default=60)
    sim_args(v)
    v.set_defaults(paths=4_000)

    sub.add_parser("publish", help="copy derived JSON to frontend/public/data/forecast")

    a = sub.add_parser("all", help="fetch, check, estimate, simulate, validate, publish")
    a.add_argument("--years", type=int, default=10)
    a.add_argument("--skip-fetch", action="store_true")
    return p


def main() -> None:
    args = build_parser().parse_args()
    if args.cmd == "all":
        defaults = build_parser()
        steps = [] if args.skip_fetch else [("fetch", ["--years", str(args.years)])]
        steps += [("check", []), ("estimate", []), ("simulate", []), ("validate", []), ("publish", [])]
        for name, extra in steps:
            log(f"\n{'=' * 20} {name.upper()} {'=' * 20}")
            ns = defaults.parse_args([name, *extra])
            globals()[f"cmd_{name}"](ns)
        return
    globals()[f"cmd_{args.cmd}"](args)


if __name__ == "__main__":
    main()