/**
 * contentScript.js - News/Article Analyzer
 * - User manually adds websites via popup
 * - Only activates on whitelisted domains
 * - Disabled on homescreens/index pages
 * - Modern UI with emotion pulse, bias detection, analysis, quiz, and chat
 */

(function () {
  if (window.__aiSidebarInjected) return;
  window.__aiSidebarInjected = true;

  console.log('[AI News] Script loaded');

  // Listen for a one-time force-activate message from the popup.
  // When received, initialize the extension for the current page regardless of article-detection logic.
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'forceActivateArticle') {
        console.log('[AI News] Received one-time forceActivateArticle message');
        try {
          // If the extension is already injected, initialize immediately.
          if (typeof initializeExtension === 'function') {
            initializeExtension();
            sendResponse({ status: 'activated' });
          } else {
            // If initializeExtension not available (rare), inject the content script again and then respond.
            chrome.scripting.executeScript(
              { target: { tabId: sender.tab?.id }, files: ['contentScript.js'] },
              () => {
                // We can't reliably call initializeExtension after reinjection due to scope, but reinjection will run the script.
                sendResponse({ status: 'injected' });
              }
            );
          }
        } catch (e) {
          console.warn('[AI News] forceActivateArticle handler error', e);
          try { sendResponse({ status: 'error', message: String(e) }); } catch(e) {}
        }
        // Indicate asynchronous response
        return true;
      }
    });
  } catch (e) {
    console.warn('[AI News] Could not register forceActivateArticle listener', e);
  }

  async function isWhitelistedDomain() {
    const hostname = window.location.hostname.toLowerCase();
    const data = await chrome.storage.local.get('aiWhitelistedDomains');
    const whitelisted = data.aiWhitelistedDomains || [];
    console.log('[AI News] Current hostname:', hostname);
    console.log('[AI News] Whitelisted domains:', whitelisted);
    const isWhitelisted = whitelisted.some(domain => hostname.includes(domain.toLowerCase()));
    console.log('[AI News] Is whitelisted:', isWhitelisted);
    return isWhitelisted;
  }

  function isHomescreenPage() {
    const path = window.location.pathname.toLowerCase();
    const url = window.location.href.toLowerCase();
    
    const homescreenPatterns = [
      /^\/?$/,
      /\/(index|home|main)(\.html)?$/,
      /\/(search|results|tag|category)/,
      /\?(s=|q=|search=|query=)/,
    ];
    
    const newsPatterns = [
      /\/(trending|top|latest|breaking|headlines|feed)/i,
      /\/(author|writer|journalist)\//i,
      /\/(section|topic|politics|business|tech|sports|world)\/?$/i,
    ];
    
    const isHomescreen = homescreenPatterns.some(pattern => pattern.test(path));
    const isNewsIndex = newsPatterns.some(pattern => pattern.test(path)) && 
                        !url.includes('/article') && 
                        !url.includes('/news/') &&
                        !url.includes('/story') &&
                        !url.includes('/story') &&
                        !url.includes('/articles');
    
    const isSearchPage = /\?(s=|q=|search=|query=|page=)/.test(url) && 
                         !url.includes('/article') &&
                         !url.includes('/articles');
    
    return isHomescreen || isNewsIndex || isSearchPage;
  }

  isWhitelistedDomain().then(whitelisted => {
    if (!whitelisted) {
      console.log('[AI News] Domain not whitelisted, exiting');
      return;
    }
    
    if (isHomescreenPage()) {
      console.log('[AI News] Homescreen/index detected, extension disabled on this page');
      return;
    }
    
    console.log('[AI News] Domain is whitelisted and not a homescreen, initializing extension');
    initializeExtension();
  });

  function initializeExtension() {
    let emotionIntensities = [];
    let articleParagraphs = [];
    let currentActiveIndex = 0;
    let pulseBar = null;
    
    let responseCache = {
      bias: null,
      analysis: null,
      emotions: null
    };
    let backgroundProcessing = {
      bias: false,
      analysis: false,
      emotions: false
    };

    async function renderEmotionPulse() {
      console.log('started renderEmotionPulse');
      articleParagraphs = Array.from(document.querySelectorAll('p'))
        .filter(p => p.innerText.trim().length > 20);
      
      if (!articleParagraphs.length) return;

      if (!document.getElementById('ai-emotion-pulse')) {
        const pulseContainer = document.createElement('div');
        pulseContainer.id = 'ai-emotion-pulse-container';
        pulseContainer.style.cssText = `
          position: fixed;
          top: 50%;
          left: 20px;
          transform: translateY(-50%);
          z-index: 9999999;
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(79, 140, 255, 0.15);
          border-radius: 24px;
          padding: 24px 32px 28px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 320px;
          border: 1px solid rgba(79, 140, 255, 0.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        // Collapsible arrow tab
        const collapseTab = document.createElement('div');
        collapseTab.id = 'ai-emotion-collapse-tab';
        collapseTab.style.cssText = `
          position: absolute;
          top: 50%;
          right: -18px;
          transform: translateY(-50%);
          width: 32px;
          height: 48px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px;
          box-shadow: 2px 4px 16px rgba(102,126,234,0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 2;
          transition: background 0.2s, width 0.3s, height 0.3s;
        `;
        collapseTab.innerHTML = `
          <svg id="ai-emotion-collapse-arrow" width="20" height="20" viewBox="0 0 24 24" style="transition: transform 0.3s;">
            <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.18)" />
            <polyline points="8 5 16 12 8 19" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        pulseContainer.appendChild(collapseTab);

        const mainLabel = document.createElement('div');
        mainLabel.innerHTML = `<span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700; font-size: 18px; letter-spacing: 0.5px;">Emotion Pulse</span>`;
        mainLabel.style.cssText = `
          width: 100%;
          text-align: center;
          margin-bottom: 16px;
        `;
        pulseContainer.appendChild(mainLabel);

        const barRow = document.createElement('div');
        barRow.style.cssText = `
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          width: 100%;
        `;

        const labelCol = document.createElement('div');
        labelCol.style.cssText = `
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-end;
          height: 60px;
          margin-right: 12px;
        `;
        labelCol.innerHTML = `
          <span style="font-size:13px; color:#ff6b6b; font-weight:600;">Intense</span>
          <span style="font-size:13px; color:#667eea; font-weight:600;">Calm</span>
        `;

        const canvas = document.createElement('canvas');
        canvas.id = 'ai-emotion-pulse';
        canvas.width = 240;
        canvas.height = 60;
        canvas.style.cssText = `
          display: block;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 12px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);
          border: 1px solid rgba(79,140,255,0.1);
        `;

        barRow.appendChild(labelCol);
        barRow.appendChild(canvas);
        pulseContainer.appendChild(barRow);

        document.body.appendChild(pulseContainer);
        pulseBar = canvas;

        // Collapsible logic
        let collapsed = false;
        collapseTab.onclick = () => {
          collapsed = !collapsed;
          if (collapsed) {
            pulseContainer.style.width = '54px';
            pulseContainer.style.padding = '24px 8px 28px 8px';
            mainLabel.style.visibility = 'hidden';
            barRow.style.visibility = 'hidden';
            labelCol.style.visibility = 'hidden';
            canvas.style.visibility = 'hidden';
            collapseTab.querySelector('svg').style.transform = 'rotate(180deg)';
            collapseTab.style.width = '32px';
            collapseTab.style.height = '48px';
          } else {
            pulseContainer.style.width = '320px';
            pulseContainer.style.padding = '24px 32px 28px 32px';
            mainLabel.style.visibility = 'visible';
            barRow.style.visibility = 'visible';
            labelCol.style.visibility = 'visible';
            canvas.style.visibility = 'visible';
            collapseTab.querySelector('svg').style.transform = 'rotate(0deg)';
            collapseTab.style.width = '32px';
            collapseTab.style.height = '48px';
            // Reset labelCol and barRow styles to ensure correct layout
            labelCol.style.display = 'flex';
            labelCol.style.flexDirection = 'column';
            labelCol.style.justifyContent = 'space-between';
            labelCol.style.alignItems = 'flex-end';
            labelCol.style.height = '60px';
            labelCol.style.marginRight = '12px';
            barRow.style.display = 'flex';
            barRow.style.flexDirection = 'row';
            barRow.style.alignItems = 'center';
            barRow.style.justifyContent = 'center';
            barRow.style.width = '100%';
          }
        };
      }

      if (responseCache.emotions) {
        emotionIntensities = responseCache.emotions;
        drawPulseVisualization();
        setupSmartScrollTracking();
        return;
      }

      // Initialize with neutral values
      emotionIntensities = new Array(articleParagraphs.length).fill(0.5);
      
      // Start with animated pulse loading state
      drawPulseLoadingAnimation();
      setupSmartScrollTracking();

      if (!backgroundProcessing.emotions) {
        backgroundProcessing.emotions = true;
        await analyzeEmotionsWithAI();
      }
      console.log('completed renderEmotionPulse');
    }

    async function analyzeEmotionsWithAI() {
      const MAX_RETRIES = 3;
      const CHUNK_SIZE = 3;
      const MAX_SESSION_ATTEMPTS = 5;
      
      let session = null;
      let sessionAttempts = 0;
      
      async function createSession() {
        while (sessionAttempts < MAX_SESSION_ATTEMPTS) {
          try {
            if (!window.LanguageModel) throw new Error('LanguageModel API not available');
            const available = await window.LanguageModel.availability();
            if (available === 'unavailable') throw new Error('LanguageModel API unavailable');

            session = await window.LanguageModel.create({
              initialPrompts: [
                { role: 'system', content: 'You are an emotion analyzer. Analyze text and return emotion scores. For each text, output ONLY a number between 0.0 and 1.0 where 0.0=very negative, 0.5=neutral, 1.0=very positive. Always output exactly one number per text.' }
              ]
            });
            
            return true;
          } catch (error) {
            sessionAttempts++;
            if (sessionAttempts < MAX_SESSION_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, 1000 * sessionAttempts));
            }
          }
        }
        return false;
      }

      try {
        const sessionCreated = await createSession();
        if (!sessionCreated) {
          backgroundProcessing.emotions = false;
          return;
        }

        const aiIntensities = [];
        
        for (let chunkStart = 0; chunkStart < articleParagraphs.length; chunkStart += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, articleParagraphs.length);
          const chunk = articleParagraphs.slice(chunkStart, chunkEnd);
          
          for (let i = 0; i < chunk.length; i++) {
            const paragraph = chunk[i];
            const text = paragraph.innerText.trim();
            
            if (!text || text.length < 20) {
              aiIntensities.push(0.5);
              continue;
            }

            let intensity = 0.5;
            let retryCount = 0;
            
            while (retryCount < MAX_RETRIES) {
              try {
                const limitedText = text.substring(0, 250);
                const response = await session.prompt([
                  { role: 'user', content: `Text: "${limitedText}"\n\nEmotion score (0.0-1.0):` }
                ]);
                
                const cleanResponse = response.trim().replace(/[^0-9.]/g, '');
                intensity = parseFloat(cleanResponse);
                
                if (!isNaN(intensity) && intensity >= 0 && intensity <= 1) {
                  break;
                } else {
                  throw new Error(`Invalid intensity value: ${response}`);
                }
                
              } catch (error) {
                retryCount++;
                if (retryCount >= MAX_RETRIES) {
                  intensity = 0.5;
                } else {
                  await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                }
              }
            }
            
            intensity = Math.max(0.0, Math.min(1.0, intensity));
            aiIntensities.push(intensity);
          }
          
          if (aiIntensities.length > 0) {
            // Stop loading animation on first real data
            if (pulseBar && pulseBar._loadingAnimationId) {
              cancelAnimationFrame(pulseBar._loadingAnimationId);
              pulseBar._loadingAnimationId = null;
              pulseBar._isLoadingAnimationActive = false;
            }
            
            // Update emotion data
            for (let i = 0; i < aiIntensities.length; i++) {
              emotionIntensities[chunkStart + i] = aiIntensities[i];
            }
            drawPulseVisualization();
          }
          
          if (chunkEnd < articleParagraphs.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        // Ensure loading animation is stopped
        if (pulseBar && pulseBar._loadingAnimationId) {
          cancelAnimationFrame(pulseBar._loadingAnimationId);
          pulseBar._loadingAnimationId = null;
          pulseBar._isLoadingAnimationActive = false;
        }
        
        responseCache.emotions = aiIntensities;
        emotionIntensities = aiIntensities;
        drawPulseVisualization();
        
      } catch (error) {
        console.error('AI emotion analysis error:', error);
      } finally {
        backgroundProcessing.emotions = false;
        if (session) {
          try {
            session.destroy?.();
          } catch (e) {}
        }
      }
    }

    function drawPulseLoadingAnimation() {
      if (!pulseBar) return;
      
      // If animation is already active, don't start a new one
      if (pulseBar._isLoadingAnimationActive) return;
      
      pulseBar._isLoadingAnimationActive = true;
      const ctx = pulseBar.getContext('2d');
      let frame = 0;
      
      function animate() {
        // Check if animation should stop
        if (!pulseBar._isLoadingAnimationActive) {
          return; // Stop animation
        }
        
        ctx.clearRect(0, 0, pulseBar.width, pulseBar.height);
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, pulseBar.height);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        
        // Draw subtle breathing pulse line
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Slow breathing effect (pulse opacity)
        const breathe = Math.sin(frame * 0.02) * 0.3 + 0.7; // Slow sine wave
        ctx.globalAlpha = breathe;
        
        // Draw gentle horizontal line with slight wave
        ctx.beginPath();
        const centerY = pulseBar.height / 2;
        for (let x = 0; x < pulseBar.width; x += 3) {
          const offset = Math.sin((x / pulseBar.width) * Math.PI * 2 + frame * 0.03) * 8;
          const y = centerY + offset;
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        frame++;
        const animationId = requestAnimationFrame(animate);
        
        // Store animation ID so we can cancel it later
        pulseBar._loadingAnimationId = animationId;
      }
      
      animate();
    }

    function drawPulseVisualization() {
      if (!pulseBar || !emotionIntensities.length) return;
      
      // Stop loading animation if it's still running
      if (pulseBar._isLoadingAnimationActive) {
        pulseBar._isLoadingAnimationActive = false;
        if (pulseBar._loadingAnimationId) {
          cancelAnimationFrame(pulseBar._loadingAnimationId);
          pulseBar._loadingAnimationId = null;
        }
      }
      
      const ctx = pulseBar.getContext('2d');
      ctx.clearRect(0, 0, pulseBar.width, pulseBar.height);
      
      const gradient = ctx.createLinearGradient(0, 0, 0, pulseBar.height);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      for (let i = 0; i < emotionIntensities.length; i++) {
        const x = (pulseBar.width / Math.max(1, emotionIntensities.length - 1)) * i;
        const y = pulseBar.height - (emotionIntensities[i] * (pulseBar.height - 20)) - 10;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevX = (pulseBar.width / Math.max(1, emotionIntensities.length - 1)) * (i - 1);
          const prevY = pulseBar.height - (emotionIntensities[i - 1] * (pulseBar.height - 20)) - 10;
          const cpX = (prevX + x) / 2;
          ctx.quadraticCurveTo(cpX, prevY, x, y);
        }
      }
      ctx.stroke();
      
      if (currentActiveIndex < emotionIntensities.length) {
        const activeX = (pulseBar.width / Math.max(1, emotionIntensities.length - 1)) * currentActiveIndex;
        const activeY = pulseBar.height - (emotionIntensities[currentActiveIndex] * (pulseBar.height - 20)) - 10;
        
        ctx.beginPath();
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowColor = '#ff6b6b';
        ctx.shadowBlur = 15;
        ctx.arc(activeX, activeY, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function setupSmartScrollTracking() {
      let isScrolling = false;
      
      function handleScroll() {
        if (isScrolling) return;
        isScrolling = true;
        
        requestAnimationFrame(() => {
          const viewportCenter = window.innerHeight / 2;
          let closestIndex = 0;
          let closestDistance = Infinity;
          
          articleParagraphs.forEach((p, idx) => {
            const rect = p.getBoundingClientRect();
            const paragraphCenter = rect.top + rect.height / 2;
            const distance = Math.abs(paragraphCenter - viewportCenter);
            
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = idx;
            }
          });
          
          if (closestIndex !== currentActiveIndex) {
            if (articleParagraphs[currentActiveIndex]) {
              articleParagraphs[currentActiveIndex].style.cssText += `
                background: transparent;
                transform: scale(1);
                box-shadow: none;
              `;
            }
            
            currentActiveIndex = closestIndex;
            
            if (articleParagraphs[currentActiveIndex]) {
              articleParagraphs[currentActiveIndex].style.cssText += `
                background: linear-gradient(135deg, rgba(255, 235, 59, 0.1) 0%, rgba(255, 193, 7, 0.1) 100%);
                transform: scale(1.02);
                box-shadow: 0 4px 20px rgba(255, 193, 7, 0.2);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border-radius: 8px;
                padding: 12px;
                margin: 8px 0;
              `;
            }
            
            drawPulseVisualization();
          }
          
          isScrolling = false;
        });
      }
      
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
    }

    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'ai-sidebar-button';
    floatingBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: #fff;
      cursor: pointer;
      z-index: 9999998;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      font-size: 28px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    floatingBtn.innerHTML = '🧠';
    floatingBtn.title = 'Toggle Article Insights';
    
    floatingBtn.addEventListener('mouseenter', () => {
      floatingBtn.style.transform = 'scale(1.1)';
      floatingBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.6)';
    });
    
    floatingBtn.addEventListener('mouseleave', () => {
      floatingBtn.style.transform = 'scale(1)';
      floatingBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });
    
    document.body.appendChild(floatingBtn);

    const sidebar = document.createElement('div');
    sidebar.id = 'ai-news-sidebar';
    sidebar.style.cssText = `
      position: fixed;
      top: 0;
      right: -420px;
      width: 420px;
      height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      backdrop-filter: blur(20px);
      box-shadow: -8px 0 40px rgba(0, 0, 0, 0.15);
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
    `;

    sidebar.innerHTML = `
      <style>
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      @keyframes shimmer {
        0% { background-position: -200px 0; }
        100% { background-position: 200px 0; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      .ai-loader-animated {
        display: inline-block;
        animation: spin 1s linear infinite;
      }
      .ai-shimmer-loader {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200px 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 8px;
        height: 20px;
        margin: 8px 0;
      }
      .ai-content-card {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        padding: 20px;
        margin: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        animation: slideIn 0.6s ease-out;
      }
      .ai-tab-button {
        flex: 1;
        padding: 14px 8px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: rgba(255, 255, 255, 0.8);
        font-weight: 600;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.3s ease;
        border-bottom: 2px solid transparent;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ai-tab-button:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
      }
      .ai-tab-button.active {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
        border-bottom-color: #ffffff;
        box-shadow: 0 2px 10px rgba(255, 255, 255, 0.3);
      }
      .ai-close-btn {
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: rgba(255, 255, 255, 0.8);
        font-size: 18px;
        cursor: pointer;
        transition: all 0.3s ease;
        border-radius: 8px;
        margin: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .ai-close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
        transform: scale(1.1);
      }
      .ai-input-modern {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(102, 126, 234, 0.3);
        border-radius: 12px;
        padding: 12px 16px;
        font-size: 14px;
        transition: all 0.3s ease;
        outline: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .ai-input-modern:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        background: #ffffff;
      }
      .ai-button-modern {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        border: none;
        border-radius: 12px;
        padding: 12px 20px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .ai-button-modern:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
      }
      .ai-chat-message {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: 18px;
        margin: 8px 0;
        animation: slideIn 0.3s ease-out;
        word-wrap: break-word;
        line-height: 1.4;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .ai-chat-user {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        align-self: flex-end;
        border-bottom-right-radius: 6px;
      }
      .ai-chat-ai {
        background: rgba(255, 255, 255, 0.9);
        color: #333333;
        align-self: flex-start;
        border-bottom-left-radius: 6px;
        border: 1px solid rgba(102, 126, 234, 0.1);
      }
      .clickable-ref {
        cursor: pointer;
        color: #667eea;
        text-decoration: underline;
        font-weight: 500;
        background: rgba(102, 126, 234, 0.1);
        padding: 2px 4px;
        border-radius: 3px;
      }
      </style>

      <div style="display: flex; align-items: center; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px);">
        <button id="ai-tab-insights" class="ai-tab-button active">🧠 Insights</button>
        <button id="ai-tab-quiz" class="ai-tab-button">📝 Quiz</button>
        <button id="ai-tab-chat" class="ai-tab-button">💬 Chat</button>
        <button id="ai-tab-advanced" class="ai-tab-button">📊 Analysis</button>
        <button id="ai-sidebar-close" class="ai-close-btn">✖</button>
      </div>

      <div id="ai-sidebar-insights" style="flex: 1; overflow-y: auto; padding: 8px;">
        <div class="ai-content-card" id="ai-bias-section">
          <h3 style="margin: 0 0 16px 0; color: #000; font-size: 18px; font-weight: 700;">🎯 Bias Detection</h3>
          <div id="ai-bias-loader" style="display: none; text-align: center; color: #667eea; padding: 20px;">
            <div style="font-size: 40px; margin-bottom: 12px;">
              <span class="ai-loader-animated">🎯</span>
            </div>
            <p style="margin: 8px 0; font-weight: 600; font-size: 15px;">Analyzing bias...</p>
            <div class="ai-shimmer-loader" style="width: 80%; margin: 16px auto;"></div>
            <div class="ai-shimmer-loader" style="width: 60%; margin: 8px auto;"></div>
          </div>
          <div id="ai-bias-result"></div>
        </div>

        <div class="ai-content-card" id="ai-analysis-section">
          <h3 style="margin: 0 0 16px 0; color: #000; font-size: 18px; font-weight: 700;">🔍 Deep Analysis</h3>
          <div id="ai-analysis-loader" style="display: none; text-align: center; color: #667eea; padding: 20px;">
            <div style="font-size: 40px; margin-bottom: 12px;">
              <span class="ai-loader-animated">🔍</span>
            </div>
            <p style="margin: 8px 0; font-weight: 600; font-size: 15px;">Analyzing article...</p>
            <div class="ai-shimmer-loader" style="width: 90%; margin: 16px auto;"></div>
            <div class="ai-shimmer-loader" style="width: 70%; margin: 8px auto;"></div>
            <div class="ai-shimmer-loader" style="width: 85%; margin: 8px auto;"></div>
          </div>
          <div id="ai-analysis-result"></div>
        </div>
      </div>

      <div id="ai-sidebar-quiz" style="display: none; flex: 1; overflow-y: auto; padding: 8px;">
        <div class="ai-content-card">
          <h3 style="margin: 0 0 16px 0; color: #000; font-size: 18px; font-weight: 700;">📝 Comprehension Quiz</h3>
          <p style="color: #666; font-size: 14px; margin-bottom: 16px;">Test your understanding of the article</p>
          
          <div id="ai-quiz-loader" style="display: none; text-align: center; color: #667eea; padding: 40px 20px;">
            <div style="font-size: 50px; margin-bottom: 16px;">
              <span class="ai-loader-animated">📝</span>
            </div>
            <p style="margin: 8px 0; font-weight: 600; font-size: 16px;">Generating quiz questions...</p>
            <div style="display: flex; gap: 8px; justify-content: center; margin-top: 20px;">
              <div style="width: 12px; height: 12px; background: #667eea; border-radius: 50%; animation: bounce 1s infinite;"></div>
              <div style="width: 12px; height: 12px; background: #764ba2; border-radius: 50%; animation: bounce 1s infinite 0.2s;"></div>
              <div style="width: 12px; height: 12px; background: #667eea; border-radius: 50%; animation: bounce 1s infinite 0.4s;"></div>
            </div>
          </div>
          
          <div id="ai-quiz-container"></div>
          
          <div id="ai-quiz-results" style="display: none; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 20px; margin-top: 16px;">
          </div>
          
          <button id="ai-quiz-submit" class="ai-button-modern" style="width: 100%; margin-top: 16px; display: none;">Submit Quiz</button>
          <button id="ai-quiz-retake" class="ai-button-modern" style="width: 100%; margin-top: 16px; display: none; background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);">Retake Quiz</button>
        </div>
      </div>

      <div id="ai-sidebar-chat" style="display: none; flex: 1; overflow: hidden; padding: 8px;">
        <div class="ai-content-card" style="display: flex; flex-direction: column; height: calc(100vh - 120px);">
          <h3 style="margin: 0 0 16px 0; color: #000; font-size: 18px; font-weight: 700;">💬 Ask About Article</h3>
          
          <div id="ai-pre-questions" style="margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
          </div>
          
          <div id="ai-chat-messages" style="flex: 1; overflow-y: auto; margin-bottom: 16px; padding: 12px; background: rgba(255, 255, 255, 0.5); border-radius: 12px; display: flex; flex-direction: column; gap: 4px; min-height: 200px;">
          </div>
          
          <div style="display: flex; gap: 12px; align-items: flex-end;">
            <input id="ai-chat-input" type="text" placeholder="Ask about this article..." class="ai-input-modern" style="flex: 1;"/>
            <button id="ai-chat-send" class="ai-button-modern">Send</button>
          </div>
        </div>
      </div>
      <div id="ai-sidebar-advanced" style="display: none; flex: 1; overflow-y: auto; padding: 8px;">
        <div class="ai-content-card">
          <h3 style="margin: 0 0 16px 0; color: #000; font-size: 18px; font-weight: 700;">📊 Advanced Analysis</h3>
          
          <!-- Topic Breakdown Chart Section -->
          <div style="margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #667eea; font-size: 16px; font-weight: 600;">Topic Breakdown</h4>
            <div style="position: relative; display: flex; justify-content: center; align-items: center; min-height: 280px;">
              <canvas id="ai-topic-chart" width="240" height="240" style="display: block;"></canvas>
              <div id="ai-chart-tooltip" style="
                position: absolute;
                display: none;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 13px;
                pointer-events: none;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                max-width: 200px;
                line-height: 1.4;
              "></div>
            </div>
            <div id="ai-chart-legend" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;"></div>
          </div>
          
          <!-- Source Trust Widget Section -->
          <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0; color: #667eea; font-size: 16px; font-weight: 600;">Source Trust</h4>
            <div id="ai-trust-widget" style="
              background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
              border-radius: 12px;
              padding: 16px;
              border: 1px solid rgba(102, 126, 234, 0.2);
            ">
              <div id="ai-trust-content"></div>
            </div>
          </div>
          
          <div id="ai-advanced-loader" style="display: none; text-align: center; padding: 40px 20px; color: #667eea;">
            <div style="font-size: 50px; margin-bottom: 16px;">
              <span class="ai-loader-animated">📊</span>
            </div>
            <p style="margin: 8px 0; font-weight: 600; font-size: 16px;">Analyzing article...</p>
            <div style="margin-top: 24px;">
              <div class="ai-shimmer-loader" style="width: 100%; margin: 12px auto;"></div>
              <div class="ai-shimmer-loader" style="width: 85%; margin: 12px auto;"></div>
              <div class="ai-shimmer-loader" style="width: 95%; margin: 12px auto;"></div>
              <div class="ai-shimmer-loader" style="width: 75%; margin: 12px auto;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);

    let sidebarShown = false;
    
    function showSidebar() {
      sidebar.style.right = '0px';
      sidebarShown = true;
    }
    
    function hideSidebar() {
      sidebar.style.right = '-420px';
      sidebarShown = false;
    }

    function toggleSidebar() {
      sidebarShown ? hideSidebar() : showSidebar();
    }

    floatingBtn.onclick = toggleSidebar;
    sidebar.querySelector('#ai-sidebar-close').onclick = hideSidebar;

    const tabInsights = sidebar.querySelector('#ai-tab-insights');
    const tabChat = sidebar.querySelector('#ai-tab-chat');
    const tabQuiz = sidebar.querySelector('#ai-tab-quiz');
    const contentInsights = sidebar.querySelector('#ai-sidebar-insights');
    const contentChat = sidebar.querySelector('#ai-sidebar-chat');
    const contentQuiz = sidebar.querySelector('#ai-sidebar-quiz');

    const tabAdvanced = sidebar.querySelector('#ai-tab-advanced');
    const contentAdvanced = sidebar.querySelector('#ai-sidebar-advanced');

    function showTab(tab) {
      if (tab === 'insights') {
        tabInsights.classList.add('active');
        tabChat.classList.remove('active');
        tabQuiz.classList.remove('active');
        tabAdvanced.classList.remove('active');
        contentInsights.style.display = 'block';
        contentChat.style.display = 'none';
        contentQuiz.style.display = 'none';
        contentAdvanced.style.display = 'none';
      } else if (tab === 'chat') {
        tabInsights.classList.remove('active');
        tabChat.classList.add('active');
        tabQuiz.classList.remove('active');
        tabAdvanced.classList.remove('active');
        contentInsights.style.display = 'none';
        contentChat.style.display = 'block';
        contentQuiz.style.display = 'none';
        contentAdvanced.style.display = 'none';
      } else if (tab === 'quiz') {
        tabInsights.classList.remove('active');
        tabChat.classList.remove('active');
        tabQuiz.classList.add('active');
        tabAdvanced.classList.remove('active');
        contentInsights.style.display = 'none';
        contentChat.style.display = 'none';
        contentQuiz.style.display = 'block';
        contentAdvanced.style.display = 'none';
      } else if (tab === 'advanced') {
        tabInsights.classList.remove('active');
        tabChat.classList.remove('active');
        tabQuiz.classList.remove('active');
        tabAdvanced.classList.add('active');
        contentInsights.style.display = 'none';
        contentChat.style.display = 'none';
        contentQuiz.style.display = 'none';
        contentAdvanced.style.display = 'block';
        renderAdvancedAnalysis();
      }
    }

    tabInsights.onclick = () => showTab('insights');
    tabChat.onclick = () => showTab('chat');
    tabQuiz.onclick = () => showTab('quiz');
    tabAdvanced.onclick = () => showTab('advanced');

    // --- Advanced Analysis Tab Logic ---
    let advancedAnalysisData = null;
    let chartAnimationComplete = false;

    async function renderAdvancedAnalysis() {
      if (advancedAnalysisData && chartAnimationComplete) {
        return; // Already rendered
      }

      const loader = sidebar.querySelector('#ai-advanced-loader');
      const chartCanvas = sidebar.querySelector('#ai-topic-chart');
      const trustContent = sidebar.querySelector('#ai-trust-content');

      if (!advancedAnalysisData) {
        loader.style.display = 'block';
        await generateAdvancedAnalysis();
        loader.style.display = 'none';
      }

      if (advancedAnalysisData) {
        drawTopicDonutChart(chartCanvas, advancedAnalysisData.topics);
        renderTrustWidget(trustContent, advancedAnalysisData.trust);
      }
    }

    async function generateAdvancedAnalysis() {
      try {
        if (!window.LanguageModel) throw new Error('LanguageModel API not available');
        const available = await window.LanguageModel.availability();
        if (available === 'unavailable') throw new Error('LanguageModel API unavailable');

        const session = await window.LanguageModel.create({
          initialPrompts: [
            { role: 'system', content: 'You are an article analyzer. Analyze content and provide structured data.' }
          ]
        });

        let articleText = Array.from(document.querySelectorAll('p'))
          .map(p => p.innerText.trim())
          .filter(text => text.length > 20)
          .join(' ')
          .substring(0, 3000);

        const hostname = window.location.hostname;

        let streamed = '';
        const stream = session.promptStreaming([
          { role: 'user', content: `Analyze this article and provide topic breakdown percentages and source trust information. Respond ONLY in this exact format:

TOPICS:
Politics: [0-100]
Economy: [0-100]
Science: [0-100]
Technology: [0-100]
Society: [0-100]
Environment: [0-100]

TRUST:
Source: ${hostname}
Ownership: [Brief ownership info]
Reliability: [0-100]
Bias: [Left/Center/Right]
History: [Brief historical context]

Article: ${articleText}` }
        ]);

        for await (const chunk of stream) {
          streamed += chunk;
        }

        const parsed = parseAdvancedAnalysis(streamed);
        advancedAnalysisData = parsed || getDefaultAnalysisData();
        console.log('[Advanced Analysis] Final data:', advancedAnalysisData);
        
      } catch (err) {
        console.error('[Advanced Analysis] Error:', err);
        advancedAnalysisData = getDefaultAnalysisData();
      }
    }

    function parseAdvancedAnalysis(text) {
      console.log('[Advanced Analysis] Parsing AI response:', text);
      const topics = [];
      const trust = {
        source: window.location.hostname,
        ownership: 'Information not available',
        reliability: 50,
        bias: 'Center',
        history: 'No historical data available'
      };

      // Parse topics (handle both bare numbers and numbers in brackets)
      const topicMatches = [
        { name: 'Politics', regex: /Politics:\s*\[?(\d+)\]?/i, color: '#ef4444', insight: 'Focus on political developments and policy analysis' },
        { name: 'Economy', regex: /Economy:\s*\[?(\d+)\]?/i, color: '#f59e0b', insight: 'Coverage of economic trends and financial matters' },
        { name: 'Science', regex: /Science:\s*\[?(\d+)\]?/i, color: '#10b981', insight: 'Scientific research and discoveries' },
        { name: 'Technology', regex: /Technology:\s*\[?(\d+)\]?/i, color: '#3b82f6', insight: 'Tech innovations and digital trends' },
        { name: 'Society', regex: /Society:\s*\[?(\d+)\]?/i, color: '#8b5cf6', insight: 'Social issues and cultural topics' },
        { name: 'Environment', regex: /Environment:\s*\[?(\d+)\]?/i, color: '#14b8a6', insight: 'Environmental and climate-related content' }
      ];

      let total = 0;
      topicMatches.forEach(topic => {
        const match = text.match(topic.regex);
        if (match) {
          const value = parseInt(match[1]);
          if (!isNaN(value) && value >= 0) {
            topics.push({ name: topic.name, value, color: topic.color, insight: topic.insight });
            total += value;
            console.log(`[Advanced Analysis] Found topic: ${topic.name} = ${value}%`);
          }
        }
      });

      console.log(`[Advanced Analysis] Total topics found: ${topics.length}, total percentage: ${total}`);

      // If no topics were parsed or total is 0, return null to trigger default data
      if (topics.length === 0 || total === 0) {
        console.log('[Advanced Analysis] No valid topics parsed, will use default data');
        return null;
      }

      // Normalize if total isn't 100
      if (total !== 100 && total > 0) {
        topics.forEach(topic => {
          topic.value = Math.round((topic.value / total) * 100);
        });
        console.log('[Advanced Analysis] Normalized topic percentages');
      }

      // Parse trust data
      const ownershipMatch = text.match(/Ownership:\s*(.+)/i);
      if (ownershipMatch) {
        trust.ownership = ownershipMatch[1].trim();
        console.log('[Advanced Analysis] Found ownership:', trust.ownership);
      }

      const reliabilityMatch = text.match(/Reliability:\s*\[?(\d+)\]?/i);
      if (reliabilityMatch) {
        trust.reliability = parseInt(reliabilityMatch[1]);
        console.log('[Advanced Analysis] Found reliability:', trust.reliability);
      }

      const biasMatch = text.match(/Bias:\s*\[?(Left|Center|Right)\]?/i);
      if (biasMatch) {
        trust.bias = biasMatch[1];
        console.log('[Advanced Analysis] Found bias:', trust.bias);
      }

      const historyMatch = text.match(/History:\s*(.+)/i);
      if (historyMatch) {
        trust.history = historyMatch[1].trim();
        console.log('[Advanced Analysis] Found history:', trust.history);
      }

      console.log('[Advanced Analysis] Parsed data successfully');
      return { topics, trust };
    }

    function getDefaultAnalysisData() {
      return {
        topics: [
          { name: 'Politics', value: 30, color: '#ef4444', insight: 'Focus on political developments' },
          { name: 'Economy', value: 20, color: '#f59e0b', insight: 'Economic and financial coverage' },
          { name: 'Society', value: 25, color: '#8b5cf6', insight: 'Social and cultural topics' },
          { name: 'Technology', value: 15, color: '#3b82f6', insight: 'Tech-related content' },
          { name: 'Other', value: 10, color: '#6b7280', insight: 'Miscellaneous topics' }
        ],
        trust: {
          source: window.location.hostname,
          ownership: 'Information being analyzed',
          reliability: 75,
          bias: 'Center',
          history: 'Established news source'
        }
      };
    }

    function drawTopicDonutChart(canvas, topics) {
      if (!canvas || !topics || topics.length === 0) {
        console.error('[Advanced Analysis] Cannot draw chart - missing canvas or topics', {
          hasCanvas: !!canvas,
          hasTopics: !!topics,
          topicsLength: topics?.length
        });
        return;
      }
      
      console.log('[Advanced Analysis] Drawing donut chart with', topics.length, 'topics');

      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 90;
      const innerRadius = 50;

      // Animation setup
      let animationProgress = 0;
      const animationDuration = 1500;
      const startTime = Date.now();

      function animate() {
        const elapsed = Date.now() - startTime;
        animationProgress = Math.min(elapsed / animationDuration, 1);
        
        // Easing function (ease-out cubic)
        const eased = 1 - Math.pow(1 - animationProgress, 3);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let currentAngle = -Math.PI / 2;
        
        topics.forEach((topic, index) => {
          const sliceAngle = (topic.value / 100) * 2 * Math.PI * eased;
          
          // Draw slice
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
          ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
          ctx.closePath();
          
          ctx.fillStyle = topic.color;
          ctx.fill();
          
          // Add subtle border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 2;
          ctx.stroke();

          currentAngle += sliceAngle;
        });

        // Draw center circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = 'rgba(102, 126, 234, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw center text
        ctx.fillStyle = '#667eea';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Topics', centerX, centerY);

        if (animationProgress < 1) {
          requestAnimationFrame(animate);
        } else {
          chartAnimationComplete = true;
          setupChartInteraction(canvas, topics, centerX, centerY, radius, innerRadius);
        }
      }

      animate();
      renderChartLegend(topics);
    }

    function setupChartInteraction(canvas, topics, centerX, centerY, radius, innerRadius) {
      const tooltip = sidebar.querySelector('#ai-chart-tooltip');

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= innerRadius && distance <= radius) {
          let angle = Math.atan2(dy, dx);
          if (angle < -Math.PI / 2) angle += 2 * Math.PI;
          angle += Math.PI / 2;
          if (angle >= 2 * Math.PI) angle -= 2 * Math.PI;

          let currentAngle = 0;
          for (let topic of topics) {
            const sliceAngle = (topic.value / 100) * 2 * Math.PI;
            if (angle >= currentAngle && angle < currentAngle + sliceAngle) {
              tooltip.innerHTML = `<strong>${topic.name}</strong><br>${topic.value}%<br><span style="font-size: 11px; opacity: 0.9;">${topic.insight}</span>`;
              tooltip.style.display = 'block';
              tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
              tooltip.style.top = (e.clientY - rect.top - 15) + 'px';
              canvas.style.cursor = 'pointer';
              return;
            }
            currentAngle += sliceAngle;
          }
        }

        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      });

      canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      });
    }

    function renderChartLegend(topics) {
      const legend = sidebar.querySelector('#ai-chart-legend');
      legend.innerHTML = '';

      topics.forEach(topic => {
        const item = document.createElement('div');
        item.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #333;
        `;
        item.innerHTML = `
          <div style="width: 12px; height: 12px; background: ${topic.color}; border-radius: 3px;"></div>
          <span><strong>${topic.name}</strong>: ${topic.value}%</span>
        `;
        legend.appendChild(item);
      });
    }

    function renderTrustWidget(container, trust) {
      if (!container || !trust) return;

      const reliabilityColor = trust.reliability >= 75 ? '#22c55e' : trust.reliability >= 50 ? '#f59e0b' : '#ef4444';
      const biasColor = trust.bias === 'Center' ? '#22c55e' : trust.bias === 'Left' ? '#3b82f6' : '#ef4444';

      container.innerHTML = `
        <div style="margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #333; font-size: 14px;">Source</span>
            <span style="color: #667eea; font-size: 13px; font-family: monospace;">${trust.source}</span>
          </div>
          
          <div class="trust-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 8px; background: white; border-radius: 8px; cursor: help; transition: all 0.2s;">
            <span style="font-weight: 600; color: #333; font-size: 14px;">Ownership</span>
            <span style="color: #666; font-size: 13px; max-width: 60%; text-align: right;">${trust.ownership}</span>
          </div>
          
          <div class="trust-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 8px; background: white; border-radius: 8px; cursor: help; transition: all 0.2s;">
            <span style="font-weight: 600; color: #333; font-size: 14px;">Reliability Score</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 80px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div style="width: ${trust.reliability}%; height: 100%; background: ${reliabilityColor}; transition: width 0.8s ease-out;"></div>
              </div>
              <span style="font-weight: 700; color: ${reliabilityColor}; font-size: 14px;">${trust.reliability}</span>
            </div>
          </div>
          
          <div class="trust-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 8px; background: white; border-radius: 8px; cursor: help; transition: all 0.2s;">
            <span style="font-weight: 600; color: #333; font-size: 14px;">Historical Bias</span>
            <span style="background: ${biasColor}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 12px;">${trust.bias}</span>
          </div>
          
          <div class="trust-item" style="display: flex; flex-direction: column; padding: 12px; background: white; border-radius: 8px; cursor: help; transition: all 0.2s;">
            <span style="font-weight: 600; color: #333; font-size: 14px; margin-bottom: 6px;">Historical Context</span>
            <span style="color: #666; font-size: 13px; line-height: 1.5;">${trust.history}</span>
          </div>
        </div>
      `;

      // Add hover tooltips
      const trustItems = container.querySelectorAll('.trust-item');
      const tooltips = {
        0: 'Information about who owns and controls this publication',
        1: 'Reliability score: based on factual consistency across past publications',
        2: 'Historical bias tendency observed in editorial choices',
        3: 'Background information about the publication\'s history and reputation'
      };

      trustItems.forEach((item, index) => {
        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(102, 126, 234, 0.05)';
          item.style.transform = 'translateX(4px)';
          item.title = tooltips[index];
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'white';
          item.style.transform = 'translateX(0)';
        });
      });
    }
    setTimeout(async () => {
      showSidebar();
      await Promise.all([runBiasAnalysis(), runDeeperAnalysis(), renderEmotionPulse(), setupChat(), setupQuiz()]);
    }, 1000);

    function scrollToAndHighlightElement(element) {
  if (!element) return;
  
  // Scroll to element
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Remove any existing highlights
  document.querySelectorAll('.ai-highlight-active').forEach(el => {
    el.classList.remove('ai-highlight-active');
    el.style.background = '';
    el.style.boxShadow = '';
    el.style.transform = '';
  });
  
  // Highlight the element
  element.classList.add('ai-highlight-active');
  const originalStyle = element.style.cssText;
  element.style.cssText += `
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.25) 100%) !important;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.4), 0 4px 24px rgba(102, 126, 234, 0.3) !important;
    transform: scale(1.02) !important;
    border-radius: 8px !important;
    padding: 16px !important;
    margin: 12px 0 !important;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
  `;
  
  // Fade out highlight after delay
  setTimeout(() => {
    element.style.transition = 'all 0.8s ease-out';
    element.style.background = 'transparent';
    element.style.boxShadow = 'none';
    element.style.transform = 'scale(1)';
    
    setTimeout(() => {
      element.classList.remove('ai-highlight-active');
      element.style.cssText = originalStyle;
    }, 800);
  }, 4000);
}

    async function runBiasAnalysis() {
      console.log('[AI News] Starting bias analysis');
      const loader = sidebar.querySelector('#ai-bias-loader');
      const result = sidebar.querySelector('#ai-bias-result');
      
      if (responseCache.bias) {
        displayBiasResult(responseCache.bias);
        return;
      }

      loader.style.display = 'block';
      result.innerHTML = '';

      try {
        if (!window.LanguageModel) throw new Error('LanguageModel API not available');
        const available = await window.LanguageModel.availability();
        if (available === 'unavailable') throw new Error('LanguageModel API unavailable');

        const session = await window.LanguageModel.create({
          initialPrompts: [
            { role: 'system', content: 'You are a media bias analyst. Analyze articles for political bias.' }
          ]
        });

        let articleText = Array.from(document.querySelectorAll('p'))
          .map(p => p.innerText.trim())
          .filter(text => text.length > 20)
          .join(' ')
          .substring(0, 3000);

        let streamed = '';
        const stream = session.promptStreaming([
          { role: 'user', content: `Analyze this article for political bias. Respond ONLY in this format:\nBIAS: [Left|Right|Neutral]\nEXPLANATION: <one sentence explanation>\n\n${articleText}` }
        ]);
        for await (const chunk of stream) {
          streamed += chunk;
          displayBiasResult(streamed);
        }
        responseCache.bias = streamed;
        console.log('[AI News] Bias analysis completed');
      } catch (err) {
        responseCache.bias = 'Error: ' + err.message;
        displayBiasResult(responseCache.bias);
      } finally {
        loader.style.display = 'none';
      }
    }

    function displayBiasResult(response) {
      const result = sidebar.querySelector('#ai-bias-result');
      
      let biasLabel = 'Neutral';
      let biasColor = '#4ade80';
      const biasMatch = response.match(/BIAS:\s*(?:\[)?(Left|Right|Neutral)(?:\])?/i);
      let explanation = '';
      const explanationMatch = response.match(/EXPLANATION:\s*(.*)/i);
      if (explanationMatch) explanation = explanationMatch[1];
      
      if (biasMatch) {
        const level = biasMatch[1].toLowerCase();
        if (level === 'right') {
          biasLabel = 'Right-Leaning';
          biasColor = '#ef4444';
        } else if (level === 'left') {
          biasLabel = 'Left-Leaning';
          biasColor = '#3b82f6';
        } else {
          biasLabel = 'Neutral';
          biasColor = '#4ade80';
        }
      }

      result.innerHTML = `
        <div style="margin-bottom: 16px;">
          <h4 style="margin:0 0 10px 0; color:#222; font-size:17px; font-weight:700; letter-spacing:0.5px;">Bias Detection</h4>
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <div style="background: ${biasColor}; color: white; padding: 7px 18px; border-radius: 24px; font-weight: 700; font-size: 16px; margin-right: 10px; box-shadow:0 2px 8px rgba(0,0,0,0.07); letter-spacing:0.5px;">${biasLabel}</div>
          </div>
          <div id="bias-explanation" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 18px 16px; color: #222; font-size: 16px; margin-bottom: 4px; box-shadow:0 2px 8px rgba(0,0,0,0.04); line-height:1.7; font-family: 'Segoe UI', Roboto, sans-serif;">
            ${explanation.replace(/([.?!])\s+/g, '$1<br>')}
          </div>
        </div>
      `;
    }

    async function runDeeperAnalysis() {
  console.log('started runDeeperAnalysis');
  const loader = sidebar.querySelector('#ai-analysis-loader');
  const result = sidebar.querySelector('#ai-analysis-result');
  
  if (responseCache.analysis) {
    displayAnalysisResult(responseCache.analysis);
    return;
  }

  loader.style.display = 'block';
  result.innerHTML = '';

  try {
    if (!window.LanguageModel) throw new Error('LanguageModel API not available');
    const available = await window.LanguageModel.availability();
    if (available === 'unavailable') throw new Error('LanguageModel API unavailable');

    const session = await window.LanguageModel.create({
      initialPrompts: [
        { role: 'system', content: 'You are an analyst. Provide insights with specific references to the article text.' }
      ]
    });

    // Get paragraphs with indices
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map((p, idx) => ({ text: p.innerText.trim(), index: idx, element: p }))
      .filter(p => p.text.length > 20);

    const articleText = paragraphs.map((p, i) => `[${i}] ${p.text}`).join('\n\n').substring(0, 3500);

    let streamed = '';
    const stream = session.promptStreaming([
      { role: 'user', content: `Analyze this article's key implications and what's not being said. Each paragraph is labeled with [N]. You must use square brackets and only square brackets when citing a paragraph. When referencing specific information, cite the paragraph number like this: "The article [3] mentions..." or "According to [5]..." or "[2] shows that..."

Provide EXACTLY 4-5 sentences of analysis. Each sentence should cite at least one paragraph number. Be concise and insightful.

Article:
${articleText}` }
    ]);
    
    for await (const chunk of stream) {
      streamed += chunk;
      displayAnalysisResult(streamed, paragraphs);
    }
    responseCache.analysis = streamed;
    console.log('completed runDeeperAnalysis');
  } catch (err) {
    responseCache.analysis = 'Error: ' + err.message;
    displayAnalysisResult(responseCache.analysis, []);
  } finally {
    loader.style.display = 'none';
  }
}

    function displayAnalysisResult(response, paragraphs = []) {
  const result = sidebar.querySelector('#ai-analysis-result');
  
  // Remove "ANALYSIS:" prefix if present
  let analysis = response.replace(/^ANALYSIS:\s*/i, '').trim();
  
  const analysisDiv = document.createElement('div');
  analysisDiv.style.cssText = 'background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 18px 16px; color: #222; font-size: 16px; margin-bottom: 8px; box-shadow:0 2px 8px rgba(0,0,0,0.04); line-height:1.7; font-family: "Segoe UI", Roboto, sans-serif;';
  
  // Replace line breaks
  let html = analysis.replace(/([.?!])\s+/g, '$1<br>');
  
  // Handle ALL paragraph references (both grouped and individual) in one pass
  // This regex matches [1], [2, 3], [1,2,3], etc.
  html = html.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, group) => {
    // Split by comma if it's a grouped reference
    const numbers = group.includes(',') ? group.split(',').map(n => n.trim()) : [group];
    
    // Create clickable spans for each number
    const links = numbers.map(num => {
      const index = parseInt(num);
      if (paragraphs[index]) {
        return `<span class="clickable-ref paragraph-ref" data-paragraph-index="${index}">[${num}]</span>`;
      }
      return `[${num}]`;
    });
    
    // Join with space if multiple numbers, otherwise return single link
    return links.join(' ');
  });
  
  analysisDiv.innerHTML = html;
  
  result.innerHTML = '';
  result.appendChild(analysisDiv);
  
  // Add click handlers for paragraph references
  analysisDiv.querySelectorAll('.paragraph-ref').forEach(el => {
    el.addEventListener('click', () => {
      const paragraphIndex = parseInt(el.getAttribute('data-paragraph-index'));
      if (paragraphs[paragraphIndex]) {
        scrollToAndHighlightElement(paragraphs[paragraphIndex].element);
      }
    });
  });
}

    function setupQuiz() {
      console.log('started setupQuiz');
      const quizContainer = sidebar.querySelector('#ai-quiz-container');
      const quizLoader = sidebar.querySelector('#ai-quiz-loader');
      const quizSubmit = sidebar.querySelector('#ai-quiz-submit');
      const quizRetake = sidebar.querySelector('#ai-quiz-retake');
      const quizResults = sidebar.querySelector('#ai-quiz-results');
      
      let quizQuestions = [];
      let userAnswers = [];
      
      async function generateQuiz() {
        quizLoader.style.display = 'block';
        quizContainer.innerHTML = '';
        quizSubmit.style.display = 'none';
        quizResults.style.display = 'none';
        userAnswers = [];
        
        try {
          if (!window.LanguageModel) throw new Error('LanguageModel API not available');
          const available = await window.LanguageModel.availability();
          if (available === 'unavailable') throw new Error('LanguageModel API unavailable');

          const session = await window.LanguageModel.create({
            initialPrompts: [
              { role: 'system', content: 'You are a quiz generator. Create multiple choice questions to test comprehension.' }
            ]
          });

          let articleText = Array.from(document.querySelectorAll('p'))
            .map(p => p.innerText.trim())
            .filter(text => text.length > 20)
            .join(' ')
            .substring(0, 3000);

          let streamed = '';
          const stream = session.promptStreaming([
            { role: 'user', content: `Create 5 multiple choice questions about this article. Format EXACTLY as follows:\n\nQ1: [question text here]\nA) [first option]\nB) [second option]\nC) [third option]\nD) [fourth option]\nCORRECT: A\n\nQ2: [question text here]\nA) [first option]\nB) [second option]\nC) [third option]\nD) [fourth option]\nCORRECT: B\n\nContinue this pattern for all 5 questions. Use only letters A, B, C, or D for correct answers.\n\nArticle:\n${articleText}` }
          ]);
          
          for await (const chunk of stream) {
            streamed += chunk;
          }
          
          console.log('Quiz AI Response:', streamed);
          
          quizQuestions = parseQuizQuestions(streamed);
          
          console.log('Parsed Questions:', quizQuestions);
          
          if (quizQuestions.length === 0) {
            throw new Error('Failed to generate quiz questions. Please try again.');
          }
          
          renderQuiz();
          console.log('completed setupQuiz');
        } catch (err) {
          quizContainer.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center; background: rgba(239, 68, 68, 0.1); border-radius: 12px;">
            <strong>Error generating quiz:</strong><br>${err.message}
          </div>`;
        } finally {
          quizLoader.style.display = 'none';
        }
      }
      
      function parseQuizQuestions(text) {
        const questions = [];
        
        // Remove any markdown code blocks
        text = text.replace(/```[\s\S]*?```/g, '');
        text = text.replace(/`[^`]+`/g, '');
        
        // Split by question numbers
        const questionBlocks = text.split(/Q\d+:/gi).filter(block => block.trim());
        
        console.log('Question blocks found:', questionBlocks.length);
        
        for (let i = 0; i < questionBlocks.length; i++) {
          const block = questionBlocks[i];
          const lines = block.split('\n').map(l => l.trim()).filter(l => l);
          
          console.log(`Processing block ${i + 1}:`, lines);
          
          if (lines.length < 5) {
            console.log(`Block ${i + 1} skipped - not enough lines`);
            continue;
          }
          
          const question = lines[0].trim();
          const options = [];
          let correct = '';
          
          for (let j = 1; j < lines.length; j++) {
            const line = lines[j].trim();
            
            // Match option lines (A), B), C), D))
            const optionMatch = line.match(/^([A-D])\)\s*(.+)/i);
            if (optionMatch) {
              options.push(optionMatch[2].trim());
              continue;
            }
            
            // Match correct answer line
            const correctMatch = line.match(/CORRECT:\s*([A-D])/i);
            if (correctMatch) {
              correct = correctMatch[1].toUpperCase();
              break;
            }
          }
          
          console.log(`Question ${i + 1}:`, { question, optionsCount: options.length, correct });
          
          if (question && options.length === 4 && correct && /^[A-D]$/.test(correct)) {
            questions.push({ question, options, correct });
          } else {
            console.log(`Question ${i + 1} rejected:`, { 
              hasQuestion: !!question, 
              optionsCount: options.length, 
              hasCorrect: !!correct 
            });
          }
        }
        
        return questions;
      }
      
      function renderQuiz() {
        quizContainer.innerHTML = '';
        userAnswers = new Array(quizQuestions.length).fill(null);
        
        quizQuestions.forEach((q, qIndex) => {
          const questionDiv = document.createElement('div');
          questionDiv.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
            border: 2px solid rgba(102, 126, 234, 0.1);
          `;
          
          const questionTitle = document.createElement('div');
          questionTitle.style.cssText = `
            font-weight: 700;
            font-size: 16px;
            color: #333;
            margin-bottom: 12px;
          `;
          questionTitle.textContent = `${qIndex + 1}. ${q.question}`;
          questionDiv.appendChild(questionTitle);
          
          q.options.forEach((option, oIndex) => {
            const optionLabel = document.createElement('label');
            optionLabel.style.cssText = `
              display: flex;
              align-items: center;
              padding: 12px;
              margin-bottom: 8px;
              background: #f8fafc;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              border: 2px solid transparent;
            `;
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `question-${qIndex}`;
            radio.value = String.fromCharCode(65 + oIndex);
            radio.style.marginRight = '12px';
            radio.onchange = () => {
              userAnswers[qIndex] = radio.value;
              checkAllAnswered();
            };
            
            const optionText = document.createElement('span');
            optionText.textContent = `${String.fromCharCode(65 + oIndex)}) ${option}`;
            optionText.style.fontSize = '14px';
            
            optionLabel.appendChild(radio);
            optionLabel.appendChild(optionText);
            questionDiv.appendChild(optionLabel);
            
            optionLabel.addEventListener('mouseenter', () => {
              optionLabel.style.borderColor = '#667eea';
              optionLabel.style.background = '#e0e7ff';
            });
            
            optionLabel.addEventListener('mouseleave', () => {
              if (!radio.checked) {
                optionLabel.style.borderColor = 'transparent';
                optionLabel.style.background = '#f8fafc';
              }
            });
          });
          
          quizContainer.appendChild(questionDiv);
        });
        
        quizSubmit.style.display = 'block';
      }
      
      function checkAllAnswered() {
        const allAnswered = userAnswers.every(a => a !== null);
        quizSubmit.disabled = !allAnswered;
        quizSubmit.style.opacity = allAnswered ? '1' : '0.5';
      }
      
      function gradeQuiz() {
        let correct = 0;
        
        quizQuestions.forEach((q, qIndex) => {
          const questionDiv = quizContainer.children[qIndex];
          const labels = questionDiv.querySelectorAll('label');
          
          labels.forEach((label, oIndex) => {
            const optionLetter = String.fromCharCode(65 + oIndex);
            const isCorrect = optionLetter === q.correct;
            const isSelected = userAnswers[qIndex] === optionLetter;
            
            if (isCorrect) {
              label.style.borderColor = '#22c55e';
              label.style.background = '#dcfce7';
              if (isSelected) correct++;
            } else if (isSelected) {
              label.style.borderColor = '#ef4444';
              label.style.background = '#fee2e2';
            }
            
            label.querySelector('input').disabled = true;
            label.style.cursor = 'default';
          });
        });
        
        const percentage = Math.round((correct / quizQuestions.length) * 100);
        let emoji = '🎉';
        let message = 'Excellent work!';
        let color = '#22c55e';
        
        if (percentage < 60) {
          emoji = '📚';
          message = 'Keep studying!';
          color = '#ef4444';
        } else if (percentage < 80) {
          emoji = '👍';
          message = 'Good job!';
          color = '#f59e0b';
        }
        
        quizResults.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 12px;">${emoji}</div>
            <div style="font-size: 24px; font-weight: 700; color: ${color}; margin-bottom: 8px;">${percentage}%</div>
            <div style="font-size: 16px; color: #666;">${message}</div>
            <div style="font-size: 14px; color: #999; margin-top: 8px;">You got ${correct} out of ${quizQuestions.length} correct</div>
          </div>
        `;
        
        quizResults.style.display = 'block';
        quizSubmit.style.display = 'none';
        quizRetake.style.display = 'block';
      }
      
      quizSubmit.onclick = gradeQuiz;
      quizRetake.onclick = generateQuiz;
      
      tabQuiz.addEventListener('click', () => {
        if (quizQuestions.length === 0) {
          generateQuiz();
        }
      });
    }

    function setupChat() {
      console.log('started setupChat');
      const chatMessages = sidebar.querySelector('#ai-chat-messages');
      const chatInput = sidebar.querySelector('#ai-chat-input');
      const chatSend = sidebar.querySelector('#ai-chat-send');
      const preQuestionsDiv = sidebar.querySelector('#ai-pre-questions');
      let chatSession = null;

      const questionPool = [
        "What's the main argument?",
        "Are there logical fallacies?",
        "What sources are cited?",
        "What perspective is missing?",
        "How credible is this?",
        "What's the broader context?",
        "Who would disagree?",
        "What questions remain?",
        "Who benefits from this view?"
      ];
      let currentQuestions = [];

      function pickQuestions() {
        const available = questionPool.filter(q => !currentQuestions.includes(q));
        while (currentQuestions.length < 3 && available.length > 0) {
          const idx = Math.floor(Math.random() * available.length);
          currentQuestions.push(available[idx]);
          available.splice(idx, 1);
        }
      }

      function renderPreQuestions() {
        preQuestionsDiv.innerHTML = '';
        currentQuestions.forEach((q, i) => {
          const btn = document.createElement('button');
          btn.textContent = q;
          btn.className = 'ai-button-modern';
          btn.style.cssText = `
            width: 100%;
            margin-bottom: 8px;
            text-align: left;
            font-size: 13px;
            padding: 10px 16px;
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
            border: 1px solid rgba(102, 126, 234, 0.2);
          `;
          btn.onclick = async () => {
            await sendChat(q);
            currentQuestions.splice(i, 1);
            pickQuestions();
            renderPreQuestions();
          };
          preQuestionsDiv.appendChild(btn);
        });
      }

      async function sendChat(message) {
        if (!message.trim()) return;
        addChatMessage(message, true);
        chatInput.value = '';

        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-chat-message ai-chat-ai';
        typingDiv.innerHTML = '<span>Thinking...</span>';
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
          if (!window.LanguageModel) throw new Error('LanguageModel API not available');
          const available = await window.LanguageModel.availability();
          if (available === 'unavailable') throw new Error('LanguageModel API unavailable');

          if (!chatSession) {
            let articleText = Array.from(document.querySelectorAll('p'))
              .map(p => p.innerText.trim())
              .filter(text => text.length > 20)
              .join(' ')
              .substring(0, 2000);

            chatSession = await window.LanguageModel.create({
              initialPrompts: [
                { role: 'system', content: `You are a helpful analyst. Answer questions about this article clearly and concisely.\n\nArticle:\n${articleText}` }
              ]
            });
          }

          let streamed = '';
          const stream = chatSession.promptStreaming([{ role: 'user', content: message }]);
          for await (const chunk of stream) {
            streamed += chunk;
            typingDiv.innerHTML = formatModelOutput(streamed, true);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          typingDiv.remove();
          addChatMessage(streamed, false);
        } catch (err) {
          typingDiv.remove();
          addChatMessage('Error: ' + err.message, false);
        }
      }

      function addChatMessage(text, isUser) {
        const msgDiv = document.createElement('div');
        msgDiv.className = isUser ? 'ai-chat-message ai-chat-user' : 'ai-chat-message ai-chat-ai';
        
        if (isUser) {
          msgDiv.textContent = text;
        } else {
          msgDiv.innerHTML = formatModelOutput(text, true);
        }
        
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      chatSend.onclick = () => sendChat(chatInput.value.trim());
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChat(chatInput.value.trim());
        }
      });

      pickQuestions();
      renderPreQuestions();
      console.log('completed renderEmotionPulse');
    }

    function formatModelOutput(text, isChat = false) {
      text = text.replace(/```[\s\S]*?```/g, '');
      text = text.replace(/`[^`]+`/g, '');
      
      let html = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^\s*[-*+]\s(.+)$/gm, '<li>$1</li>')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');
      
      if (/<li>/.test(html)) {
        html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin: 8px 0; padding-left: 20px;">$1</ul>');
      }
      
      html = html.replace(/^(<br>)+|(<br>)+$/g, '');
      
      if (isChat) {
        return html;
      }
      
      return `
        <div style="
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(102, 126, 234, 0.2);
          border-radius: 12px;
          padding: 16px;
          margin: 12px 0;
          color: #000;
          line-height: 1.6;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        ">${html}</div>
      `;
    }
  }
})();