class SessionManager {
  constructor() {
    this.initializeUI();
    this.loadSettings();
    this.attachEventListeners();
    this.activeSession = null;
    this.currentView = 'tabs';
    this.groupColors = [
      'grey', 'blue', 'red', 'yellow', 'green',
      'pink', 'purple', 'cyan'
    ];
  }

  async restoreWindow(windowId) {
    if (!this.activeSession) return;

    try {
      // Get all tabs from the session
      const sessionTabs = this.activeSession.tabs;

      // Create new window with first tab
      const newWindow = await chrome.windows.create({
        url: sessionTabs[0].url,
        focused: true,
        state: 'maximized'
      });

      // Create remaining tabs in the window
      for (let i = 1; i < sessionTabs.length; i++) {
        await chrome.tabs.create({
          windowId: newWindow.id,
          url: sessionTabs[i].url,
          active: false
        });
      }

      // Show success notification
      this.showNotification('Session restored successfully', 'success');
    } catch (error) {
      console.error('Error restoring session:', error);
      this.showNotification('Error restoring session', 'error');
    }
  }
    

    async createTabGroup(tabs, name, color) {
      if (!tabs || tabs.length === 0) {
        this.showNotification('Please select at least one tab', 'error');
        return;
      }
    
      try {
        // Verify all tabs exist and are in the same window
        const existingTabs = await chrome.tabs.query({});
        const validTabs = tabs.filter(tabId => 
          existingTabs.some(t => t.id === tabId)
        );
    
        if (validTabs.length === 0) {
          this.showNotification('No valid tabs selected', 'error');
          return;
        }
    
        // Get the window ID of the first tab to ensure all tabs are in same window
        const firstTab = await chrome.tabs.get(validTabs[0]);
        const windowId = firstTab.windowId;
    
        // Filter tabs to only include those in the same window
        const sameWindowTabs = validTabs.filter(tabId => 
          existingTabs.find(t => t.id === tabId)?.windowId === windowId
        );
    
        if (sameWindowTabs.length === 0) {
          this.showNotification('Selected tabs must be in the same window', 'error');
          return;
        }
    
        // Create the group
        const groupId = await chrome.tabs.group({
          tabIds: sameWindowTabs,
          createProperties: { windowId }
        });
    
        // Update group properties
        await chrome.tabGroups.update(groupId, { 
          title: name,
          color: color
        });
    
        this.showNotification(`Group "${name}" created with ${sameWindowTabs.length} tabs`, 'success');
        await this.displayCurrentTabs(); // Refresh the view
      } catch (error) {
        console.error('Error creating group:', error);
        this.showNotification(`Error: ${error.message}`, 'error');
      }
    }
    
    showNotification(message, type = 'success') {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.remove();
      }, 3000);
    }
  
    async initializeUI() {
      await this.displayCurrentTabs();
      await this.loadSessions();
      this.setupTheme();
    }
  
    setupTheme() {
      const isDark = localStorage.getItem('darkMode') === 'true';
      document.body.classList.toggle('dark', isDark);
      document.querySelector('.theme-icon').textContent = isDark ? '𖤓' : '⏾';
    }
  
    async loadSettings() {
      const { settings = {} } = await chrome.storage.local.get('settings');
      this.settings = settings;
    }
  
    async displayCurrentTabs() {
      const container = document.getElementById('sessionDetails');
      const windows = await chrome.windows.getAll({ populate: true });
      const currentTabs = {};
      this.currentView = 'tabs';
      
      // Clear active session when returning to current tabs
      this.activeSession = null;
      document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
      });
  
      windows.forEach(window => {
        currentTabs[window.id] = window.tabs.map(tab => ({
          id: tab.id,
          windowId: window.id.toString(),
          title: tab.title,
          url: tab.url,
          favicon: tab.favIconUrl || 'icons/default-favicon.png'
        }));
      });
  
      container.innerHTML = `
        <h2>Current Tabs</h2>
        <div class="group-creation-panel">
          <h3>Create Tab Group</h3>
          <div class="group-form">
            <input type="text" id="groupName" placeholder="Group name" class="group-input">
            <select id="groupColor" class="group-input">
              ${this.groupColors.map(color =>
                `<option value="${color}">${color.charAt(0).toUpperCase() + color.slice(1)}</option>`
              ).join('')}
            </select>
            <button id="createGroup" class="btn" disabled>Create Group</button>
          </div>
        </div>
        ${Object.entries(currentTabs).map(([windowId, tabs]) => `
          <div class="window-group">
            <div class="window-header">
              <span>Window ${windowId}</span>
              <span>${tabs.length} tabs</span>
            </div>
            <div class="tab-list searchable-content">
              ${tabs.map(tab => `
                <div class="tab-item">
                  <input type="checkbox" class="tab-select" data-tab-id="${tab.id}">
                  <img class="tab-favicon" src="${tab.favicon}" alt="">
                  <span class="tab-title">${tab.title}</span>
                  <a href="${tab.url}" class="tab-url" target="_blank">>></a>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      `;
  
      this.setupGroupCreationListeners();
    }
    
setupGroupCreationListeners() {
  const createButton = document.getElementById('createGroup');
  const checkboxes = document.querySelectorAll('.tab-select');
  const groupNameInput = document.getElementById('groupName');
  
  // Enable/disable create button based on selection
  const updateCreateButton = () => {
    const selectedTabs = document.querySelectorAll('.tab-select:checked');
    const hasName = groupNameInput.value.trim().length > 0;
    createButton.disabled = selectedTabs.length === 0 || !hasName;
    
    // Visual feedback about minimum selection
    if (selectedTabs.length === 0 && hasName) {
      createButton.title = 'Select at least one tab';
    } else if (!hasName && selectedTabs.length > 0) {
      createButton.title = 'Enter a group name';
    } else {
      createButton.title = 'Create tab group';
    }
  };

  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', updateCreateButton);
  });

  groupNameInput.addEventListener('input', updateCreateButton);

  // Handle group creation
  createButton.addEventListener('click', async () => {
    const selectedTabs = Array.from(document.querySelectorAll('.tab-select:checked'))
      .map(checkbox => parseInt(checkbox.dataset.tabId));
    const groupName = document.getElementById('groupName').value.trim();
    const groupColor = document.getElementById('groupColor').value;

    if (selectedTabs.length > 0 && groupName) {
      await this.createTabGroup(selectedTabs, groupName, groupColor);
      
      // Clear form after successful creation
      groupNameInput.value = '';
      checkboxes.forEach(checkbox => checkbox.checked = false);
      updateCreateButton();
    }
  });

  // Add select all/none functionality for each window
  document.querySelectorAll('.window-group').forEach(windowGroup => {
    const header = windowGroup.querySelector('.window-header');
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'btn select-all-btn';
    selectAllBtn.textContent = 'Select All';
    header.appendChild(selectAllBtn);

    selectAllBtn.addEventListener('click', () => {
      const checkboxes = windowGroup.querySelectorAll('.tab-select');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
      updateCreateButton();
    });
  });
}
  
    async loadSessions() {
      const { sessions = [] } = await chrome.storage.local.get('sessions');
      const container = document.getElementById('sessionsList');
      
      container.innerHTML = sessions.map(session => `
        <div class="session-item" data-session-id="${session.id}">
          <div class="session-info">
            <div class="session-name-container">
              <strong class="session-name">${session.name}</strong>
              <button class="edit-name-btn" title="Edit name">Edit</button>
              <button class="delete-session-btn" title="Delete session">Delete</button>
            </div>
            <div class="session-meta">
              <span>${new Date(session.timestamp).toLocaleString()}</span>
              <span>${session.tabs.length} tabs</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  
    async editSessionName(sessionId, element) {
      const { sessions = [] } = await chrome.storage.local.get('sessions');
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;
  
      const nameElement = element.querySelector('.session-name');
      const currentName = nameElement.textContent;
      
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentName;
      input.className = 'edit-name-input';
      input.style.width = '120px';
      
      
      nameElement.replaceWith(input);
      input.focus();
      input.select();
  
      const saveEdit = async () => {
        const newName = input.value.trim() || currentName;
        session.name = newName;
        
        const updatedSessions = sessions.map(s => 
          s.id === sessionId ? { ...s, name: newName } : s
        );
        
        await chrome.storage.local.set({ sessions: updatedSessions });
        
        const newNameElement = document.createElement('strong');
        newNameElement.className = 'session-name';
        newNameElement.textContent = newName;
        input.replaceWith(newNameElement);
        
        if (this.activeSession?.id === sessionId) {
          this.renderSessionDetails({ ...this.activeSession, name: newName });
        }
      };
  
      input.addEventListener('blur', saveEdit);
      input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') saveEdit();
        if (e.key === 'Escape') {
          const newNameElement = document.createElement('strong');
          newNameElement.className = 'session-name';
          newNameElement.textContent = currentName;
          input.replaceWith(newNameElement);
        }
      });
    }
  
    async deleteSession(sessionId) {
      if (!confirm('Are you sure you want to delete this session?')) return;
  
      const { sessions = [] } = await chrome.storage.local.get('sessions');
      const updatedSessions = sessions.filter(s => s.id !== sessionId);
      await chrome.storage.local.set({ sessions: updatedSessions });
      
      if (this.activeSession?.id === sessionId) {
        await this.displayCurrentTabs();
      }
      
      await this.loadSessions();
    }
  
    renderSessionDetails(session) {
      if (!session) return;
      
      const container = document.getElementById('sessionDetails');
      const windowGroups = this.groupTabsByWindow(session.tabs);
      this.currentView = 'session';
      
      container.innerHTML = `
        <div class="session-header">
          <h2>${session.name}</h2>
          <button class="return-to-current">Return to Current Tabs</button>
        </div>
        <div class="session-meta">
          <span>Created: ${new Date(session.timestamp).toLocaleString()}</span>
          <span>${session.tabs.length} tabs total</span>
        </div>
        ${Object.entries(windowGroups).map(([windowId, tabs]) => `
          <div class="window-group">
            <div class="window-header">
              <span>Window ${windowId}</span>
              <span>${tabs.length} tabs</span>
              <button class="restore-window" data-window-id="${windowId}">Restore Window</button>
            </div>
            <div class="tab-list searchable-content">
              ${tabs.map(tab => `
                <div class="tab-item">
                  <img class="tab-favicon" src="${tab.favicon}" alt="">
                  <span class="tab-title">${tab.title}</span>
                  <a href="${tab.url}" class="tab-url" target="_blank">>></a>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      `;
    }
  
    groupTabsByWindow(tabs) {
      const groups = {};
      tabs.forEach(tab => {
        if (!groups[tab.windowId]) {
          groups[tab.windowId] = [];
        }
        groups[tab.windowId].push(tab);
      });
      return groups;
    }
  
    searchTabs(query) {
        query = query.toLowerCase();
        document.querySelectorAll('.searchable-content .tab-item').forEach(item => {
          const titleElement = item.querySelector('.tab-title');
          const title = titleElement ? titleElement.textContent.toLowerCase() : '';
          const isMatch = title.includes(query);
          item.style.display = isMatch ? 'flex' : 'none';
        });
      
        // Update window counts
        document.querySelectorAll('.window-group').forEach(group => {
          const visibleTabs = Array.from(group.querySelectorAll('.tab-item')).filter(tab =>
            getComputedStyle(tab).display !== 'none'
          ).length;
          const countSpan = group.querySelector('.window-header span:nth-child(2)');
          if (countSpan) {
            countSpan.textContent = `${visibleTabs} tabs`;
          }
      
          // Hide window group if no matching tabs
          group.style.display = visibleTabs > 0 ? 'block' : 'none';
        });
      }
      
  
    attachEventListeners() {
      // Theme toggle
      document.getElementById('themeToggle').addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        document.querySelector('.theme-icon').textContent = isDark ? '𖤓' : '⏾';
        localStorage.setItem('darkMode', isDark);
      });
  
      // Session selection
      document.getElementById('sessionsList').addEventListener('click', async (e) => {
        const sessionItem = e.target.closest('.session-item');
        if (!sessionItem) return;
  
        const sessionId = sessionItem.dataset.sessionId;
        
        if (e.target.classList.contains('edit-name-btn')) {
          await this.editSessionName(sessionId, sessionItem);
          return;
        }
  
        if (e.target.classList.contains('delete-session-btn')) {
          await this.deleteSession(sessionId);
          return;
        }
  
        const { sessions } = await chrome.storage.local.get('sessions');
        const session = sessions.find(s => s.id === sessionId);
        
        if (session) {
          document.querySelectorAll('.session-item').forEach(item => {
            item.classList.remove('active');
          });
          sessionItem.classList.add('active');
          this.activeSession = session;
          this.renderSessionDetails(session);
        }
      });
  
      // Search
      document.getElementById('searchSessions').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        this.searchTabs(query);
      });
  
      // Return to current tabs
      document.getElementById('sessionDetails').addEventListener('click', async (e) => {
        if (e.target.classList.contains('return-to-current')) {
          await this.displayCurrentTabs();
        }
  

        if (e.target.classList.contains('restore-window')) {
          const windowId = e.target.dataset.windowId;
          await this.restoreWindow(windowId);
        }
      });
    }
  }
  
  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    new SessionManager();
  });