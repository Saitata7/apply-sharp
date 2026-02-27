export interface ResumeVersion {
  id: string;
  profileId: string;
  roleProfileId?: string;
  jobId?: string;
  format: 'pdf' | 'docx' | 'txt' | 'json';
  name: string;
  contentSnapshot: string;
  atsScore?: number;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
}
