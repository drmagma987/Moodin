import Link from "next/link";
import reportJson from "@/lib/fantasy/data/historicalBacktestReport.generated.json";
import {
  assertHistoricalBacktestReport,
  type HistoricalBacktestReport,
} from "@/lib/fantasy/historicalBacktest";
import { rookieWrValidation } from "@/lib/fantasy/data/rookieWrValidation.generated";

const report = reportJson as HistoricalBacktestReport;
assertHistoricalBacktestReport(report);

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function delta(model: number, stock: number) {
  const difference = model - stock;
  return `${difference >= 0 ? "+" : ""}${difference.toFixed(3)}`;
}

export default function FantasyBacktestPage() {
  return (
    <main className="min-h-screen bg-[#06101d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(245,158,11,0.09),transparent_26%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Historical model lab</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Did our board beat stock?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              A leakage-safe replay of the 2023–2025 draft rooms under H-Town Heroes scoring. Outcome-season stats are hidden until evaluation.
            </p>
          </div>
          <Link href="/fantasy-football" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-slate-200 hover:bg-white/10">
            Back to board
          </Link>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Verdict", report.aggregate.verdict.replace("-", " ")],
            ["Realized rank edge", delta(report.aggregate.realizedModelSpearman, report.aggregate.realizedStockSpearman)],
            ["Adjusted rank edge", delta(report.aggregate.adjustedModelSpearman, report.aggregate.adjustedStockSpearman)],
            ["Adjusted disagreement wins", percent(report.aggregate.adjustedDisagreementWinRate)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-[#0a1727]/90 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black capitalize text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4 text-sm leading-6 text-cyan-50">
          <strong>Read this as directional, not a victory lap.</strong> The reconstructed model was slightly better than ADP overall and won {percent(report.aggregate.adjustedDisagreementWinRate)} of meaningful disagreements after availability adjustment. Three seasons are useful evidence, but still not proof of a durable edge.
        </section>

        <section className={`mt-6 rounded-[24px] border p-5 ${rookieWrValidation.activationEligible ? "border-emerald-300/25 bg-emerald-300/[0.06]" : "border-amber-300/25 bg-amber-300/[0.06]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-black uppercase tracking-[0.18em] ${rookieWrValidation.activationEligible ? "text-emerald-300" : "text-amber-300"}`}>Rookie WR production gate</p>
              <h2 className="mt-1 text-2xl font-black">{rookieWrValidation.activationEligible ? "Eligible for production" : "Blocked—shadow only"}</h2>
            </div>
            <p className="text-right text-xs leading-5 text-slate-400">{rookieWrValidation.samples} player-seasons<br />{rookieWrValidation.holdoutSeasons.length} forward holdouts</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Market MAE</p><p className="mt-1 text-xl font-black">{rookieWrValidation.marketMae.toFixed(3)}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Nested selected MAE</p><p className="mt-1 text-xl font-black">{rookieWrValidation.researchMae.toFixed(3)}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Direct-ADP MAE lift</p><p className="mt-1 text-xl font-black">{percent(rookieWrValidation.segments.directAdp.maeImprovement)}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Improved holdouts</p><p className="mt-1 text-xl font-black">{rookieWrValidation.stableHoldouts}/{rookieWrValidation.holdoutSeasons.length}</p></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Opportunity looked promising when selected after viewing every holdout, but the nested test removes that hindsight. Each fold now chooses its lane using only earlier seasons. The resulting challenger regressed overall and against direct ADP, so it remains a visible target-volume shadow comparison with zero ranking impact.
          </p>
          {rookieWrValidation.blockers.length > 0 ? <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-100">{rookieWrValidation.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul> : null}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {report.seasons.map((season) => (
            <article key={season.season} className="rounded-[24px] border border-white/10 bg-[#0a1727]/90 p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">{season.season} replay</p>
                  <h2 className="mt-1 text-2xl font-black">{season.matchedOutcomeCount} matched players</h2>
                </div>
                <p className="text-right text-xs text-slate-500">Cutoff<br />{season.preseasonCutoff.slice(0, 10)}</p>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/20 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2">Test</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2">Edge</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-white/5"><td className="px-3 py-3 font-bold">Realized rank</td><td className="px-3 py-3">{season.metrics.realized.modelSpearman.toFixed(3)}</td><td className="px-3 py-3">{season.metrics.realized.stockSpearman.toFixed(3)}</td><td className="px-3 py-3 font-black text-cyan-200">{delta(season.metrics.realized.modelSpearman, season.metrics.realized.stockSpearman)}</td></tr>
                    <tr className="border-t border-white/5"><td className="px-3 py-3 font-bold">17-game rate</td><td className="px-3 py-3">{season.metrics.availabilityAdjusted.modelSpearman.toFixed(3)}</td><td className="px-3 py-3">{season.metrics.availabilityAdjusted.stockSpearman.toFixed(3)}</td><td className="px-3 py-3 font-black text-cyan-200">{delta(season.metrics.availabilityAdjusted.modelSpearman, season.metrics.availabilityAdjusted.stockSpearman)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                Meaningful disagreement wins: {percent(season.metrics.realized.disagreementWinRate)} realized · {percent(season.metrics.availabilityAdjusted.disagreementWinRate)} adjusted. Stat-active availability: {season.availability.full} full, {season.availability.partial} partial, {season.availability.low} low-game profiles.
              </p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0a1727]/90 p-5">
          <h2 className="text-xl font-black">Did the quick calls separate?</h2>
          <p className="mt-1 text-sm text-slate-400">Actual VOR and beat-stock rates by the board&apos;s Target / Pass / Smash call.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {report.seasons.map((season) => (
              <div key={season.season} className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <caption className="bg-black/20 px-3 py-2 text-left text-xs font-black text-amber-200">{season.season}</caption>
                  <thead className="text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2">Call</th><th className="px-3 py-2">N</th><th className="px-3 py-2">VOR</th><th className="px-3 py-2">Beat stock</th></tr></thead>
                  <tbody>{season.calls.map((call) => <tr key={call.action} className="border-t border-white/5"><td className="px-3 py-2 font-black">{call.action}</td><td className="px-3 py-2">{call.players}</td><td className="px-3 py-2">{call.meanActualVor.toFixed(1)}</td><td className="px-3 py-2">{percent(call.beatStockRate)}</td></tr>)}</tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0a1727]/90 p-5">
          <h2 className="text-xl font-black">What should change—and what should not</h2>
          <p className="mt-1 text-sm text-slate-400">Generated from cross-season results. These are recommendations; the live ranking weights have not been changed.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {report.diagnostics.tuningSuggestions.map((suggestion) => (
              <article key={suggestion.title} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${suggestion.priority === "tune" ? "text-amber-300" : suggestion.priority === "keep" ? "text-emerald-300" : suggestion.priority === "data" ? "text-violet-300" : "text-cyan-300"}`}>
                  {suggestion.priority}
                </p>
                <h3 className="mt-1 font-black text-white">{suggestion.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{suggestion.evidence}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{suggestion.recommendation}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {[
            ["By position", report.diagnostics.positions],
            ["By draft range", report.diagnostics.draftRanges],
          ].map(([title, diagnostics]) => (
            <article key={title as string} className="rounded-[24px] border border-white/10 bg-[#0a1727]/90 p-5">
              <h2 className="text-xl font-black">{title as string}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Correlation edge is model minus stock, averaged equally across seasons.</p>
              <div className="mt-4 space-y-2">
                {(diagnostics as typeof report.diagnostics.positions).map((diagnostic) => (
                  <div key={diagnostic.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/5 bg-black/15 px-3 py-3 text-sm">
                    <div><p className="font-black">{diagnostic.label}</p><p className="text-xs text-slate-500">N {diagnostic.players}</p></div>
                    <div className="text-right"><p className={diagnostic.realizedEdge >= 0 ? "font-black text-cyan-200" : "font-black text-amber-200"}>{diagnostic.realizedEdge >= 0 ? "+" : ""}{diagnostic.realizedEdge.toFixed(3)}</p><p className="text-[10px] uppercase text-slate-500">realized</p></div>
                    <div className="text-right"><p className={diagnostic.adjustedEdge >= 0 ? "font-black text-cyan-200" : "font-black text-amber-200"}>{diagnostic.adjustedEdge >= 0 ? "+" : ""}{diagnostic.adjustedEdge.toFixed(3)}</p><p className="text-[10px] uppercase text-slate-500">adjusted</p></div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a1727]/90 p-5">
          <h2 className="text-xl font-black">Uncertainty check</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Positive values mean lower rank error for the model. The realized MAE edge is {report.diagnostics.uncertainty.realizedRankMaeEdge.estimate.toFixed(2)} ranks per player with a 95% bootstrap interval of {report.diagnostics.uncertainty.realizedRankMaeEdge.lower95.toFixed(2)} to {report.diagnostics.uncertainty.realizedRankMaeEdge.upper95.toFixed(2)}. The adjusted edge is {report.diagnostics.uncertainty.adjustedRankMaeEdge.estimate.toFixed(2)} ranks, interval {report.diagnostics.uncertainty.adjustedRankMaeEdge.lower95.toFixed(2)} to {report.diagnostics.uncertainty.adjustedRankMaeEdge.upper95.toFixed(2)}.
          </p>
        </section>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0a1727]/90 p-5">
          <h2 className="text-xl font-black">Historical roster pressure test</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">Twelve-round snake drafts from every slot, with stock-driven opponents and lineup-validity enforcement. This checks whether a ranking edge actually assembles better starters.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[report.diagnostics.rosterSimulation.stock, report.diagnostics.rosterSimulation.currentModel, report.diagnostics.rosterSimulation.proposedPocket].map((outcome) => (
              <div key={outcome.label} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-xs font-black text-slate-400">{outcome.label}</p>
                <p className="mt-2 text-2xl font-black">{outcome.averageRealizedStarterPoints.toFixed(0)}</p>
                <p className="text-[10px] uppercase text-slate-500">realized starter points</p>
                <p className="mt-2 text-xs text-slate-400">Adjusted {outcome.averageAdjustedStarterPoints.toFixed(0)} · Valid {percent(outcome.validRosterRate)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-sm leading-6 text-amber-50">
            {report.diagnostics.rosterSimulation.recommendation} The value-pocket queue therefore changes context and urgency—not the production ranking order.
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {report.diagnostics.rosterSimulation.leaveOneSeasonOut.map((outcome) => (
              <div key={outcome.heldOutSeason} className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-xs text-slate-400">
                <span className="font-black text-white">Hold out {outcome.heldOutSeason}</span><br />Factor {outcome.trainedFactor.toFixed(2)} · {outcome.heldOutWin ? "passed" : "did not pass"}
              </div>
            ))}
          </div>
        </section>

        <details className="mt-6 rounded-2xl border border-white/10 bg-[#0a1727]/90 p-5">
          <summary className="cursor-pointer font-black">Methodology and limits</summary>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            {report.caveats.map((caveat) => <li key={caveat}>• {caveat}</li>)}
          </ul>
        </details>
      </div>
    </main>
  );
}
