export const DISCLAIMER =
  "PortfolioPilot is an educational and analytical prototype. Simulations and recommendations are illustrative and do not constitute personalized investment advice or a guarantee of future returns.";

export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

export const number = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
