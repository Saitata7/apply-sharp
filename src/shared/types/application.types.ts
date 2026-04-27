export type ApplicationStatus =
  | 'saved'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'ghosted'
  // 'expired' is deprecated. Migration v2 transitions any existing 'expired'
  // applications to 'ghosted'. The literal stays here so old saved values
  // typecheck during the migration window. Remove after migration is verified
  // in production.
  | 'expired';

export type ApplicationSource =
  | 'linkedin'
  | 'indeed'
  | 'company_site'
  | 'referral'
  | 'wellfound'
  | 'workatastartup'
  | 'himalayas'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'ashby'
  | 'smartrecruiters'
  | 'workable'
  | 'other';

export interface JDSnapshot {
  title: string;
  company: string;
  jdText: string;
  url: string;
  capturedAt: Date;
}

export interface SalaryInfo {
  min?: number;
  max?: number;
  currency?: string;
  source?: 'jd' | 'glassdoor' | 'user' | 'inferred';
}

export interface LocationInfo {
  city?: string;
  country?: string;
  remote: 'onsite' | 'hybrid' | 'remote';
}

export interface Contact {
  name: string;
  role?: string;
  linkedin?: string;
  email?: string;
  relationship?: string;
}

export interface FollowUp {
  id: string;
  dueDate: Date;
  done: boolean;
  note?: string;
  alarmId: string;
}

export interface AutoDetectedSignal {
  tier: 1 | 2 | 3;
  signal: string;
  detectedAt: Date;
}

export interface Application {
  id: string;
  jobId: string;
  profileId: string;

  status: ApplicationStatus;
  statusHistory: StatusChange[];

  coverLetter?: GeneratedContent;
  tailoredResume?: GeneratedContent;
  customAnswers?: CustomAnswer[];

  autofillUsed: boolean;
  autofillFields?: AutofilledField[];

  appliedAt?: Date;
  submittedVia: 'manual' | 'autofill' | 'quick_apply';

  outcome?: ApplicationOutcome;
  userNotes?: string;

  // Workstream 4 extensions
  /** Immutable snapshot of the JD at apply-time. JDs get edited or deleted on
   *  the company site over time; this lets the tracker still show what the
   *  candidate actually applied to. */
  jdSnapshot?: JDSnapshot;
  /** Which tailored resume version was used. Powers the killer differentiator
   *  analytics chart "response rate by resume version". */
  resumeVersionId?: string;
  salary?: SalaryInfo;
  location?: LocationInfo;
  contacts?: Contact[];
  followUps?: FollowUp[];
  source?: ApplicationSource;
  archived?: boolean;
  /** When auto-detected (not user-saved): which tier fired and what signal. */
  autoDetected?: AutoDetectedSignal;

  createdAt: Date;
  updatedAt: Date;
}

export interface StatusChange {
  from: ApplicationStatus;
  to: ApplicationStatus;
  changedAt: Date;
  note?: string;
}

export interface GeneratedContent {
  content: string;
  generatedAt: Date;
  aiProvider: string;
  model: string;
  promptVersion: string;
  wasEdited: boolean;
  editedContent?: string;
}

export interface CustomAnswer {
  question: string;
  answer: string;
  wasEdited: boolean;
}

export interface AutofilledField {
  fieldName: string;
  fieldSelector: string;
  value: string;
  wasApproved: boolean;
  wasEdited: boolean;
}

export interface ApplicationOutcome {
  result: 'success' | 'rejection' | 'no_response';
  responseTime?: number;
  interviewStages?: number;
  feedbackReceived?: string;
  recordedAt: Date;
}
