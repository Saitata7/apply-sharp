import { describe, it, expect } from 'vitest';
import {
  normalizeForRepostMatch,
  normalizeCompany,
  normalizeTitle,
  isSameRolePosting,
} from './reposting-normalizer';

describe('reposting-normalizer', () => {
  describe('normalizeTitle', () => {
    it('lowercases', () => {
      expect(normalizeTitle('Senior Backend Engineer')).toBe('backend engineer');
    });

    it('strips parentheticals', () => {
      expect(normalizeTitle('Backend Engineer (Remote)')).toBe('backend engineer');
      expect(normalizeTitle('Backend Engineer [US]')).toBe('backend engineer');
    });

    it('strips trailing geo modifiers', () => {
      expect(normalizeTitle('Backend Engineer - Remote')).toBe('backend engineer');
      expect(normalizeTitle('Backend Engineer - US')).toBe('backend engineer');
      expect(normalizeTitle('Backend Engineer - North America')).toBe('backend engineer');
    });

    it('strips seniority modifiers (preserves canonical role)', () => {
      expect(normalizeTitle('Senior Backend Engineer')).toBe('backend engineer');
      expect(normalizeTitle('Staff Backend Engineer')).toBe('backend engineer');
      expect(normalizeTitle('Junior Backend Engineer')).toBe('backend engineer');
      expect(normalizeTitle('Principal Backend Engineer')).toBe('backend engineer');
    });

    it('collides "Senior Engineer" with "Senior Engineer" (true positive)', () => {
      expect(normalizeTitle('Senior Engineer')).toBe(normalizeTitle('Senior Engineer'));
    });

    it('handles punctuation and extra whitespace', () => {
      expect(normalizeTitle('  Senior Backend Engineer / Tech Lead  ')).toBe(
        'backend engineer tech'
      );
    });

    it('returns empty string for null and undefined', () => {
      expect(normalizeTitle(null)).toBe('');
      expect(normalizeTitle(undefined)).toBe('');
      expect(normalizeTitle('')).toBe('');
    });

    it('handles "Senior Engineer (Remote)" === "senior engineer"', () => {
      expect(normalizeTitle('Senior Engineer (Remote)')).toBe('engineer');
      expect(normalizeTitle('senior engineer')).toBe('engineer');
    });

    it('does NOT collapse meaningfully different roles', () => {
      expect(normalizeTitle('Backend Engineer')).not.toBe(normalizeTitle('Frontend Engineer'));
      expect(normalizeTitle('Data Scientist')).not.toBe(normalizeTitle('Data Engineer'));
    });

    it('strips Roman numeral seniority modifiers', () => {
      expect(normalizeTitle('Backend Engineer II')).toBe('backend engineer');
      expect(normalizeTitle('Backend Engineer III')).toBe('backend engineer');
    });
  });

  describe('normalizeCompany', () => {
    it('strips Inc/LLC/Corp suffixes', () => {
      expect(normalizeCompany('Acme Inc')).toBe('acme');
      expect(normalizeCompany('Acme, LLC')).toBe('acme');
      expect(normalizeCompany('Acme Corp.')).toBe('acme');
      expect(normalizeCompany('Acme Limited')).toBe('acme');
    });

    it('preserves the company name otherwise', () => {
      expect(normalizeCompany('Acme Robotics')).toBe('acme robotics');
    });

    it('handles null and undefined', () => {
      expect(normalizeCompany(null)).toBe('');
      expect(normalizeCompany(undefined)).toBe('');
    });
  });

  describe('isSameRolePosting', () => {
    it('matches the same role at the same company across formatting variations', () => {
      const a = { company: 'Acme Inc', title: 'Senior Backend Engineer (Remote)' };
      const b = { company: 'Acme', title: 'Backend Engineer - US' };
      expect(isSameRolePosting(a, b)).toBe(true);
    });

    it('does not collide different roles at the same company', () => {
      const a = { company: 'Acme', title: 'Backend Engineer' };
      const b = { company: 'Acme', title: 'Frontend Engineer' };
      expect(isSameRolePosting(a, b)).toBe(false);
    });

    it('does not collide same role at different companies', () => {
      const a = { company: 'Acme', title: 'Backend Engineer' };
      const b = { company: 'Globex', title: 'Backend Engineer' };
      expect(isSameRolePosting(a, b)).toBe(false);
    });
  });

  describe('normalizeForRepostMatch (alias)', () => {
    it('exposes the same normalization as normalizeTitle', () => {
      expect(normalizeForRepostMatch('Senior Engineer (Remote)')).toBe(
        normalizeTitle('Senior Engineer (Remote)')
      );
    });
  });
});
