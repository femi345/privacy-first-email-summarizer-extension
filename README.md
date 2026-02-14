# Email Summarizer

A privacy-first Chrome extension that analyzes emails in Gmail and Outlook using the Claude API. One click extracts the full email, then returns a structured breakdown: summary, action points, deadlines, and events.

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the project folder
5. Click the extension icon in your toolbar and enter your Claude API key

## Getting an API Key

1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create a new API key (starts with `sk-ant-`)
3. Paste it into the extension settings popup and click Save

## Usage

1. Open Gmail or Outlook in your browser
2. Open an email you want to analyze
3. Click the **Summarize Email** button in the top-right corner of the page
4. The extension extracts the full email body and sends it to Claude for analysis
5. A modal displays four sections: Summary, Action Points, Deadlines, and Events
6. Optionally click **Copy Summary** to copy the full analysis to your clipboard
7. Close the modal. No data is retained.

## Output Format

The extension produces four clearly labeled sections:

- **Summary** -- a concise overview of the email in 3-5 bullet points
- **Action Points** -- tasks, to-dos, or actions required
- **Deadlines** -- any deadlines mentioned or tightly inferred, with dates
- **Events** -- dated events first, then undated events

If a section has no relevant content, it will read "None identified."

## Privacy

- **No data retention**: Analysis results are displayed and then discarded. Nothing is saved to disk, local storage, or any database.
- **No analytics**: No tracking, telemetry, crash reporting, or usage metrics of any kind.
- **No external calls**: The only network request goes to `api.anthropic.com` to generate the analysis. No other domains are contacted.
- **Local key storage**: Your API key is stored in Chrome's sync storage on your device. It is never sent anywhere except the Anthropic API.
- **Minimal permissions**: Only `activeTab` (access to the current tab when you click) and `storage` (to persist your API key locally).
- **No external dependencies**: The extension is built entirely with vanilla JavaScript. No npm packages, no CDN imports, no third-party libraries.

## Supported Sites

- Gmail (`mail.google.com`)
- Outlook (`outlook.live.com`, `outlook.office.com`)

## Limitations

- Emails rendered inside cross-origin iframes (some HTML emails in Gmail) cannot be read by the extension. The extension works with emails rendered in the main document.
- Maximum email length: 120,000 characters. Emails between 100,000 and 120,000 characters are automatically truncated to 100,000 before analysis.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No API key configured" | Click the extension icon in the toolbar and enter your key |
| "Invalid API key" | Verify your key at [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| "Rate limit exceeded" | Wait a moment and try again |
| "Could not find email content" | Make sure you have an email open, not just the inbox list |
| Extension not loading | Refresh the Gmail/Outlook tab, or reload the extension at `chrome://extensions` |

## File Structure

```
manifest.json     -- Extension configuration (Manifest V3)
background.js     -- Service worker handling Claude API calls
content.js        -- Email extraction, UI button, and summary modal
popup.html        -- Settings page for API key entry
popup.js          -- API key validation and storage
styles.css        -- Modal and button styling with dark mode support
icons/            -- Extension icons (16x16, 48x48, 128x128)
```
