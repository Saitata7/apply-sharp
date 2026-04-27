/**
 * JD Analyzer — Local keyword-based job description analysis (fallback)
 *
 * Extracted from ResumeGenerator.tsx. Pure function that extracts keywords
 * from a job description using regex patterns and matches them against
 * a user's profile skills.
 *
 * Uses the shared keyword patterns from src/core/ats/keyword-patterns.ts
 * with additional patterns for more comprehensive coverage.
 */

import type { MasterProfile, GeneratedProfile } from '@shared/types/master-profile.types';

export interface KeywordWithFrequency {
  keyword: string;
  count: number;
  profileCount?: number;
}

export interface JDAnalysis {
  matchedRole: GeneratedProfile | null;
  matchScore: number;
  matchedKeywords: KeywordWithFrequency[];
  missingKeywords: KeywordWithFrequency[];
  suggestions: string[];
  jdAnalysis?: {
    businessContext?: {
      coreProblem?: string;
      successIn6Months?: string;
      riskOfBadHire?: string;
      urgencyLevel?: string;
    };
    mustHaves?: Array<{ skill: string; context: string; yearsRequired?: number }>;
    niceToHaves?: Array<{ skill: string; context: string }>;
    hiddenRequirements?: string[];
    senioritySignals?: {
      level?: string;
      indicators?: string[];
      teamContext?: string;
    };
    cultureSignals?: {
      companyStage?: string;
      workStyle?: string;
      values?: string[];
    };
    redFlags?: string[];
  };
  gapAnalysis?: {
    critical: string[];
    addressable: string[];
    minor: string[];
  };
  scoreBreakdown?: {
    skills: number;
    experience: number;
    seniority: number;
    culture: number;
  };
}

// Programming Languages
const languagePatterns = [
  /\bjava\b/gi,
  /\bjavascript\b/gi,
  /\btypescript\b/gi,
  /\bpython\b/gi,
  /\bc#\b/gi,
  /\bc\+\+/gi,
  /\bgolang\b/gi,
  /\bgo\b(?!\s+to)/gi,
  /\brust\b/gi,
  /\bscala\b/gi,
  /\bruby\b/gi,
  /\bphp\b/gi,
  /\bswift\b/gi,
  /\bkotlin\b/gi,
  /\br\b(?=\s+(programming|language|studio))/gi,
  /\bperl\b/gi,
  /\bhtml\b/gi,
  /\bcss\b/gi,
  /\bsass\b/gi,
  /\bless\b/gi,
  /\bshell\b/gi,
  /\bbash\b/gi,
  /\bsql\b/gi,
  /\bplsql\b/gi,
  /\bt-sql\b/gi,
];

// Frameworks & Libraries
const frameworkPatterns = [
  /\breact\b/gi,
  /\bangular\b/gi,
  /\bvue\.?js?\b/gi,
  /\bsvelte\b/gi,
  /\bnode\.?js?\b/gi,
  /\bexpress\.?js?\b/gi,
  /\bnext\.?js?\b/gi,
  /\bspring\b/gi,
  /\bspring\s*boot\b/gi,
  /\b\.net\b/gi,
  /\basp\.net\b/gi,
  /\bdjango\b/gi,
  /\bflask\b/gi,
  /\bfastapi\b/gi,
  /\brails\b/gi,
  /\blaravel\b/gi,
  /\bjquery\b/gi,
  /\bbootstrap\b/gi,
  /\btailwind\b/gi,
  /\bredux\b/gi,
  /\bmobx\b/gi,
  /\bgraphql\b/gi,
  /\brest\s*api\b/gi,
  /\bweb\s*api\b/gi,
  /\bapi\s*development\b/gi,
  /\bapi\b/gi,
];

// Databases
const dbPatterns = [
  /\bmongodb\b/gi,
  /\bpostgresql\b/gi,
  /\bpostgres\b/gi,
  /\bmysql\b/gi,
  /\boracle\b/gi,
  /\bsql\s*server\b/gi,
  /\bredis\b/gi,
  /\bcassandra\b/gi,
  /\bdynamodb\b/gi,
  /\bfirebase\b/gi,
  /\belasticsearch\b/gi,
  /\bnosql\b/gi,
  /\bsqlite\b/gi,
  /\bmariadb\b/gi,
  /\bcouchdb\b/gi,
  /\bneo4j\b/gi,
];

// Cloud & DevOps
const cloudPatterns = [
  /\baws\b/gi,
  /\bazure\b/gi,
  /\bgcp\b/gi,
  /\bgoogle\s*cloud\b/gi,
  /\bdocker\b/gi,
  /\bkubernetes\b/gi,
  /\bk8s\b/gi,
  /\bterraform\b/gi,
  /\bansible\b/gi,
  /\bjenkins\b/gi,
  /\bgithub\s*actions\b/gi,
  /\bgitlab\s*ci\b/gi,
  /\bci\/cd\b/gi,
  /\bdevops\b/gi,
  /\bcloud\b/gi,
  /\bmicroservices\b/gi,
  /\bserverless\b/gi,
  /\blambda\b/gi,
  /\bec2\b/gi,
  /\bs3\b/gi,
  /\blinux\b/gi,
  /\bunix\b/gi,
  /\bgit\b/gi,
  /\bversion\s*control\b/gi,
];

// AI/ML Keywords
const aiPatterns = [
  /\bgen\s*ai\b/gi,
  /\bgenerative\s*ai\b/gi,
  /\bmachine\s*learning\b/gi,
  /\bml\b/gi,
  /\bdeep\s*learning\b/gi,
  /\bai\b/gi,
  /\bartificial\s*intelligence\b/gi,
  /\bllm\b/gi,
  /\blarge\s*language\s*model/gi,
  /\bnlp\b/gi,
  /\bnatural\s*language/gi,
  /\btensorflow\b/gi,
  /\bpytorch\b/gi,
  /\bkeras\b/gi,
  /\bscikit/gi,
  /\bopenai\b/gi,
  /\bchatgpt\b/gi,
  /\bgpt\b/gi,
  /\bclaude\b/gi,
  /\bcomputer\s*vision\b/gi,
  /\bneural\s*network/gi,
  /\bdata\s*science\b/gi,
];

// Soft Skills & Methodologies
const softSkillPatterns = [
  /\bproblem[\s-]*solving\b/gi,
  /\bcommunication\s*skills?\b/gi,
  /\bcollaborat(ion|ive)\b/gi,
  /\bteamwork\b/gi,
  /\bteam\s*player\b/gi,
  /\bleadership\b/gi,
  /\banalytical\b/gi,
  /\bcritical\s*thinking\b/gi,
  /\btime\s*management\b/gi,
  /\battention\s*to\s*detail\b/gi,
  /\bagile\b/gi,
  /\bscrum\b/gi,
  /\bkanban\b/gi,
  /\bwaterfall\b/gi,
  /\bsoftware\s*engineering\b/gi,
  /\bsoftware\s*development\b/gi,
  /\bsdlc\b/gi,
  /\btdd\b/gi,
  /\btest[\s-]*driven\b/gi,
  /\bunit\s*test/gi,
  /\bintegration\s*test/gi,
  /\bcode\s*review\b/gi,
  /\bpair\s*programming\b/gi,
  /\bdeductive\s*reasoning\b/gi,
];

// Other Tech Terms
const otherPatterns = [
  /\bfrontend\b/gi,
  /\bfront[\s-]*end\b/gi,
  /\bbackend\b/gi,
  /\bback[\s-]*end\b/gi,
  /\bfull[\s-]*stack\b/gi,
  /\bmobile\b/gi,
  /\bios\b/gi,
  /\bandroid\b/gi,
  /\bresponsive\b/gi,
  /\bux\b/gi,
  /\bui\b/gi,
  /\buser\s*experience\b/gi,
  /\bsecurity\b/gi,
  /\bcybersecurity\b/gi,
  /\boauth\b/gi,
  /\bjwt\b/gi,
  /\bauthentication\b/gi,
  /\bauthorization\b/gi,
  /\bencryption\b/gi,
  /\bscripting\b/gi,
  /\bautomation\b/gi,
  /\bweb[\s-]*based\b/gi,
  /\bobject[\s-]*oriented\b/gi,
  /\boop\b/gi,
  /\bfunctional\s*programming\b/gi,
  /\bdesign\s*patterns\b/gi,
  /\bsolid\b/gi,
  /\bmvc\b/gi,
  /\bmvvm\b/gi,
  /\brestful\b/gi,
  /\bsoap\b/gi,
  /\bjson\b/gi,
  /\bxml\b/gi,
  /\byaml\b/gi,
  /\bwebsocket/gi,
  /\rabbitmq\b/gi,
  /\bkafka\b/gi,
  /\bmessage\s*queue/gi,
];

const ALL_PATTERNS = [
  ...languagePatterns,
  ...frameworkPatterns,
  ...dbPatterns,
  ...cloudPatterns,
  ...aiPatterns,
  ...softSkillPatterns,
  ...otherPatterns,
];

/**
 * Calculate profile keyword counts from profile data.
 * Returns a map of lowercase keyword to occurrence count.
 */
export function calculateProfileCounts(
  profile: MasterProfile,
  generatedProfiles: GeneratedProfile[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  // Helper to count keyword in text
  const countInText = (text: string, keyword: string): number => {
    if (!text || !keyword || keyword.length < 2) return 0;
    const textLower = text.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = textLower.indexOf(keywordLower, pos)) !== -1) {
      count++;
      pos += keywordLower.length;
    }
    return count;
  };

  // Collect all text for searching
  const allText: string[] = [];

  // Count from experience
  if (profile.experience && Array.isArray(profile.experience)) {
    profile.experience.forEach((exp) => {
      // Count from technologiesUsed
      if (exp.technologiesUsed && Array.isArray(exp.technologiesUsed)) {
        exp.technologiesUsed.forEach((tech) => {
          const skillName = typeof tech === 'string' ? tech : tech?.skill || '';
          if (skillName) {
            const normalized = skillName.toLowerCase().trim();
            counts[normalized] = (counts[normalized] || 0) + 1;
          }
        });
      }

      // Collect achievement text and keywords
      if (exp.achievements && Array.isArray(exp.achievements)) {
        exp.achievements.forEach((achievement) => {
          const statement = typeof achievement === 'string' ? achievement : achievement?.statement;
          if (statement) allText.push(statement);
          const keywords = typeof achievement === 'string' ? [] : achievement?.keywords || [];
          if (Array.isArray(keywords)) {
            keywords.forEach((kw) => {
              if (kw) {
                const normalized = kw.toLowerCase().trim();
                counts[normalized] = (counts[normalized] || 0) + 1;
              }
            });
          }
        });
      }

      // Collect other text
      if (exp.responsibilities && Array.isArray(exp.responsibilities)) {
        exp.responsibilities.forEach((r) => {
          if (r) allText.push(r);
        });
      }
      if (exp.description) allText.push(exp.description);
      if (exp.title) allText.push(exp.title);
    });
  }

  // Count from ALL skill categories
  const skillCategories = [
    profile.skills?.technical,
    profile.skills?.frameworks,
    profile.skills?.tools,
    profile.skills?.programmingLanguages,
  ];

  skillCategories.forEach((category) => {
    if (category && Array.isArray(category)) {
      category.forEach((skill) => {
        if (skill?.name) {
          const normalized = skill.name.toLowerCase().trim();
          const evidenceCount = skill.evidenceFrom?.length || 1;
          counts[normalized] = (counts[normalized] || 0) + evidenceCount;
        }
      });
    }
  });

  // Count from role profiles
  generatedProfiles.forEach((role) => {
    if (role.atsKeywords && Array.isArray(role.atsKeywords)) {
      role.atsKeywords.forEach((kw) => {
        if (kw) {
          const normalized = kw.toLowerCase().trim();
          counts[normalized] = (counts[normalized] || 0) + 1;
        }
      });
    }
    if (role.highlightedSkills && Array.isArray(role.highlightedSkills)) {
      role.highlightedSkills.forEach((skill) => {
        if (skill) {
          const normalized = skill.toLowerCase().trim();
          counts[normalized] = (counts[normalized] || 0) + 1;
        }
      });
    }
  });

  // Count mentions in text for existing skills
  const fullText = allText.join(' ');
  Object.keys(counts).forEach((skillKey) => {
    const textMentions = countInText(fullText, skillKey);
    if (textMentions > 0) {
      counts[skillKey] = counts[skillKey] + textMentions;
    }
  });

  return counts;
}

/**
 * Add profile counts to matched keywords.
 */
export function enrichWithProfileCounts(
  matchedKeywords: KeywordWithFrequency[],
  profileCounts: Record<string, number>
): KeywordWithFrequency[] {
  return matchedKeywords.map((kwObj) => {
    const jdKeyLower = kwObj.keyword.toLowerCase().trim();

    // Get direct count
    let profileCount = profileCounts[jdKeyLower] || 0;

    // Also check for related keywords
    Object.entries(profileCounts).forEach(([key, count]) => {
      if (key !== jdKeyLower) {
        if (key.includes(jdKeyLower) || jdKeyLower.includes(key)) {
          // Avoid false positives
          const isValidMatch =
            key.startsWith(jdKeyLower + ' ') ||
            key.endsWith(' ' + jdKeyLower) ||
            jdKeyLower.startsWith(key + ' ') ||
            jdKeyLower.endsWith(' ' + key) ||
            (jdKeyLower.length >= 4 && key.length >= 4);
          if (isValidMatch) {
            profileCount += count;
          }
        }
      }
    });

    return { ...kwObj, profileCount: Math.max(profileCount, 1) };
  });
}

/**
 * Local keyword-based JD analysis (fallback when AI is unavailable).
 * Returns real scores based on keyword matching between JD and profile.
 */
export function analyzeLocally(
  jd: string,
  profile: MasterProfile,
  generatedProfiles: GeneratedProfile[],
  profileCounts: Record<string, number>
): JDAnalysis {
  const jdLower = jd.toLowerCase();

  // Extract ALL keywords from JD with FREQUENCY count
  const keywordFrequency: Map<string, number> = new Map();

  ALL_PATTERNS.forEach((pattern) => {
    const matches = jdLower.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const normalized = match.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalized && normalized.length > 1) {
          keywordFrequency.set(normalized, (keywordFrequency.get(normalized) || 0) + 1);
        }
      });
    }
  });

  // Convert to array and sort by frequency
  const allJdKeywords: KeywordWithFrequency[] = Array.from(keywordFrequency.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count);

  // Collect all profile keywords for matching
  const profileKeywords: string[] = [];

  generatedProfiles.forEach((role) => {
    if (role.highlightedSkills) profileKeywords.push(...role.highlightedSkills);
    if (role.atsKeywords) profileKeywords.push(...role.atsKeywords);
  });

  if (profile.skills) {
    if (profile.skills.technical)
      profileKeywords.push(...profile.skills.technical.map((s) => s.name));
    if (profile.skills.frameworks)
      profileKeywords.push(...profile.skills.frameworks.map((s) => s.name));
    if (profile.skills.tools) profileKeywords.push(...profile.skills.tools.map((s) => s.name));
    if (profile.skills.programmingLanguages)
      profileKeywords.push(...profile.skills.programmingLanguages.map((s) => s.name));
  }

  // Add experience technologiesUsed to profileKeywords
  profile.experience?.forEach((exp) => {
    if (exp.technologiesUsed && Array.isArray(exp.technologiesUsed)) {
      exp.technologiesUsed.forEach((t) => {
        const skill = typeof t === 'string' ? t : t?.skill || '';
        if (skill) profileKeywords.push(skill);
      });
    }
  });

  const profileKeywordsLower = profileKeywords.map((k) => k.toLowerCase());

  // Separate matched vs missing keywords with profile counts
  const matchedKeywords: KeywordWithFrequency[] = [];
  const missingKeywords: KeywordWithFrequency[] = [];

  allJdKeywords.forEach((jdKwObj) => {
    const jdKeyLower = jdKwObj.keyword.toLowerCase().trim();

    // Check if profile has this keyword
    const hasKeyword = profileKeywordsLower.some(
      (pKw) => pKw === jdKeyLower || pKw.includes(jdKeyLower) || jdKeyLower.includes(pKw)
    );

    // Get profile count
    let profileCount = profileCounts[jdKeyLower] || 0;

    // Also check for related keywords
    Object.entries(profileCounts).forEach(([key, count]) => {
      if (key !== jdKeyLower) {
        if (key.includes(jdKeyLower) || jdKeyLower.includes(key)) {
          const isValidMatch =
            key.startsWith(jdKeyLower + ' ') ||
            key.endsWith(' ' + jdKeyLower) ||
            jdKeyLower.startsWith(key + ' ') ||
            jdKeyLower.endsWith(' ' + key) ||
            (jdKeyLower.length >= 4 && key.length >= 4);
          if (isValidMatch) {
            profileCount += count;
          }
        }
      }
    });

    if (hasKeyword || profileCount > 0) {
      matchedKeywords.push({ ...jdKwObj, profileCount: Math.max(profileCount, 1) });
    } else {
      missingKeywords.push(jdKwObj);
    }
  });

  const totalJdKeywords = allJdKeywords.length;
  const matchScore =
    totalJdKeywords > 0 ? Math.round((matchedKeywords.length / totalJdKeywords) * 100) : 0;

  // Find best matching role
  let bestRole: GeneratedProfile | null = null;
  let bestRoleScore = 0;

  generatedProfiles.forEach((role) => {
    const roleKeywords = [...(role.highlightedSkills || []), ...(role.atsKeywords || [])].map((k) =>
      k.toLowerCase()
    );

    const roleMatches = allJdKeywords.filter((jdKwObj) =>
      roleKeywords.some((rKw) => rKw.includes(jdKwObj.keyword) || jdKwObj.keyword.includes(rKw))
    ).length;

    if (roleMatches > bestRoleScore) {
      bestRoleScore = roleMatches;
      bestRole = role;
    }
  });

  const topMissing = missingKeywords
    .slice(0, 3)
    .map((kw) => `${kw.keyword} (${kw.count})`)
    .join(', ');

  return {
    matchedRole: bestRole,
    matchScore,
    matchedKeywords,
    missingKeywords: missingKeywords.slice(0, 15),
    suggestions: [
      `${matchedKeywords.length}/${totalJdKeywords} JD keywords in your profile`,
      missingKeywords.length > 0 ? `Top missing: ${topMissing}` : 'Great match!',
    ],
  };
}
