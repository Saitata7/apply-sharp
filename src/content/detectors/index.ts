import type { JobPlatform, ExtractedJob } from '@shared/types/job.types';
import { LinkedInDetector } from './linkedin';
import { IndeedDetector } from './indeed';
import { GreenhouseDetector } from './greenhouse';
import { LeverDetector } from './lever';
import { DiceDetector } from './dice';
import { WorkdayDetector } from './workday';
import { GenericDetector } from './generic';

export interface JobDetector {
  platform: JobPlatform;
  getMainSelector(): string;
  isJobPage(): boolean;
  getJobId(): string | null;
  extract(): Promise<ExtractedJob>;
}

export function createDetector(platform: JobPlatform): JobDetector | null {
  switch (platform) {
    case 'linkedin':
      return new LinkedInDetector();
    case 'indeed':
      return new IndeedDetector();
    case 'greenhouse':
      return new GreenhouseDetector();
    case 'lever':
      return new LeverDetector();
    case 'dice':
      return new DiceDetector();
    case 'monster':
      // Monster uses similar structure to generic
      return new GenericDetector();
    case 'workday':
      return new WorkdayDetector();
    case 'generic':
      return new GenericDetector();
    default:
      return null;
  }
}
