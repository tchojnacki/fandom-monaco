/* global monaco, browser, JSHINT */

class FMEditor {
  constructor (elements, linter) {
    this.editorVisible = true
    this.elems = elements
    this.linter = linter
    FMEditor.instance = this
  }

  async init () {
    await this.getBackgroundData() // Now this.bgData exists
    await this.getI18n() // Now this.i18nMsg() can be used
    this.setDocumentUp()
    this.previousContent = await this.getPageContent()
    await this.setEditorsUp() // Now this.editor exists (and sometimes this.diffEditor)
    this.hideSpinner()
    this.createHandlers()
    return this
  }

  async getBackgroundData () {
    this.bgData = (await browser.runtime.getBackgroundPage()).data
  }

  async getI18n () {
    const bg = await browser.runtime.getBackgroundPage()
    const i18n = bg.i18nReady ? bg.i18n : await bg.getTranslations()

    if (i18n[this.bgData.i18n]) {
      if (i18n.en) { // Fallback to en
        Object.entries(i18n.en).forEach((m) => {
          if (!i18n[this.bgData.i18n][m[0]]) {
            i18n[this.bgData.i18n][m[0]] = m[1]
          }
        })
      }
      this.i18n = i18n[this.bgData.i18n]
    } else if (i18n.en) {
      this.i18n = i18n.en
    } else {
      this.i18n = {}
    }
  }

  i18nMsg (msg) {
    return this.i18n[msg] ? this.i18n[msg] : `[${msg}]`
  }

  async getPageContent () {
    const response = await window.fetch(`${this.bgData.api}/api.php?action=query&titles=${this.bgData.title}&prop=revisions&rvprop=content&format=json&cb=${Math.floor(new Date().getTime() / 1000)}`, {
      cache: 'no-store' // The CacheBuster might be heavy on the servers but we NEED the most recent version if we want to edit.
    })
    const json = await response.json()
    const content = json.query.pages[Object.keys(json.query.pages)[0]].revisions ? json.query.pages[Object.keys(json.query.pages)[0]].revisions[0]['*'] : ''
    return content
  }

  setDocumentUp () {
    document.title = this.bgData.title
    this.elems.get('pagename').textContent = this.bgData.title

    this.elems.get('diff').textContent = this.i18nMsg('DIFF')
    this.elems.get('publish').textContent = this.i18nMsg('CLOSE')
    this.elems.get('summary').placeholder = this.i18nMsg('SUMMARY')

    this.elems.get('pagename').setAttribute('href', this.bgData.url)
    if (this.bgData.mode !== 'inspect') {
      this.elems.get('diff').style.display = 'block'
      this.elems.get('summary').style.display = 'inline-block'
      this.elems.get('diff-container').style.display = 'block'
    }
  }

  async setEditorsUp () {
    if (this.bgData.lang === 'javascript') {
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        (await (await window.fetch('./lib.d.ts')).text()),
        'lib.d.ts'
      )
    }
    this.editor = monaco.editor.create(this.elems.get('editor-container'), {
      value: this.previousContent,
      language: this.bgData.lang,
      theme: 'vs-dark',
      readOnly: true
    })
    if (this.bgData.lang === 'javascript' && this.bgData.mode !== 'inspect') {
      this.linter.lint()
      this.diffEditor = monaco.editor.createDiffEditor(this.elems.get('diff-container'))
    }
    if (this.bgData.mode !== 'inspect') {
      this.editor.updateOptions({ readOnly: false })
    }
  }

  hideSpinner () {
    this.elems.get('overlay').classList.add('invisible')
    setTimeout(() => {
      this.elems.get('spinner').classList.add('hidden')
      this.elems.get('dialog').classList.remove('hidden')
    }, 500)
  }

  showDialog (title, content, actions) {
    return new Promise((resolve) => {
      this.elems.get('dialog-title').textContent = title
      this.elems.get('dialog-content').textContent = content
      this.elems.get('overlay').classList.remove('invisible')

      this.elems.get('dialog-actions').innerHTML = ''
      actions.forEach((a) => {
        const button = document.createElement('div')
        button.classList.add('dialog-button')
        button.textContent = a.text
        button.addEventListener('click', () => {
          resolve(a.action)
          this.elems.get('overlay').classList.add('invisible')
        })
        this.elems.get('dialog-actions').appendChild(button)
      })
    })
  }

  createHandlers () {
    window.addEventListener('resize', () => {
      this.editor.layout()
      if (this.bgData.mode !== 'inspect') {
        this.diffEditor.layout()
      }
    })

    if (this.bgData.mode !== 'inspect') {
      this.editor.model.onDidChangeContent((event) => {
        if (this.currentContent !== this.previousContent) {
          this.elems.get('publish').textContent = this.previousContent === '' ? this.i18nMsg('PUBLISH') : this.i18nMsg('SAVE')
        } else {
          this.elems.get('publish').textContent = this.i18nMsg('CLOSE')
        }
        if (this.bgData.lang === 'javascript') {
          this.linter.lint()
        }
      })

      this.elems.get('diff').addEventListener('click', async () => {
        if (this.editorVisible) {
          this.editorVisible = false
          this.elems.get('editor-container').style.setProperty('flex', '0')
          this.elems.get('diff-container').style.setProperty('flex', '1')
          this.elems.get('diff').textContent = this.i18nMsg('EDIT')

          const originalModel = monaco.editor.createModel(this.previousContent, `text/${this.bgData.lang}`)
          const modifiedModel = monaco.editor.createModel(this.currentContent, `text/${this.bgData.lang}`)

          this.diffEditor.setModel({
            original: originalModel,
            modified: modifiedModel
          })
        } else {
          this.editorVisible = true
          this.elems.get('editor-container').style.setProperty('flex', '1')
          this.elems.get('diff-container').style.setProperty('flex', '0')
          this.elems.get('diff').textContent = this.i18nMsg('DIFF')
        }
        this.editor.layout()
        this.diffEditor.layout()
      })
    }

    this.elems.get('publish').addEventListener('click', async () => {
      if (this.currentContent !== this.previousContent && this.bgData.mode !== 'inspect') {
        if (this.bgData.mode === 'editwarning') {
          const dialog = await this.showDialog(
            this.i18nMsg('EW_TITLE'),
            this.i18nMsg('EW_DESC'),
            [{
              action: 'CANCEL',
              text: this.i18nMsg('CANCEL')
            }, {
              action: 'PUBLISH',
              text: this.i18nMsg('PUBLISH')
            }]
          )
          if (dialog !== 'PUBLISH') {
            return
          }
        }
        // TODO: Check for edit conflicts
        browser.runtime.sendMessage({
          type: 'MAKE_EDIT:E->B',
          data: {
            text: this.currentContent,
            summary: this.editSummary
          }
        })
      } else {
        browser.runtime.sendMessage({
          type: 'CLOSE_EDITOR:E->B'
        })
      }
    })
  }

  get currentContent () {
    return this.editor.getValue()
  }

  get editSummary () {
    return this.elems.get('summary').value
  }
}

class FMElements {
  constructor (elementMap) {
    this.elements = elementMap
    this.cachedElements = {}
    FMElements.instance = this
  }

  get (elem) {
    if (this.elements[elem]) {
      if (this.cachedElements[elem]) {
        return this.cachedElements[elem]
      } else {
        const e = document.querySelector(this.elements[elem])
        this.cachedElements[elem] = e
        return e
      }
    } else {
      throw new Error(`Element not available in the map: ${elem}`)
    }
  }
}

class FMLinter {
  constructor (config) {
    this.config = config
    FMLinter.instance = this
  }

  lint () {
    JSHINT.jshint(FMEditor.instance.currentContent, this.config)
    monaco.editor.setModelMarkers(FMEditor.instance.editor.getModel(), 'jshint', (JSHINT.jshint.data().errors || []).map((e) => {
      return {
        startLineNumber: e.line,
        startColumn: e.character,
        endLineNumber: e.line,
        endColumn: e.character,
        message: e.reason,
        severity: e.code.startsWith('E') ? monaco.Severity.Error : monaco.Severity.Warning
      }
    }))
  }
}

require(['vs/editor/editor.main'], async () => {
  await new FMEditor(new FMElements({
    'pagename': '#pagename',
    'summary': '#summary',
    'publish': '#publish',
    'diff': '#diff',
    'diff-container': '#diff-container',
    'editor-container': '#editor-container',
    'overlay': '.overlay',
    'spinner': '.spinner',
    'dialog': '.dialog',
    'dialog-title': '.dialog-title',
    'dialog-content': '.dialog-content',
    'dialog-actions': '.dialog-actions'
  }), new FMLinter({
    esversion: 5, // Let's hope ResourceLoader will start to support higher version soon
    curly: true,
    eqeqeq: true,
    freeze: true,
    futurehostile: true,
    latedef: true,
    nocomma: true,
    nonbsp: true,
    shadow: false,
    strict: 'implied',
    unused: true,
    asi: true, // No missing semicolon error - it's completely fine to ommit semicolons in modern JS
    eqnull: true,
    '-W117': true // No undef - Wikia's got a lot of weird global variables
  })).init()
})
