// Content script: email body extraction, inline summarize button, and summary modal.
// All DOM elements live inside a single #email-summarizer-ext container.
// All user-visible text uses textContent (never innerHTML) to prevent XSS.

(function () {
  'use strict';

  let isProcessing = false;
  let copyResetTimer = null;
  let currentBtn = null; // Track the currently injected button

  // === ROOT CONTAINER (for modal only) ===
  const container = document.createElement('div');
  container.id = 'email-summarizer-ext';
  document.body.appendChild(container);

  // === MODAL ===
  const overlay = document.createElement('div');
  overlay.className = 'es-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'es-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'es-modal-header';
  const title = document.createElement('h2');
  title.textContent = 'Email Analysis';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'es-close-btn';
  closeBtn.textContent = '\u00D7';
  closeBtn.setAttribute('aria-label', 'Close');
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'es-modal-body';

  // Loading spinner
  const loading = document.createElement('div');
  loading.className = 'es-loading';
  const spinner = document.createElement('div');
  spinner.className = 'es-spinner';
  loading.appendChild(spinner);

  // Truncation warning
  const truncationWarning = document.createElement('div');
  truncationWarning.className = 'es-truncation-warning';
  truncationWarning.textContent = 'Note: The email was truncated to the first 100,000 characters.';

  // Footer
  const footer = document.createElement('div');
  footer.className = 'es-modal-footer';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'es-copy-btn';
  copyBtn.textContent = 'Copy Summary';
  footer.appendChild(copyBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(truncationWarning);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  container.appendChild(overlay);

  // === BUTTON CREATION ===
  function createSummarizeButton(isFixed) {
    const btn = document.createElement('button');
    btn.className = isFixed ? 'es-topbar-btn es-topbar-btn-fixed' : 'es-topbar-btn';
    btn.textContent = 'Summarize';
    btn.id = 'es-summarize-btn';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSummarize();
    });
    return btn;
  }

  // === INLINE BUTTON PLACEMENT (Gmail) ===
  // Injects the button into Gmail's email header area, beside addon buttons
  // like Asana's "Create task". Falls back to fixed position if selectors fail.
  function placeButton() {
    const host = window.location.hostname;

    if (host.includes('mail.google.com')) {
      placeGmailButton();
    } else if (host.includes('outlook.live.com') || host.includes('outlook.office.com')) {
      placeFixedButton();
    }
  }

  function placeGmailButton() {
    // Remove existing button if it's orphaned (Gmail destroyed its parent)
    if (currentBtn && !document.contains(currentBtn)) {
      currentBtn = null;
    }
    // Already placed and still in DOM
    if (currentBtn && document.contains(currentBtn)) return;

    // Gmail email header selectors, in order of preference.
    // We want the row area near sender/recipient info where addon buttons appear.
    const selectors = [
      '.gE.iv.gt',         // Email header container
      '.gH',               // Message header wrapper
      '.h7',               // Compact header area
      '.aHU',              // Header actions row
      '.gE'                // Broad fallback
    ];

    for (const selector of selectors) {
      const target = document.querySelector(selector);
      if (target) {
        currentBtn = createSummarizeButton(false);
        target.appendChild(currentBtn);
        return;
      }
    }

    // No Gmail header found — fall back to fixed position
    placeFixedButton();
  }

  function placeFixedButton() {
    if (currentBtn && document.contains(currentBtn)) return;
    currentBtn = createSummarizeButton(true);
    container.appendChild(currentBtn);
  }

  // === MUTATION OBSERVER ===
  // Gmail is a SPA — it destroys and rebuilds DOM when navigating between emails.
  // Watch for changes and re-inject the button when a new email view appears.
  function startObserver() {
    const mainEl = document.querySelector('[role="main"]') || document.body;

    const observer = new MutationObserver(() => {
      // If button was removed from DOM (Gmail navigation), re-place it
      if (!currentBtn || !document.contains(currentBtn)) {
        currentBtn = null;
        placeButton();
      }
    });

    observer.observe(mainEl, { childList: true, subtree: true });
  }

  // Initial placement with delay (Gmail may still be rendering)
  setTimeout(placeButton, 500);
  setTimeout(placeButton, 1500); // Retry in case Gmail was slow
  startObserver();

  // === EMAIL BODY EXTRACTION ===
  // Extracts visible email text from Gmail or Outlook without requiring selection.
  function getEmailContent() {
    const host = window.location.hostname;

    if (host.includes('mail.google.com')) {
      return getGmailContent();
    } else if (host.includes('outlook.live.com') || host.includes('outlook.office.com')) {
      return getOutlookContent();
    }

    // Generic fallback
    const main = document.querySelector('[role="main"]');
    return main ? main.innerText.trim() : null;
  }

  function getGmailContent() {
    const selectors = [
      '.a3s.aiL',
      '.gs',
      '[role="listitem"] .a3s',
      '[role="main"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const texts = Array.from(elements)
          .map(el => el.innerText.trim())
          .filter(t => t.length > 0);
        if (texts.length > 0) {
          return texts.join('\n\n---\n\n');
        }
      }
    }
    return null;
  }

  function getOutlookContent() {
    const selectors = [
      'div[aria-label="Message body"]',
      '[role="main"] .ReadMsgBody',
      '[role="main"] .RichTextB',
      '[role="main"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.innerText.trim();
        if (text.length > 0) return text;
      }
    }
    return null;
  }

  // === SUMMARIZE ===
  async function triggerSummarize() {
    if (isProcessing) return;

    const emailText = getEmailContent();
    if (!emailText) {
      showModal();
      setLoading(false);
      showError('Could not find email content. Make sure you have an email open.');
      return;
    }

    isProcessing = true;
    showModal();
    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'summarize',
        text: emailText
      });

      setLoading(false);

      if (response && response.error) {
        showError(response.error);
      } else if (response && response.summary) {
        showSummary(response.summary, response.truncated);
      } else {
        showError('No response received. Please try again.');
      }
    } catch (err) {
      setLoading(false);
      showError('Failed to communicate with the extension. Try refreshing the page.');
    }

    isProcessing = false;
  }

  // === MODAL CONTROLS ===
  function showModal() {
    overlay.style.display = 'flex';
    void overlay.offsetHeight;
    overlay.classList.add('visible');
  }

  function hideModal() {
    overlay.classList.remove('visible');
    overlay.style.display = 'none';
    body.textContent = '';
    body.classList.remove('es-error');
    truncationWarning.style.display = 'none';
    copyBtn.textContent = 'Copy Summary';
    copyBtn.classList.remove('copied');
    if (copyResetTimer) {
      clearTimeout(copyResetTimer);
      copyResetTimer = null;
    }
  }

  function setLoading(show) {
    if (show) {
      body.textContent = '';
      body.appendChild(loading);
      footer.style.display = 'none';
    } else {
      if (body.contains(loading)) body.removeChild(loading);
      footer.style.display = 'flex';
    }
  }

  // Renders Claude's markdown response into safe DOM elements.
  // Handles **bold** headers and preserves line structure.
  // No innerHTML with untrusted content — all text goes through textContent.
  function renderFormattedText(container, text) {
    container.textContent = '';
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Parse line for **bold** segments
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const lineEl = document.createElement('span');

      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          // Bold text — strip the ** markers and wrap in <strong>
          const strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          strong.style.fontWeight = '700';
          strong.style.display = 'block';
          strong.style.marginTop = '12px';
          strong.style.marginBottom = '4px';
          strong.style.fontSize = '15px';
          lineEl.appendChild(strong);
        } else {
          lineEl.appendChild(document.createTextNode(part));
        }
      }

      container.appendChild(lineEl);
      if (i < lines.length - 1) {
        container.appendChild(document.createTextNode('\n'));
      }
    }
  }

  function showSummary(summary, truncated) {
    renderFormattedText(body, summary);
    body.classList.remove('es-error');
    truncationWarning.style.display = truncated ? 'block' : 'none';
  }

  function showError(message) {
    body.textContent = message;
    body.classList.add('es-error');
    truncationWarning.style.display = 'none';
  }

  // === CLOSE HANDLERS ===
  closeBtn.addEventListener('click', hideModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('visible')) {
      hideModal();
    }
  });

  // === COPY BUTTON ===
  copyBtn.addEventListener('click', async () => {
    const text = body.textContent;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');

    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyBtn.textContent = 'Copy Summary';
      copyBtn.classList.remove('copied');
      copyResetTimer = null;
    }, 2000);
  });
})();
