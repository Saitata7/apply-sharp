/**
 * Side panel header. Shows the current job title, company, and source platform
 * for the active tab. Anchored at the top of the panel above all insight cards.
 *
 * Receives a TabJobContext from the background per-tab store via useTabJobContext.
 * The header is the ONLY surface that knows the tab id; insight cards consume
 * the context shape, not the routing.
 */

import type { TabJobContext } from '@shared/types/sidepanel.types';

interface Props {
  context: TabJobContext;
}

export default function SidePanelHeader({ context }: Props): JSX.Element {
  const { jobTitle, companyName, platform } = context;
  return (
    <header className="sp-header" role="banner">
      <h1 className="sp-header__title">{jobTitle}</h1>
      <p className="sp-header__company">{companyName || 'Unknown company'}</p>
      {platform && (
        <div className="sp-header__meta">
          <span className="sp-header__badge">{platform}</span>
        </div>
      )}
    </header>
  );
}
