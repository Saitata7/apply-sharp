/**
 * Side panel root component.
 *
 * Hosts three insight cards stacked vertically:
 *   1. Job Insights (read-only ATS score relocation)
 *   2. Ghost Score (Workstream 8)
 *   3. Discovery (Workstream 9)
 *
 * The panel is per-tab: it reads its current job context from the background
 * per-tab store via the useTabJobContext hook, which subscribes to a long-lived
 * port for live updates. When the user switches tabs the panel re-renders with
 * the new tab's context.
 *
 * Empty state when no tab context exists. Cards mount inside cardSlots so
 * adding a new card later does not require touching App.tsx structure.
 */

import { useEffect, useState } from 'react';
import { useTabJobContext } from './hooks/useTabJobContext';
import EmptyState from './components/EmptyState';
import SidePanelHeader from './components/SidePanelHeader';
import JobInsightsCard from './components/JobInsightsCard';
import GhostScoreCard from './components/GhostScoreCard';
import DiscoveryCard from './components/DiscoveryCard';
import ContactsCard from './components/ContactsCard';
import LeadListCard from './components/LeadListCard';
import { DEFAULT_FLAGS, getAllFeatureFlags, type FeatureFlagKey } from '@shared/feature-flags';

export default function App(): JSX.Element {
  const { context, loading } = useTabJobContext();
  const [flags, setFlags] = useState<Record<FeatureFlagKey, boolean>>(DEFAULT_FLAGS);

  // Read feature flags once on mount. The shell still mounts even when
  // every flag is off - the user just sees the empty state.
  useEffect(() => {
    let cancelled = false;
    void getAllFeatureFlags().then((all) => {
      if (!cancelled) setFlags(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading shows the empty state too - the empty state is intentionally
  // silent (no spinner) so a quick context hydration does not flash a
  // loading bar.
  const Brand = (
    <div className="sp-brand" aria-label="ApplySharp">
      <span className="sp-brand__mark" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 128 128" fill="none">
          <circle cx="58" cy="70" r="34" stroke="currentColor" strokeWidth="8" opacity="0.4" />
          <circle cx="58" cy="70" r="22" stroke="currentColor" strokeWidth="8" opacity="0.85" />
          <circle cx="58" cy="70" r="9" fill="currentColor" />
          <path d="M58 70 L100 28" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
          <path
            d="M82 28 L100 28 L100 46"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="sp-brand__name">
        Apply<strong>Sharp</strong>
      </span>
    </div>
  );

  if (loading || !context) {
    return (
      <aside className="sp-root" role="complementary" aria-label="ApplySharp insights">
        {Brand}
        {flags['discovery.leadList'] && <LeadListCard />}
        <EmptyState />
      </aside>
    );
  }

  return (
    <aside className="sp-root" role="complementary" aria-label="ApplySharp insights">
      {Brand}
      <SidePanelHeader context={context} />
      <JobInsightsCard context={context} />
      {flags['discovery.ghostJob'] && <GhostScoreCard context={context} />}
      {(flags['discovery.portalRecommender'] ||
        flags['discovery.hnWhosHiring'] ||
        flags['discovery.ycDirectLinks']) && <DiscoveryCard context={context} />}
      {flags['discovery.leadList'] && <LeadListCard />}
      {flags['contacts.passiveExtraction'] && <ContactsCard context={context} />}
    </aside>
  );
}
