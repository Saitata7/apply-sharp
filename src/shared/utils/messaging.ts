// Message types for communication between extension components

export type MessageType =
  | 'JOB_DETECTED'
  | 'SAVE_JOB'
  | 'GET_JOB'
  | 'GET_PROFILES'
  | 'GET_CURRENT_PROFILE'
  | 'GET_ACTIVE_PROFILE'
  | 'SET_CURRENT_PROFILE'
  | 'CREATE_PROFILE'
  | 'UPDATE_PROFILE'
  | 'DELETE_PROFILE'
  | 'SCORE_JOB'
  | 'GENERATE_COVER_LETTER'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'OPEN_OPTIONS'
  | 'GET_RECENT_JOBS'
  | 'ANALYZE_JOB'
  | 'START_AUTOFILL'
  | 'PREVIEW_AUTOFILL'
  | 'OPTIMIZE_RESUME'
  | 'TOGGLE_SIDEBAR'
  | 'UPDATE_PROFILE'
  | 'SAVE_CURRENT_JOB'
  | 'DETECT_FORM'
  | 'CLOSE_PREVIEW'
  // Master Profile messages
  | 'ANALYZE_RESUME'
  | 'GET_MASTER_PROFILES'
  | 'GET_ACTIVE_MASTER_PROFILE'
  | 'SET_ACTIVE_MASTER_PROFILE'
  | 'DELETE_MASTER_PROFILE'
  | 'UPDATE_MASTER_PROFILE'
  | 'PROCESS_PROFILE_UPDATE'
  | 'APPLY_PROFILE_UPDATE'
  | 'GENERATE_ROLE_PROFILE'
  | 'DELETE_ROLE_PROFILE'
  | 'SET_ACTIVE_ROLE_PROFILE'
  | 'ANALYZE_JD_FOR_RESUME'
  | 'OPTIMIZE_RESUME_FOR_JD'
  | 'UPDATE_ANSWER_BANK'
  // Answer Bank messages
  | 'SAVE_ANSWER'
  | 'GET_ANSWER_SUGGESTION'
  | 'GENERATE_AI_ANSWER'
  // Application management messages
  | 'GET_APPLICATIONS'
  | 'GET_APPLICATION'
  | 'GET_APPLICATIONS_WITH_JOBS'
  | 'CREATE_APPLICATION'
  | 'UPDATE_APPLICATION_STATUS'
  | 'UPDATE_APPLICATION'
  | 'DELETE_APPLICATION'
  | 'BULK_ARCHIVE_APPLICATIONS'
  | 'GET_APPLICATION_COUNTS'
  // Resume version messages
  | 'SAVE_RESUME_VERSION'
  | 'GET_RESUME_VERSIONS'
  | 'GET_RESUME_VERSION'
  | 'DELETE_RESUME_VERSION'
  // Learning & Self-Improvement messages
  | 'TRACK_APPLICATION'
  | 'RECORD_OUTCOME'
  | 'GET_LEARNING_INSIGHTS'
  | 'GET_APPLICATION_STATS'
  | 'GET_IMPROVEMENTS'
  | 'GET_KEYWORD_RECOMMENDATIONS'
  | 'RUN_LEARNING_ANALYSIS'
  // ATS Score page
  | 'SCORE_RESUME_ATS'
  | 'SCORE_RESUME_FILE_ATS'
  // Interview Prep
  | 'GENERATE_INTERVIEW_PREP';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function sendMessage<T, R>(message: Message<T>): Promise<MessageResponse<R>> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response as MessageResponse<R>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendTabMessage<T, R>(
  tabId: number,
  message: Message<T>
): Promise<MessageResponse<R>> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as MessageResponse<R>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
