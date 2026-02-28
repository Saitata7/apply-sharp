import type { JobPlatform } from '@shared/types/job.types';

export interface PlatformConfig {
  name: string;
  platform: JobPlatform;
  urlPatterns: RegExp[];
  icon: string;
}

export const PLATFORMS: PlatformConfig[] = [
  // Major Job Boards
  {
    name: 'LinkedIn',
    platform: 'linkedin',
    urlPatterns: [
      /linkedin\.com\/jobs\/view\/\d+/,
      /linkedin\.com\/jobs\/collections\/.*currentJobId=\d+/,
      /linkedin\.com\/jobs\/search\/.*currentJobId=\d+/,
      /linkedin\.com\/jobs\/search\//,
      /linkedin\.com\/jobs\?.*currentJobId=\d+/,
    ],
    icon: 'linkedin',
  },
  {
    name: 'Indeed',
    platform: 'indeed',
    urlPatterns: [/indeed\.com\/viewjob/, /indeed\.com\/rc\/clk/, /indeed\.com\/jobs\?.*vjk=/],
    icon: 'indeed',
  },
  {
    name: 'Dice',
    platform: 'dice',
    urlPatterns: [/dice\.com\/job-detail\//, /dice\.com\/jobs\//],
    icon: 'dice',
  },
  {
    name: 'Monster',
    platform: 'monster',
    urlPatterns: [/monster\.com\/job-openings\//, /monster\.com\/jobs\//],
    icon: 'monster',
  },
  {
    name: 'ZipRecruiter',
    platform: 'generic',
    urlPatterns: [/ziprecruiter\.com\/jobs\//, /ziprecruiter\.com\/c\/.*\/job\//],
    icon: 'ziprecruiter',
  },
  {
    name: 'Glassdoor',
    platform: 'generic',
    urlPatterns: [/glassdoor\.com\/job-listing\//, /glassdoor\.com\/Job\//],
    icon: 'glassdoor',
  },
  {
    name: 'Wellfound',
    platform: 'generic',
    urlPatterns: [
      /wellfound\.com\/jobs/,
      /angel\.co\/jobs/,
      /wellfound\.com\/company\/[\w-]+\/jobs/,
    ],
    icon: 'wellfound',
  },

  // ATS Platforms
  {
    name: 'Greenhouse',
    platform: 'greenhouse',
    urlPatterns: [
      /boards\.greenhouse\.io\/[\w-]+\/jobs\/\d+/,
      /[\w-]+\.greenhouse\.io\/[\w-]+\/jobs\/\d+/,
      /greenhouse\.io\/.*\/jobs\//,
    ],
    icon: 'greenhouse',
  },
  {
    name: 'Lever',
    platform: 'lever',
    urlPatterns: [/jobs\.lever\.co\/[\w-]+\/[\w-]+/, /[\w-]+\.lever\.co\/[\w-]+/],
    icon: 'lever',
  },
  {
    name: 'Workday',
    platform: 'workday',
    urlPatterns: [
      /\.myworkdayjobs\.com\/.*\/job\//,
      /\.wd\d+\.myworkdayjobs\.com\//,
      /workday\.com\/.*\/job\//,
    ],
    icon: 'workday',
  },
  {
    name: 'Ashby',
    platform: 'generic',
    urlPatterns: [/jobs\.ashbyhq\.com\/[\w-]+\/[\w-]+/, /[\w-]+\.ashbyhq\.com\/[\w-]+/],
    icon: 'ashby',
  },
  {
    name: 'SmartRecruiters',
    platform: 'generic',
    urlPatterns: [/jobs\.smartrecruiters\.com\/[\w-]+\/[\w-]+/, /careers\.smartrecruiters\.com\//],
    icon: 'smartrecruiters',
  },
  {
    name: 'iCIMS',
    platform: 'generic',
    urlPatterns: [/\.icims\.com\/jobs\//, /careers-[\w-]+\.icims\.com\//],
    icon: 'icims',
  },
  {
    name: 'Taleo',
    platform: 'generic',
    urlPatterns: [/\.taleo\.net\/careersection\//, /taleo\.net\/.*\/jobdetail/],
    icon: 'taleo',
  },
  {
    name: 'BambooHR',
    platform: 'generic',
    urlPatterns: [
      /[\w-]+\.bamboohr\.com\/careers\/\d+/,
      /[\w-]+\.bamboohr\.com\/careers\//,
      /[\w-]+\.bamboohr\.com\/jobs\/\d+/,
      /[\w-]+\.bamboohr\.com\/jobs\//,
    ],
    icon: 'bamboohr',
  },
  {
    name: 'JazzHR',
    platform: 'generic',
    urlPatterns: [/[\w-]+\.applytojob\.com\/apply\//, /app\.jazz\.co\/apply\//],
    icon: 'jazzhr',
  },
  {
    name: 'Jobvite',
    platform: 'generic',
    urlPatterns: [/jobs\.jobvite\.com\/[\w-]+\/job\//, /[\w-]+\.jobvite\.com\/[\w-]+\/job\//],
    icon: 'jobvite',
  },
  {
    name: 'Breezy',
    platform: 'generic',
    urlPatterns: [/[\w-]+\.breezy\.hr\/p\//],
    icon: 'breezy',
  },
  {
    name: 'Rippling',
    platform: 'generic',
    urlPatterns: [/[\w-]+\.rippling\.com\/careers\//, /ats\.rippling\.com\/[\w-]+\/jobs\//],
    icon: 'rippling',
  },
  {
    name: 'Recruitee',
    platform: 'generic',
    urlPatterns: [/[\w-]+\.recruitee\.com\/o\//],
    icon: 'recruitee',
  },
  {
    name: 'Workable',
    platform: 'generic',
    urlPatterns: [/apply\.workable\.com\/[\w-]+\/j\//, /[\w-]+\.workable\.com\/j\//],
    icon: 'workable',
  },
  {
    name: 'TCS iBegin',
    platform: 'generic',
    urlPatterns: [/ibegin\.tcsapps\.com\/candidate\/jobs\//, /tcsapps\.com\/.*\/jobs\//],
    icon: 'tcs',
  },
  {
    name: 'Oracle HCM',
    platform: 'generic',
    urlPatterns: [/\.oraclecloud\.com\/hcmUI\/.*Requisition/, /\.oraclecloud\.com\/.*\/job\//],
    icon: 'oracle',
  },
  {
    name: 'SuccessFactors',
    platform: 'generic',
    urlPatterns: [/\.successfactors\.com\/career/, /jobs\.sap\.com\//],
    icon: 'sap',
  },
];

/**
 * URL patterns that indicate a job page (for generic detection)
 */
export const JOB_URL_PATTERNS = [
  /\/jobs?\//i,
  /\/careers?\//i,
  /\/positions?\//i,
  /\/openings?\//i,
  /\/vacanc(?:y|ies)\//i,
  /\/opportunity/i,
  /\/job-/i,
  /\/career-/i,
  /\/apply\//i,
  /\/job_/i,
  /jobid=/i,
  /job_id=/i,
  /positionid=/i,
];

/**
 * Detect known platform from URL
 */
export function detectPlatform(url: string): PlatformConfig | null {
  for (const config of PLATFORMS) {
    if (config.urlPatterns.some((pattern) => pattern.test(url))) {
      return config;
    }
  }
  return null;
}

/**
 * Check if URL looks like a job page (generic detection)
 */
export function looksLikeJobUrl(url: string): boolean {
  return JOB_URL_PATTERNS.some((pattern) => pattern.test(url));
}
