class TabManager {
  constructor() {
    this.initializeUI();
    this.loadSettings();
    this.attachEventListeners();
    this.draggedTab = null;
    
    // Listen for tab moved events from Chrome
    chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
      this.handleTabMove(tabId, moveInfo);
    });
  }
  renderTabs(tabs) {
    const container = document.getElementById('tabGroups');
    container.innerHTML = '';
  
    let currentGroup = null;
    let currentDomain = null;
  
    tabs.forEach((tab, index) => {
      const domain = new URL(tab.url).hostname;
  
      if (domain !== currentDomain) {
        // End the previous group if exists
        if (currentGroup) {
          container.appendChild(currentGroup);
        }
  
        // Start a new group
        currentGroup = document.createElement('div');
        currentGroup.className = 'tab-group';
        currentGroup.innerHTML = `
          <div class="tab-group-header">
            <span>${domain}</span>
            <span>1 tab</span>
          </div>
        `;
        currentDomain = domain;
      } else {
        // Update tab count for the current group
        const tabCount = currentGroup.querySelector('.tab-group-header span:last-child');
        const count = parseInt(tabCount.textContent) + 1;
        tabCount.textContent = `${count} tab${count > 1 ? 's' : ''}`;
      }
  
      const tabElement = document.createElement('div');
      tabElement.className = 'tab-item';
      tabElement.setAttribute('draggable', 'true');
      tabElement.setAttribute('data-tab-id', tab.id);
      tabElement.innerHTML = `
        <img class="tab-favicon" src="${tab.favIconUrl || 'icons/default-favicon.png'}" alt="">
        <span class="tab-title">${tab.title}</span>
        <div class="tab-actions">
          <button class="btn switch-tab">Switch</button>
          <button class="btn close-tab">Close</button>
        </div>
      `;
  
      currentGroup.appendChild(tabElement);
  
      // Append the last group
      if (index === tabs.length - 1) {
        container.appendChild(currentGroup);
      }
    });
  }
  async handleTabMove(tabId, moveInfo) {
    // Reload tabs to reflect new order
    await this.loadTabs();
  }  

     async initializeUI() {
      await this.loadTabs();
      this.updateStats();
      await this.loadSessions();
    }
     async loadSettings() {
      const { settings } = await chrome.storage.local.get('settings');
      if (settings) {
        document.body.classList.toggle('dark', settings.darkMode);
        document.getElementById('autoGroupSetting').checked = settings.autoGroup;
        document.getElementById('syncSetting').checked = settings.syncEnabled;
      }
    }
     async saveSettings(updates) {
      const { settings } = await chrome.storage.local.get('settings');
      const newSettings = { ...settings, ...updates };
      await chrome.storage.local.set({ settings: newSettings });
    }
    async loadTabs() {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      // Tabs are already sorted based on their index in Chrome
      this.renderTabs(tabs);
    }
    groupTabsByDomain(tabs) {
      const groups = {};
      tabs.forEach(tab => {
        try {
          const domain = new URL(tab.url).hostname;
          if (!groups[domain]) groups[domain] = [];
          groups[domain].push({
            ...tab,
            index: tab.index // Preserve tab index for ordering
          });
        } catch (e) {
          console.error('Invalid URL:', tab.url);
        }
      });
  
      // Sort tabs within each domain group by their Chrome index
      Object.values(groups).forEach(tabGroup => {
        tabGroup.sort((a, b) => a.index - b.index);
      });
  
      return groups;
    }
     renderTabGroups(groups) {
      const container = document.getElementById('tabGroups');
      container.innerHTML = '';
       Object.entries(groups).forEach(([domain, tabs]) => {
        const groupElement = document.createElement('div');
        groupElement.className = 'tab-group';
         groupElement.innerHTML = `
          <div class="tab-group-header">
            <span>${domain}</span>
            <span>${tabs.length} tabs</span>
          </div>
          ${tabs.map(tab => this.renderTab(tab)).join('')}
        `;
         container.appendChild(groupElement);
      });
    }
     renderTab(tab) {
      return `
        <div class="tab-item" draggable="true" data-tab-id="${tab.id}">
          <img class="tab-favicon" src="${tab.favIconUrl || 'icons/default-favicon.png'}" alt="">
          <span class="tab-title">${tab.title}</span>
          <div class="tab-actions">
            <button class="btn switch-tab">Switch</button>
            <button class="btn close-tab">Close</button>
          </div>
        </div>
      `;
    }
     async loadSessions() {
      const { sessions = [] } = await chrome.storage.local.get('sessions');
      const container = document.getElementById('sessionsList');
     
      container.innerHTML = sessions.map(session => `
        <div class="session-item" data-session-id="${session.id}">
          <div class="session-info">
            <strong>${session.name}</strong>
            <span>${new Date(session.timestamp).toLocaleString()}</span>
          </div>
          <div>Tabs: ${session.tabs.length}</div>
          <div class="session-tabs">
            ${session.tabs.slice(0, 3).map(tab => `
              <div class="session-tab">
                <img src="${tab.favicon || 'icons/default-favicon.png'}" alt="" width="16">
                ${tab.title}
              </div>
            `).join('')}
            ${session.tabs.length > 3 ? `<div>... and ${session.tabs.length - 3} more</div>` : ''}
          </div>
        </div>
      `).join('');
    }
     updateStats() {
      chrome.tabs.query({}, tabs => {
        const stats = {
          total: tabs.length,
          domains: new Set(tabs.map(tab => {
            try {
              return new URL(tab.url).hostname;
            } catch {
              return null;
            }
          }).filter(Boolean)).size
        };
         document.getElementById('stats').innerHTML = `
          <div>Total Tabs: ${stats.total}</div>
          <div>Unique Domains: ${stats.domains}</div>
        `;
      });
    }
     async handleSearch(query) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const filtered = tabs.filter(tab =>
        tab.title.toLowerCase().includes(query.toLowerCase()) ||
        tab.url.toLowerCase().includes(query.toLowerCase())
      );
      const groups = this.groupTabsByDomain(filtered);
      this.renderTabGroups(groups);
    }
    async handleDrop(e) {
      e.preventDefault();
      const targetTab = e.target.closest('.tab-item');
      if (!targetTab || !this.draggedTab) return;
  
      const sourceTabId = parseInt(this.draggedTab.dataset.tabId);
      const targetTabId = parseInt(targetTab.dataset.tabId);
  
      if (sourceTabId === targetTabId) return;
  
      try {
        // Get the current tabs to determine indices
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const targetTab = tabs.find(tab => tab.id === targetTabId);
        
        // Move the tab in Chrome
        await chrome.tabs.move(sourceTabId, { index: targetTab.index });
        
        // The onMoved event listener will trigger loadTabs() to update the UI
      } catch (error) {
        console.error('Error moving tab:', error);
      }
    }
     attachEventListeners() {
      // Theme toggle
      document.getElementById('themeToggle').addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        this.saveSettings({ darkMode: isDark });
      });
       // Search
      document.getElementById('searchInput').addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
       // Settings toggle
      document.getElementById('settingsToggle').addEventListener('click', () => {
        document.getElementById('settingsPanel').classList.toggle('hidden');
      });
       // Auto-group setting
      document.getElementById('autoGroupSetting').addEventListener('change', (e) => {
        this.saveSettings({ autoGroup: e.target.checked });
      });
       // Sync setting
      document.getElementById('syncSetting').addEventListener('change', (e) => {
        this.saveSettings({ syncEnabled: e.target.checked });
      });
       // Sessions button
      document.getElementById('sessionsButton').addEventListener('click', () => {
        chrome.tabs.create({ url: 'sessions.html' });
      });
       // Back button
      document.getElementById('backToTabs').addEventListener('click', () => {
        document.getElementById('sessionsView').classList.add('hidden');
        document.getElementById('mainView').classList.remove('hidden');
      });


       // Save workspace
      document.getElementById('saveWorkspace').addEventListener('click', () => {
        this.saveWorkspace();
      });


      
       // Tab group actions
      document.getElementById('tabGroups').addEventListener('click', (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (!tabItem) return;
         const tabId = parseInt(tabItem.dataset.tabId);
       
        if (e.target.classList.contains('switch-tab')) {
          chrome.tabs.update(tabId, { active: true });
        } else if (e.target.classList.contains('close-tab')) {
          chrome.tabs.remove(tabId);
          tabItem.remove();
          this.updateStats();
        }
      });
       // Session restore
      document.getElementById('sessionsList').addEventListener('click', async (e) => {
        const sessionItem = e.target.closest('.session-item');
        if (!sessionItem) return;
         const sessionId = sessionItem.dataset.sessionId;
        const { sessions } = await chrome.storage.local.get('sessions');
        const session = sessions.find(s => s.id === sessionId);
         if (session) {
          const createNewWindow = confirm('Create new window for this session?');
          if (createNewWindow) {
            const window = await chrome.windows.create({ url: session.tabs[0].url });
            for (let i = 1; i < session.tabs.length; i++) {
              await chrome.tabs.create({ windowId: window.id, url: session.tabs[i].url });
            }
          } else {
            session.tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
          }
        }
      });
       // Drag and drop
       document.getElementById('tabGroups').addEventListener('dragstart', (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (!tabItem) return;
  
        this.draggedTab = tabItem;
        tabItem.classList.add('dragging');
        e.dataTransfer.setData('text/plain', tabItem.dataset.tabId);
      });
      document.getElementById('tabGroups').addEventListener('dragend', (e) => {
        if (this.draggedTab) {
          this.draggedTab.classList.remove('dragging');
          this.draggedTab = null;
        }
        document.querySelectorAll('.drag-over').forEach(el => 
          el.classList.remove('drag-over')
        );
      });
      document.getElementById('tabGroups').addEventListener('dragover', (e) => {
        e.preventDefault();
        const tabItem = e.target.closest('.tab-item');
        if (!tabItem || tabItem === this.draggedTab) return;
  
        document.querySelectorAll('.drag-over').forEach(el => 
          el.classList.remove('drag-over')
        );
        tabItem.classList.add('drag-over');
      });
  
      document.getElementById('tabGroups').addEventListener('drop', (e) => 
        this.handleDrop(e)
      );
       document.getElementById('tabGroups').addEventListener('drop', async (e) => {
        e.preventDefault();
        const targetTab = e.target.closest('.tab-item');
        if (!targetTab || !this.draggedTab) return;
         const sourceTabId = parseInt(this.draggedTab.dataset.tabId);
        const targetTabId = parseInt(targetTab.dataset.tabId);
         if (sourceTabId === targetTabId) return;
         const sourceTabs = await chrome.tabs.query({ currentWindow: true });
        const sourceIndex = sourceTabs.findIndex(tab => tab.id === sourceTabId);
        const targetIndex = sourceTabs.findIndex(tab => tab.id === targetTabId);
         await chrome.tabs.move(sourceTabId, { index: targetIndex });
        await this.loadTabs();
      });
    }
    async saveWorkspace() {
      const name = prompt('Enter session name:');
      if (!name) return;
    
      let tabs = [];
      try {
        tabs = await chrome.tabs.query({ currentWindow: true });
      } catch (error) {
        console.error('Error querying tabs:', error);
      }
    
      const session = {
        id: Date.now().toString(),
        name,
        tabs: tabs.map(tab => ({
          url: tab.url,
          title: tab.title,
          favicon: tab.favIconUrl || 'default-favicon-url' // Provide fallback for favicon
        })),
        timestamp: Date.now()
      };
    
      // Ensure storage retrieval works asynchronously and check for null/undefined
      const { sessions = [] } = await chrome.storage.local.get('sessions');
    
      // Add the new session to the beginning of the sessions array
      sessions.unshift(session);
    
      // Store the updated sessions back into local storage
      await chrome.storage.local.set({ sessions });
    
      // Call loadSessions (assuming it's implemented elsewhere)
      await this.loadSessions();
    
      // Create a temporary success message
      const successMessage = document.createElement('div');
      successMessage.textContent = `Your session "${name}" has been saved successfully!`;
      successMessage.style.position = 'fixed';
      successMessage.style.top = '170px';
      successMessage.style.left = '50%';
      successMessage.style.transform = 'translateX(-50%)';
      successMessage.style.backgroundColor = '#4CAF50';
      successMessage.style.color = 'white';
      successMessage.style.padding = '10px 20px';
      successMessage.style.borderRadius = '10px';
      successMessage.style.fontSize = '12px';
      successMessage.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
      document.body.appendChild(successMessage);
    
      // Hide the message after 3 seconds
      setTimeout(() => {
        successMessage.style.opacity = '0';
        setTimeout(() => {
          successMessage.remove();
        }, 500); // Remove after fade-out
      }, 3000);
    }
    
    
  }
   // Initialize popup
  document.addEventListener('DOMContentLoaded', () => {
    new TabManager();
  });
 