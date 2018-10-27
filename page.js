(() => {
  if (window.$('#FandomMonaco').length !== 0) {
    return
  }
  const config = window.mw.config.get(['wgPageName', 'wgCurRevisionId', 'wgScriptPath', 'wgArticlePath', 'wgUserName', 'wgUserLanguage', 'wgNamespaceNumber', 'wgUserGroups', 'wgCityId', 'wgWikiaPageActions'])
  const hasGlobalEI = ['content-volunteer', 'helper', 'util', 'staff', 'vanguard', 'vstf'].some(group => config.wgUserGroups.includes(group))
  const hasLocalEI = config.wgUserGroups.includes('sysop')
  const isDevWiki = config.wgCityId === '7931' // Dev Wiki shouldn't give a warning
  const canEditOtherUsers = config.wgUserGroups.includes('staff')
  const canEditCurrent = config.wgWikiaPageActions.find(a => a.id === 'page:Edit') !== undefined
  const isJS = config.wgPageName.endsWith('.js') || config.wgPageName.endsWith('.javascript')
  const isCSS = config.wgPageName.endsWith('.css')
  const isLESS = config.wgPageName.endsWith('.less')
  const isJSON = config.wgPageName.endsWith('.json')
  const isInfobox = config.wgNamespaceNumber === 10 && window.$('.template-classification-type-text[data-type="infobox"]').length === 1
  let lang = null
  let mode = 'inspect' // or 'edit' or 'editwarning'
  // Currently supported:
  // local and global CSS and JS user pages
  // CSS and JS MW pages
  // LESS and JSON pages
  if (isJS) {
    lang = 'javascript'
  } else if (isCSS) {
    lang = 'css'
  } else if (isLESS) {
    lang = 'less'
  } else if (isJSON) {
    lang = 'json'
  } else if (isInfobox) {
    lang = 'xml'
  }

  if (config.wgNamespaceNumber === 2) { // User pages
    if (canEditCurrent) { // User page owned (or is Staff)
      if (canEditOtherUsers && !config.wgPageName.match(`:${config.wgUserName}\\/.*\\.(js|javascript|css|less|json)$`)) { // Is Staff on another user page
        mode = 'editwarning'
      } else { // User page owned
        mode = 'edit'
      }
    }
  } else if (config.wgNamespaceNumber === 8) { // MW pages
    if (canEditCurrent) { // Has local or global editinterface
      if (hasGlobalEI && !hasLocalEI && !isDevWiki) { // Is editing using global editinterface
        mode = 'editwarning'
      } else {
        mode = 'edit'
      }
    }
  } else if (config.wgNamespaceNumber === 10) {
    if (canEditCurrent) {
      mode = 'edit'
    }
  }

  if (lang !== null) {
    const editText = window.$('.page-header__contribution-buttons #ca-edit span').text()
    const targetUrl = window.location.href.split(/\?|#/)[0]
    window.$('.page-header__contribution-buttons #ca-edit span').html(`${editText} (M)`)
    window.$('.page-header__contribution-buttons #ca-edit').attr('href', '#').attr('id', 'FandomMonaco').click((e) => {
      e.preventDefault()
      window.postMessage({
        type: 'OPEN_EDITOR:P->C',
        data: {
          title: config.wgPageName,
          revid: config.wgCurRevisionId,
          api: window.location.origin + config.wgScriptPath,
          url: targetUrl,
          lang: lang,
          mode: mode,
          i18n: config.wgUserLanguage
        }
      }, window.location.origin)
      document.activeElement.blur()
    })
    window.$('.page-header__contribution-buttons .wds-list').prepend(
      window.$('<li>').append(
        window.$('<a>', {
          'text': editText,
          'href': `${targetUrl}?action=edit`,
          'id': 'ca-edit'
        })
      )
    )
    window.mw.hook('fandommonaco.add').fire()
  }

  window.addEventListener('message', (request) => {
    if (request.source === window && request.data.type) {
      switch (request.data.type) {
        case 'MAKE_EDIT:C->P':
          new window.mw.Api().post({
            action: 'edit',
            title: request.data.data.title,
            text: request.data.data.text,
            summary: request.data.data.summary,
            token: window.mw.user.tokens.get('editToken')
          }).done((data) => {
            if (data && data.edit && data.edit.result && data.edit.result === 'Success') {
              window.location.reload()
            } else {
              new window.BannerNotification(request.data.data.requesterror || '[REQUEST_ERROR]', 'error').show()
            }
          }).fail(() => {
            new window.BannerNotification(request.data.data.networkerror || '[NETWORK_ERROR]', 'error').show()
          })
          break
        case 'DISPLAY_BANNER:C->P':
          new window.BannerNotification(request.data.data.text || '', request.data.data.type || undefined, undefined, request.data.data.timeout || undefined).show()
          break
      }
    }
  }, false)
})()
