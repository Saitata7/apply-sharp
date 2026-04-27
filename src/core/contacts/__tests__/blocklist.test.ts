import { describe, it, expect } from 'vitest';
import {
  isPersonalWebmailDomain,
  isAnalyticsDomain,
  isSensitiveHost,
  PERSONAL_WEBMAIL_DOMAINS,
  ANALYTICS_DOMAINS,
} from '../blocklist';

describe('isPersonalWebmailDomain', () => {
  it('blocks gmail.com', () => {
    expect(isPersonalWebmailDomain('gmail.com')).toBe(true);
  });

  it('blocks proton.me', () => {
    expect(isPersonalWebmailDomain('proton.me')).toBe(true);
  });

  it('blocks outlook.com', () => {
    expect(isPersonalWebmailDomain('outlook.com')).toBe(true);
  });

  it('blocks icloud.com', () => {
    expect(isPersonalWebmailDomain('icloud.com')).toBe(true);
  });

  it('handles uppercase', () => {
    expect(isPersonalWebmailDomain('GMAIL.COM')).toBe(true);
  });

  it('does NOT block real company domains', () => {
    expect(isPersonalWebmailDomain('acme.co')).toBe(false);
    expect(isPersonalWebmailDomain('anthropic.com')).toBe(false);
  });

  it('handles null and empty input safely', () => {
    expect(isPersonalWebmailDomain(null as unknown as string)).toBe(false);
    expect(isPersonalWebmailDomain('')).toBe(false);
  });
});

describe('isAnalyticsDomain', () => {
  it('blocks sentry.io', () => {
    expect(isAnalyticsDomain('sentry.io')).toBe(true);
  });

  it('blocks mixpanel.com', () => {
    expect(isAnalyticsDomain('mixpanel.com')).toBe(true);
  });

  it('does NOT block real company domains', () => {
    expect(isAnalyticsDomain('acme.co')).toBe(false);
  });
});

describe('isSensitiveHost', () => {
  it('blocks .gov hostnames', () => {
    expect(isSensitiveHost('healthcare.gov')).toBe(true);
    expect(isSensitiveHost('irs.gov')).toBe(true);
  });

  it('blocks .bank TLD', () => {
    expect(isSensitiveHost('chase.bank')).toBe(true);
  });

  it('blocks .health TLD', () => {
    expect(isSensitiveHost('mayo.health')).toBe(true);
  });

  it('blocks .edu TLD (FERPA territory)', () => {
    expect(isSensitiveHost('records.harvard.edu')).toBe(true);
  });

  it('blocks personal-finance hostnames', () => {
    expect(isSensitiveHost('mint.com')).toBe(true);
    expect(isSensitiveHost('creditkarma.com')).toBe(true);
  });

  it('does NOT block normal company sites', () => {
    expect(isSensitiveHost('wellfound.com')).toBe(false);
    expect(isSensitiveHost('greenhouse.io')).toBe(false);
    expect(isSensitiveHost('lever.co')).toBe(false);
  });

  it('handles uppercase', () => {
    expect(isSensitiveHost('IRS.GOV')).toBe(true);
  });

  it('handles null and empty input safely', () => {
    expect(isSensitiveHost(null as unknown as string)).toBe(false);
    expect(isSensitiveHost('')).toBe(false);
  });
});

describe('blocklist data integrity', () => {
  it('every personal webmail domain is lowercase', () => {
    for (const d of PERSONAL_WEBMAIL_DOMAINS) {
      expect(d).toBe(d.toLowerCase());
    }
  });

  it('every analytics domain is lowercase', () => {
    for (const d of ANALYTICS_DOMAINS) {
      expect(d).toBe(d.toLowerCase());
    }
  });

  it('PERSONAL_WEBMAIL_DOMAINS contains the canonical big four', () => {
    expect(PERSONAL_WEBMAIL_DOMAINS.has('gmail.com')).toBe(true);
    expect(PERSONAL_WEBMAIL_DOMAINS.has('outlook.com')).toBe(true);
    expect(PERSONAL_WEBMAIL_DOMAINS.has('yahoo.com')).toBe(true);
    expect(PERSONAL_WEBMAIL_DOMAINS.has('icloud.com')).toBe(true);
  });
});
