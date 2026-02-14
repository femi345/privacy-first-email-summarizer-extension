// Content script: always-visible summarize button + email body extraction + summary modal.
// All DOM elements live inside a single #email-summarizer-ext container.
// All user-visible text uses textContent (never innerHTML) to prevent XSS.

(function () {
  'use strict';

  let isProcessing = false;
  let copyResetTimer = null;

  // === ROOT CONTAINER ===
  const container = document.createElement('div');
  container.id = 'email-summarizer-ext';
  document.body.appendChild(container);

  // === ALWAYS-VISIBLE TOP BUTTON ===
  const topBtn = document.createElement('button');
  topBtn.className = 'es-topbar-btn';
  topBtn.textContent = '\u2728 Summarize Email';
  container.appendChild(topBtn);

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
    // Gmail email body selectors, in order of specificity
    const selectors = [
      '.a3s.aiL',                   // Standard email message body
      '.gs',                        // Message container fallback
      '[role="listitem"] .a3s',     // Conversation thread items
      '[role="main"]'               // Last resort: entire main area
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Collect text from all matching elements (handles email threads)
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

  topBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerSummarize();
  });

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
      // Add line break after each line except the last
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
      // Fallback for restricted contexts
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
