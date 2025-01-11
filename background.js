let settings = {
    darkMode: false,
    autoGroup: true,
    syncEnabled: true
  };
   function getDomainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
   async function groupTabsByDomain(tabs) {
    const groups = {};
    tabs.forEach(tab => {
      const domain = getDomainFromUrl(tab.url);
      if (!domain) return;
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(tab);
    });
    return groups;
  }
   chrome.runtime.onInstalled.addListener(async () => {
    await chrome.storage.local.set({ settings });
  });
   chrome.tabs.onCreated.addListener(async (tab) => {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings?.autoGroup) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const groups = await groupTabsByDomain(tabs);
     
      Object.entries(groups).forEach(async ([domain, domainTabs]) => {
        if (domainTabs.length > 1) {
          const groupId = await chrome.tabs.group({ tabIds: domainTabs.map(t => t.id) });
          await chrome.tabGroups.update(groupId, { title: domain });
        }
      });
    }
  });
   chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SETTINGS') {
      chrome.storage.local.get('settings', (result) => {
        sendResponse(result.settings);
      });
      return true;
    }
  });
  chrome.windows.onCreated.addListener(async (window) => {
    // Notify the popup about the new window
    chrome.runtime.sendMessage({
      type: 'WINDOW_CREATED',
      windowId: window.id
    });
  });
  chrome.windows.onRemoved.addListener((windowId) => {
    chrome.runtime.sendMessage({
      type: 'WINDOW_REMOVED',
      windowId
    });
  });
   // Handle tab movements between windows
  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    chrome.runtime.sendMessage({
      type: 'TAB_MOVED_WINDOW',
      tabId,
      windowId: attachInfo.newWindowId
    });
  });
 