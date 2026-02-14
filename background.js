// Service worker: handles Claude API calls for email summarization.
// This is the ONLY file that makes network requests.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;
const TRUNCATE_AT = 100000;
const REJECT_AT = 120000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'summarize') return false;
  handleSummarize(request.text).then(sendResponse);
  return true; // Keep message channel open for async response
});

async function handleSummarize(text) {
  if (!text || text.trim().length === 0) {
    return { error: 'No email content provided.' };
  }

  if (text.length > REJECT_AT) {
    return {
      error: `Selection too long (${text.length.toLocaleString()} characters). Maximum is 120,000 characters.`
    };
  }

  const truncated = text.length > TRUNCATE_AT;
  const emailText = truncated ? text.substring(0, TRUNCATE_AT) : text;

  // Retrieve API key from local storage
  const result = await chrome.storage.sync.get(['apiKey']);
  if (!result.apiKey) {
    return { error: 'No API key configured. Click the extension icon to set your key.' };
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': result.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: `Analyze this email and respond with exactly four sections using these headers:\n\n**Summary**\nA concise overview of the email in 3-5 bullet points.\n\n**Action Points**\nList all tasks, to-dos, or actions required. If none, write \"None identified.\"\n\n**Deadlines**\nList any deadlines mentioned or tightly inferred from the email, with their dates. If none, write \"None identified.\"\n\n**Events**\nList all events mentioned. Show dated events first (with dates), then undated events. If none, write \"None identified.\"\n\nEmail:\n\n${emailText}`
        }]
      })
    });

    if (!response.ok) {
      return handleApiError(response.status);
    }

    const data = await response.json();

    if (!data.content || !data.content.length || !data.content[0].text) {
      return { error: 'Received an empty response from Claude. Please try again.' };
    }

    let summary = data.content[0].text;

    // Note if response was cut off by token limit
    if (data.stop_reason === 'max_tokens') {
      summary += '\n\n(Summary was truncated due to length.)';
    }

    return { summary, truncated };
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      return { error: 'Network error. Check your internet connection.' };
    }
    return { error: `Request failed: ${err.message}` };
  }
}

function handleApiError(status) {
  const messages = {
    401: 'Invalid API key. Check your key in the extension settings.',
    403: 'Access denied. Your API key may lack permissions for this model.',
    429: 'Rate limit exceeded. Wait a moment and try again.',
    529: 'Claude is temporarily overloaded. Try again in a few seconds.'
  };
  return { error: messages[status] || `API error (${status}). Please try again.` };
}
