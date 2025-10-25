// File: popup.js - Domain Whitelist Manager

document.addEventListener('DOMContentLoaded', () => {
  const domainInput = document.getElementById('domainInput');
  const addBtn = document.getElementById('addBtn');
  const currentSiteBtn = document.getElementById('currentSiteBtn');
  const domainList = document.getElementById('domainList');

  // Load and display whitelisted domains
  async function loadDomains() {
    const data = await chrome.storage.local.get('aiWhitelistedDomains');
    const whitelisted = data.aiWhitelistedDomains || [];
    domainList.innerHTML = '';
    
    if (whitelisted.length === 0) {
      domainList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No domains added yet</p>';
      return;
    }
    
    whitelisted.forEach((domain, index) => {
      const div = document.createElement('div');
      div.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        background: #f0f0f0;
        border-radius: 8px;
        margin-bottom: 8px;
      `;
      
      div.innerHTML = `
        <span style="font-family: monospace; color: #333;">${domain}</span>
        <button style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Remove</button>
      `;
      
      div.querySelector('button').onclick = async () => {
        whitelisted.splice(index, 1);
        await chrome.storage.local.set({ aiWhitelistedDomains: whitelisted });
        loadDomains();
      };
      
      domainList.appendChild(div);
    });
  }

  // Add domain
  async function addDomain(domain) {
    domain = domain.trim().toLowerCase();
    if (!domain) {
      alert('Please enter a domain');
      return;
    }
    
    const data = await chrome.storage.local.get('aiWhitelistedDomains');
    const whitelisted = data.aiWhitelistedDomains || [];
    
    if (whitelisted.includes(domain)) {
      alert('Domain already added');
      return;
    }
    
    whitelisted.push(domain);
    await chrome.storage.local.set({ aiWhitelistedDomains: whitelisted });
    domainInput.value = '';
    loadDomains();
    
    // Refresh current tab to load the extension
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  }

  // Add domain from input
  addBtn.onclick = () => {
    addDomain(domainInput.value);
  };

  domainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addDomain(domainInput.value);
    }
  });

  // Add current site
  currentSiteBtn.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const url = new URL(tab.url);
      const domain = url.hostname;
      addDomain(domain);
    }
  };

  // Force-activate the sidebar for the current article (one-time)
  const forceBtn = document.getElementById('forceActivateBtn');
  if (forceBtn) {
    forceBtn.onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || typeof tab.id === 'undefined') {
        alert('No active tab found');
        return;
      }

      // Try sending a message to the content script first
      chrome.tabs.sendMessage(tab.id, { action: 'forceActivateArticle' }, async (response) => {
        if (chrome.runtime.lastError) {
          // Content script may not be ready — inject it and retry (one-time)
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['contentScript.js']
            });
            // Retry sending the message
            chrome.tabs.sendMessage(tab.id, { action: 'forceActivateArticle' }, (resp2) => {
              if (chrome.runtime.lastError) {
                alert('Activation failed: content script not reachable.');
              } else {
                alert('Sidebar activated for this article.');
              }
            });
          } catch (e) {
            alert('Activation failed: could not inject content script.');
          }
        } else {
          alert('Sidebar activated for this article.');
        }
      });
    };
  }

  // Initial load
  loadDomains();
});