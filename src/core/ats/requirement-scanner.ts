/**
 * JD Requirements Scanner
 * Detects job requirements from description and compares with user profile
 */

import type { SponsorshipStatus } from '@shared/types/job.types';

export interface RequirementGap {
  type: RequirementType;
  label: string;
  jdRequirement: string; // What the JD says
  userStatus: 'risk' | 'unknown' | 'met';
  userValue?: string; // What the user has
}

export type RequirementType =
  | 'citizenship'
  | 'security_clearance'
  | 'background_check'
  | 'sponsorship'
  | 'language'
  | 'location'
  | 'relocation'
  | 'drug_test'
  | 'remote_work';

export interface UserRequirementProfile {
  workAuthorization?: 'citizen' | 'permanent_resident' | 'visa' | 'other';
  requiresSponsorship?: boolean;
  securityClearance?: 'none' | 'public_trust' | 'secret' | 'top_secret' | 'ts_sci';
  canPassBackgroundCheck?: boolean;
  canPassDrugTest?: boolean;
  languages?: string[];
  city?: string;
  state?: string;
  willingToRelocate?: boolean;
  remotePreference?: 'remote' | 'hybrid' | 'onsite' | 'flexible';
}

interface RequirementPattern {
  type: RequirementType;
  label: string;
  patterns: RegExp[];
  extractValue?: (match: RegExpMatchArray, jd: string) => string;
}

const REQUIREMENT_PATTERNS: RequirementPattern[] = [
  // US Citizenship
  {
    type: 'citizenship',
    label: 'US Citizenship',
    patterns: [
      /\b(us|u\.s\.|united states)\s*(citizen(ship)?)\s*(required|only|must|is required)/i,
      /must be\s*(a\s*)?(us|u\.s\.|united states)\s*citizen/i,
      /citizen(ship)?\s*(of|in)\s*(the\s*)?(us|u\.s\.|united states)\s*(required|is required)/i,
      /requires?\s*(us|u\.s\.)\s*citizen(ship)?/i,
      /proof of\s*(us|u\.s\.)\s*citizen(ship)?/i,
    ],
  },
  // Security Clearance
  {
    type: 'security_clearance',
    label: 'Security Clearance',
    patterns: [
      /\b(active\s*)?(security\s*)?clearance\s*(required|needed|is required)/i,
      /\b(ts\/sci|top secret|secret|public trust)\s*(clearance)?\s*(required|needed|is required)?/i,
      /must\s*(have|hold|possess)\s*(an?\s*)?(active\s*)?(security\s*)?clearance/i,
      /ability to obtain\s*(a\s*)?(security\s*)?clearance/i,
      /clearance:\s*(ts\/sci|top secret|secret|public trust)/i,
    ],
    extractValue: (_match, jd) => {
      const text = jd.toLowerCase();
      if (text.includes('ts/sci') || text.includes('ts sci')) return 'TS/SCI';
      if (text.includes('top secret')) return 'Top Secret';
      if (text.includes('secret')) return 'Secret';
      if (text.includes('public trust')) return 'Public Trust';
      return 'Required';
    },
  },
  // Background Check
  {
    type: 'background_check',
    label: 'Background Check',
    patterns: [
      /background\s*(check|investigation|screening)\s*(required|is required|will be conducted)/i,
      /must\s*(pass|clear|undergo)\s*(a\s*)?background\s*(check|investigation|screening)/i,
      /subject to\s*(a\s*)?background\s*(check|investigation)/i,
      /criminal\s*(background|history)\s*(check|screening)/i,
    ],
  },
  // No Sponsorship
  {
    type: 'sponsorship',
    label: 'Visa Sponsorship',
    patterns: [
      /no\s*(visa\s*)?sponsorship/i,
      /cannot\s*(provide\s*)?(visa\s*)?sponsor(ship)?/i,
      /will\s*not\s*(provide\s*)?(visa\s*)?sponsor(ship)?/i,
      /not\s*(able|willing)\s*to\s*sponsor/i,
      /without\s*(visa\s*)?sponsorship/i,
      /must be authorized to work.*(without|no).*sponsor/i,
      /sponsorship\s*(is\s*)?not\s*(available|offered|provided)/i,
      /\bh[-\s]?1b\b.*(?:no|not|cannot|will not)/i,
      /(?:no|not|cannot|will not).*\bh[-\s]?1b\b/i,
      /must be (?:currently )?(?:legally )?authorized to work/i,
    ],
  },
  // Language Requirements
  {
    type: 'language',
    label: 'Language',
    patterns: [
      /\b(spanish|mandarin|chinese|french|german|japanese|korean|portuguese|arabic|hindi|russian|italian)\s*(required|preferred|fluency|proficiency|speaking)/i,
      /(fluent|proficient|fluency)\s*(in\s*)?(spanish|mandarin|chinese|french|german|japanese|korean|portuguese|arabic|hindi|russian|italian)/i,
      /bilingual\s*(in\s*)?(spanish|mandarin|chinese|french|english)/i,
      /(speak|speaking)\s*(spanish|mandarin|chinese|french|german|japanese|korean)/i,
    ],
    extractValue: (match) => {
      const languages = [
        'spanish',
        'mandarin',
        'chinese',
        'french',
        'german',
        'japanese',
        'korean',
        'portuguese',
        'arabic',
        'hindi',
        'russian',
        'italian',
      ];
      const matchText = match[0].toLowerCase();
      for (const lang of languages) {
        if (matchText.includes(lang)) {
          return lang.charAt(0).toUpperCase() + lang.slice(1);
        }
      }
      return 'Bilingual';
    },
  },
  // On-site / Location
  {
    type: 'location',
    label: 'On-site Work',
    patterns: [
      /\b(on-?site|in-?office)\s*(only|required|position|work|days?)/i,
      /must\s*(work|be)\s*(on-?site|in-?office|in\s*person)/i,
      /no\s*remote/i,
      /not\s*(a\s*)?remote\s*(position|role|job)/i,
      /this\s*(is\s*)?(an?\s*)?(on-?site|in-?office)\s*(position|role)/i,
      /\d+\s*days?\s*(per\s*week\s*)?(on-?site|in-?office)/i,
    ],
    extractValue: (_match, jd) => {
      const daysMatch = jd.match(/(\d+)\s*days?\s*(per\s*week\s*)?(on-?site|in-?office)/i);
      if (daysMatch) return `${daysMatch[1]} days/week on-site`;
      if (/on-?site\s*only/i.test(jd)) return 'On-site only';
      if (/no\s*remote/i.test(jd)) return 'No remote';
      return 'On-site required';
    },
  },
  // Relocation
  {
    type: 'relocation',
    label: 'Relocation',
    patterns: [
      /(must|willing\s*to)\s*relocate/i,
      /relocation\s*(required|necessary|needed)/i,
      /candidates?\s*(must|should)\s*be\s*(located|based)\s*(in|near)/i,
      /local\s*candidates?\s*(only|preferred)/i,
    ],
    extractValue: (_match, jd) => {
      // Try to extract location
      const locMatch = jd.match(/(located|based|relocate)\s*(in|to|near)\s*([A-Z][a-zA-Z\s,]+)/i);
      if (locMatch) return `Relocate to ${locMatch[3].trim()}`;
      return 'Relocation required';
    },
  },
  // Drug Test
  {
    type: 'drug_test',
    label: 'Drug Test',
    patterns: [
      /drug\s*(test|screen|screening)\s*(required|is required|will be conducted)?/i,
      /must\s*pass\s*(a\s*)?drug\s*(test|screen)/i,
      /subject to\s*(a\s*)?drug\s*(test|screening)/i,
      /pre-?employment\s*drug\s*(test|screening)/i,
    ],
  },
];

/**
 * Scan JD for requirements and compare with user profile
 * Returns only gaps (not met or unknown)
 */
export function scanRequirements(
  jobDescription: string,
  userProfile: UserRequirementProfile
): RequirementGap[] {
  const gaps: RequirementGap[] = [];
  const jdLower = jobDescription.toLowerCase();

  for (const pattern of REQUIREMENT_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = jobDescription.match(regex);
      if (match) {
        const jdRequirement = pattern.extractValue
          ? pattern.extractValue(match, jobDescription)
          : pattern.label + ' required';

        const { status, userValue } = checkUserStatus(pattern.type, userProfile, jdLower);

        // Only add if not met
        if (status !== 'met') {
          gaps.push({
            type: pattern.type,
            label: pattern.label,
            jdRequirement,
            userStatus: status,
            userValue,
          });
        }

        break; // Only add once per requirement type
      }
    }
  }

  return gaps;
}

/**
 * Check if user meets the requirement
 */
function checkUserStatus(
  type: RequirementType,
  profile: UserRequirementProfile,
  jdLower: string
): { status: 'risk' | 'unknown' | 'met'; userValue?: string } {
  switch (type) {
    case 'citizenship':
      if (!profile.workAuthorization) {
        return { status: 'unknown', userValue: 'Not set' };
      }
      if (profile.workAuthorization === 'citizen') {
        return { status: 'met', userValue: 'US Citizen' };
      }
      return {
        status: 'risk',
        userValue:
          profile.workAuthorization === 'permanent_resident'
            ? 'Permanent Resident'
            : profile.workAuthorization === 'visa'
              ? 'Visa holder'
              : 'Other',
      };

    case 'security_clearance':
      if (!profile.securityClearance || profile.securityClearance === 'none') {
        // Check what level is required
        if (jdLower.includes('ts/sci') || jdLower.includes('ts sci')) {
          return {
            status: profile.securityClearance ? 'risk' : 'unknown',
            userValue: profile.securityClearance || 'Not set',
          };
        }
        if (jdLower.includes('top secret')) {
          return {
            status: profile.securityClearance ? 'risk' : 'unknown',
            userValue: profile.securityClearance || 'Not set',
          };
        }
        return {
          status: profile.securityClearance ? 'risk' : 'unknown',
          userValue: profile.securityClearance || 'Not set',
        };
      }
      {
        // User has clearance - check if level is sufficient
        const clearanceLevels = ['none', 'public_trust', 'secret', 'top_secret', 'ts_sci'];
        const userLevel = clearanceLevels.indexOf(profile.securityClearance);

        let requiredLevel = 1; // Default to public trust
        if (jdLower.includes('ts/sci') || jdLower.includes('ts sci')) requiredLevel = 4;
        else if (jdLower.includes('top secret')) requiredLevel = 3;
        else if (jdLower.includes('secret')) requiredLevel = 2;

        if (userLevel >= requiredLevel) {
          return { status: 'met', userValue: profile.securityClearance };
        }
        return { status: 'risk', userValue: profile.securityClearance };
      }

    case 'background_check':
      if (profile.canPassBackgroundCheck === undefined) {
        return { status: 'unknown', userValue: 'Not confirmed' };
      }
      return profile.canPassBackgroundCheck
        ? { status: 'met', userValue: 'Can pass' }
        : { status: 'risk', userValue: 'May not pass' };

    case 'sponsorship':
      // JD says no sponsorship
      if (profile.requiresSponsorship === undefined) {
        return { status: 'unknown', userValue: 'Not set' };
      }
      if (profile.requiresSponsorship) {
        return { status: 'risk', userValue: 'Needs sponsorship' };
      }
      return { status: 'met', userValue: 'No sponsorship needed' };

    case 'language': {
      if (!profile.languages || profile.languages.length === 0) {
        return { status: 'unknown', userValue: 'Not set' };
      }
      // Extract required language from JD
      const languages = [
        'spanish',
        'mandarin',
        'chinese',
        'french',
        'german',
        'japanese',
        'korean',
        'portuguese',
        'arabic',
        'hindi',
        'russian',
        'italian',
      ];
      for (const lang of languages) {
        if (jdLower.includes(lang)) {
          const hasLang = profile.languages.some((l) => l.toLowerCase().includes(lang));
          if (hasLang) {
            return { status: 'met', userValue: profile.languages.join(', ') };
          }
          return { status: 'risk', userValue: profile.languages.join(', ') || 'English only' };
        }
      }
      return { status: 'unknown' };
    }

    case 'location':
      if (profile.remotePreference === 'remote') {
        return { status: 'risk', userValue: 'Prefers remote' };
      }
      if (
        profile.remotePreference === 'flexible' ||
        profile.remotePreference === 'hybrid' ||
        profile.remotePreference === 'onsite'
      ) {
        return { status: 'met', userValue: profile.remotePreference };
      }
      return { status: 'unknown', userValue: 'Not set' };

    case 'relocation':
      if (profile.willingToRelocate === undefined) {
        return { status: 'unknown', userValue: 'Not set' };
      }
      return profile.willingToRelocate
        ? { status: 'met', userValue: 'Willing to relocate' }
        : { status: 'risk', userValue: 'Not willing to relocate' };

    case 'drug_test':
      if (profile.canPassDrugTest === undefined) {
        return { status: 'unknown', userValue: 'Not confirmed' };
      }
      return profile.canPassDrugTest
        ? { status: 'met', userValue: 'Can pass' }
        : { status: 'risk', userValue: 'May not pass' };

    default:
      return { status: 'unknown' };
  }
}

/**
 * Format gap for display
 */
export function formatGap(gap: RequirementGap): string {
  const icon = gap.userStatus === 'risk' ? '🚨' : '⚠️';
  const statusText = gap.userValue ? ` - ${gap.userValue}` : '';
  return `${icon} ${gap.jdRequirement}${statusText}`;
}

// ── Sponsorship Status Detection ────────────────────────────────────────

const SPONSORSHIP_AVAILABLE_PATTERNS: RegExp[] = [
  /(?:we\s+)?(?:do\s+)?(?:offer|provide|support)\s+(?:visa\s+)?sponsorship/i,
  /visa\s+sponsorship\s+(?:is\s+)?(?:available|provided|offered)/i,
  /will\s+sponsor\s+(?:h[-\s]?1b|visa|work\s+authorization)/i,
  /open\s+to\s+sponsoring/i,
  /sponsorship\s+(?:is\s+)?available/i,
  /h[-\s]?1b\s+(?:sponsorship\s+)?(?:available|provided|offered)/i,
];

/**
 * Parse a job description and determine sponsorship status.
 * Checks positive patterns first ("we sponsor"), then negative ("no sponsorship").
 * Returns 'unknown' if neither matches.
 */
export function parseSponsorshipStatus(jobDescription: string): SponsorshipStatus {
  // Check positive (sponsorship available) first
  for (const pattern of SPONSORSHIP_AVAILABLE_PATTERNS) {
    if (pattern.test(jobDescription)) return 'available';
  }

  // Check negative (no sponsorship) — use existing patterns
  const sponsorshipEntry = REQUIREMENT_PATTERNS.find((p) => p.type === 'sponsorship');
  if (sponsorshipEntry) {
    for (const pattern of sponsorshipEntry.patterns) {
      if (pattern.test(jobDescription)) return 'not_available';
    }
  }

  return 'unknown';
}
