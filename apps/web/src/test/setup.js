import '@testing-library/jest-dom'

// jsdom does not implement ResizeObserver — provide a no-op stub
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom does not implement WebSocket — provide a no-op stub
if (typeof WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {
    constructor() { this.onmessage = null }
    close() {}
    send() {}
  }
}
