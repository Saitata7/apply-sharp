export function setupContextMenus(): void {
  // Remove existing menus first
  chrome.contextMenus.removeAll();

  // Create context menu items
  chrome.contextMenus.create({
    id: 'applysharp-save',
    title: 'Save Job with ApplySharp',
    contexts: ['page'],
    documentUrlPatterns: [
      '*://www.linkedin.com/jobs/*',
      '*://www.indeed.com/*',
      '*://boards.greenhouse.io/*',
      '*://*.greenhouse.io/*',
      '*://jobs.lever.co/*',
      '*://*.lever.co/*',
      '*://*.myworkdayjobs.com/*',
      '*://www.dice.com/*',
      '*://www.monster.com/*',
      '*://www.glassdoor.com/*',
      '*://www.ziprecruiter.com/*',
      '*://wellfound.com/*',
      '*://*.ashbyhq.com/*',
      '*://*.smartrecruiters.com/*',
      '*://*.icims.com/*',
      '*://*.taleo.net/*',
      '*://*.bamboohr.com/*',
      '*://*.applytojob.com/*',
      '*://*.jobvite.com/*',
      '*://*.breezy.hr/*',
      '*://*.rippling.com/*',
      '*://*.recruitee.com/*',
      '*://*.workable.com/*',
    ],
  });

  chrome.contextMenus.create({
    id: 'applysharp-analyze',
    title: 'Analyze Job Fit',
    contexts: ['page'],
    documentUrlPatterns: [
      '*://www.linkedin.com/jobs/*',
      '*://www.indeed.com/*',
      '*://boards.greenhouse.io/*',
      '*://*.greenhouse.io/*',
      '*://jobs.lever.co/*',
      '*://*.lever.co/*',
      '*://*.myworkdayjobs.com/*',
      '*://www.dice.com/*',
      '*://www.monster.com/*',
      '*://www.glassdoor.com/*',
      '*://www.ziprecruiter.com/*',
      '*://wellfound.com/*',
      '*://*.ashbyhq.com/*',
      '*://*.smartrecruiters.com/*',
      '*://*.icims.com/*',
      '*://*.taleo.net/*',
      '*://*.bamboohr.com/*',
      '*://*.applytojob.com/*',
      '*://*.jobvite.com/*',
      '*://*.breezy.hr/*',
      '*://*.rippling.com/*',
      '*://*.recruitee.com/*',
      '*://*.workable.com/*',
    ],
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    const handleError = (action: string) => (error: Error) => {
      console.warn(
        `[ApplySharp] Context menu ${action} failed:`,
        error?.message || 'Content script not available'
      );
    };

    switch (info.menuItemId) {
      case 'applysharp-save':
        chrome.tabs.sendMessage(tab.id, { type: 'SAVE_CURRENT_JOB' }).catch(handleError('save'));
        break;
      case 'applysharp-analyze':
        chrome.tabs
          .sendMessage(tab.id, { type: 'ANALYZE_CURRENT_JOB' })
          .catch(handleError('analyze'));
        break;
    }
  });
}
