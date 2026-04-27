/**
 * Tests for the confirmation page detection rules.
 *
 * Synthesizes a fake location + DOM body for each platform and verifies the
 * matcher returns the correct rule. The actual page-load wiring (the
 * MutationObserver, the fire-once throttle, the form-interacted flag) lives
 * in the passive submit watcher and is tested separately.
 */

import { describe, it, expect } from 'vitest';
import { matchConfirmationRule } from './confirmation-detectors';

function makeLocation(
  host: string,
  path: string = '/'
): {
  hostname: string;
  pathname: string;
  href: string;
} {
  return { hostname: host, pathname: path, href: `https://${host}${path}` };
}

function makeBody(text: string): { body: { innerText: string } } {
  return { body: { innerText: text } };
}

describe('confirmation rule matching', () => {
  it('matches Wellfound apply-sent text', () => {
    const match = matchConfirmationRule(
      makeLocation('wellfound.com', '/jobs/12345'),
      makeBody('Thanks. We have sent your application to Jireh.')
    );
    expect(match?.platform).toBe('wellfound');
  });

  it('matches Greenhouse confirmation page with URL hint', () => {
    const match = matchConfirmationRule(
      makeLocation('boards.greenhouse.io', '/acme/jobs/12345/confirmation'),
      makeBody('Thank you for applying to Acme!')
    );
    expect(match?.platform).toBe('greenhouse');
  });

  it('matches Lever apply/thanks page', () => {
    const match = matchConfirmationRule(
      makeLocation('jobs.lever.co', '/acme/abc-def/apply/thanks'),
      makeBody('Application submitted. We will be in touch.')
    );
    expect(match?.platform).toBe('lever');
  });

  it('matches Workday submission text', () => {
    const match = matchConfirmationRule(
      makeLocation('acme.myworkdayjobs.com', '/careers'),
      makeBody('You have submitted your application.')
    );
    expect(match?.platform).toBe('workday');
  });

  it('matches Ashby application received text', () => {
    const match = matchConfirmationRule(
      makeLocation('jobs.ashbyhq.com', '/acme/abc'),
      makeBody('Application received. Thanks.')
    );
    expect(match?.platform).toBe('ashby');
  });

  it('matches SmartRecruiters thanks page', () => {
    const match = matchConfirmationRule(
      makeLocation('jobs.smartrecruiters.com', '/acme/12345'),
      makeBody('Thanks for applying to Acme.')
    );
    expect(match?.platform).toBe('smartrecruiters');
  });

  it('matches Workable submitted text', () => {
    const match = matchConfirmationRule(
      makeLocation('apply.workable.com', '/acme/j/abc/apply/'),
      makeBody('Your application has been submitted.')
    );
    expect(match?.platform).toBe('workable');
  });

  it('matches workatastartup.com', () => {
    const match = matchConfirmationRule(
      makeLocation('workatastartup.com', '/jobs/12345/apply'),
      makeBody('Your application submitted. We will be in touch.')
    );
    expect(match?.platform).toBe('workatastartup');
  });

  it('falls through to generic when on a confirmation URL but unknown host', () => {
    const match = matchConfirmationRule(
      makeLocation('careers.unknown-co.com', '/apply/confirmation'),
      makeBody('Thank you for applying!')
    );
    expect(match?.platform).toBe('other');
  });

  it('does NOT match a JD page (no submit text, no submit URL)', () => {
    const match = matchConfirmationRule(
      makeLocation('boards.greenhouse.io', '/acme/jobs/12345'),
      makeBody('Senior Backend Engineer at Acme. Apply now.')
    );
    expect(match).toBe(null);
  });

  it('does NOT match a JD page on Wellfound', () => {
    const match = matchConfirmationRule(
      makeLocation('wellfound.com', '/jobs/12345'),
      makeBody('Senior AI Engineer. Build AI tooling.')
    );
    expect(match).toBe(null);
  });
});
