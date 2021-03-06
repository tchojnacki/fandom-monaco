/* global browser */
(() => {
  // Inject a page script
  const s = document.createElement('script')
  s.src = browser.extension.getURL('src/page.js')
  s.onload = function () {
    this.remove()
  }
  document.head.appendChild(s)

  browser.runtime.onMessage.addListener((request) => {
    if (request.type) {
      switch (request.type) {
        case 'MAKE_EDIT:B->C': // Message from background.js
          window.postMessage({
            type: 'MAKE_EDIT:C->P', // Message to page.js
            data: request.data
          }, window.location.origin)
          break
        case 'DISPLAY_BANNER:B->C': // Message from background.js
          window.postMessage({
            type: 'DISPLAY_BANNER:C->P', // Message to page.js
            data: request.data
          }, window.location.origin)
          break
      }
    }
  })

  window.addEventListener('message', (request) => {
    if (request.source === window && request.data.type && request.data.type === 'OPEN_EDITOR:P->C') { // Message from page.js
      browser.runtime.sendMessage({
        type: 'OPEN_EDITOR:C->B',
        data: request.data.data
      })
    }
  })
})()
