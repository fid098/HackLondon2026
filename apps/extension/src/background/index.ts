/**
 * Background Service Worker (MV3).
 *
 * Acts as the message broker between:
 *   popup ↔ content scripts ↔ API (backend proxy)
 *
 * Phase 0: Scaffold. Registers the extension and logs messages.
 *
 * Phase 4 will implement:
 *   1. Context menu registration ("Analyze selection")
 *   2. Message routing: content script → API → content script
 *   3. Badge updates (icon badge with flagged count)
 *   4. Storage management (user settings, analysis cache)
 *   5. Rate limiting to prevent API spam
 *
 * Security:
 *   - API key is NEVER stored here or in any extension file
 *   - Authentication uses short-lived tokens issued by the backend
 *   - All API calls validate origin + CORS headers
 */

// Register on install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[TruthGuard BG] Extension installed/updated:', details.reason)

  // Phase 4: Register right-click context menu
  // chrome.contextMenus.create({
  //   id: 'tg-analyze-selection',
  //   title: 'Analyze with TruthGuard',
  //   contexts: ['selection'],
  // })
})

// Phase 4: Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    console.log('[TruthGuard BG] Message received:', message.type)

    // Example routing (Phase 4 implements this fully):
    // if (message.type === 'ANALYZE_TEXT') {
    //   analyzeViaAPI(message.payload as string)
    //     .then(result => sendResponse({ ok: true, data: result }))
    //     .catch(err => sendResponse({ ok: false, error: err.message }))
    //   return true // Keep channel open for async response
    // }

    sendResponse({ ok: true, phase: 0, message: 'Scaffold — not yet implemented' })
    return false
  },
)

export {}  // Makes this a module
