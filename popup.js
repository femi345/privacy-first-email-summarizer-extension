document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-btn');
  const status = document.getElementById('status');

  // Load existing key on popup open
  chrome.storage.sync.get(['apiKey'], (result) => {
    if (result.apiKey) {
      input.value = result.apiKey;
      status.textContent = 'API key configured.';
      status.className = 'success';
    }
  });

  saveBtn.addEventListener('click', () => {
    // Strip non-printable/non-ASCII characters and trim whitespace
    const key = input.value.replace(/[^\x20-\x7E]/g, '').trim();

    if (!key) {
      status.textContent = 'Please enter an API key.';
      status.className = 'error';
      return;
    }

    if (!key.startsWith('sk-ant-')) {
      status.textContent = 'Invalid key format. Keys start with sk-ant-';
      status.className = 'error';
      return;
    }

    chrome.storage.sync.set({ apiKey: key }, () => {
      input.value = key;
      status.textContent = 'API key saved.';
      status.className = 'success';
    });
  });

  // Allow saving with Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });
});
