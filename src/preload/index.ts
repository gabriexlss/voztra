import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { DesktopAPI, BackendEvent } from '../shared/types'

/** Lista explícita de operações: não expõe IPC genérico ao React. */

const api: DesktopAPI = {
  openReference: (url) => ipcRenderer.invoke('open-reference', url),

  modelAction: (action, model, options) =>
    ipcRenderer.invoke('model-action', action, model, options),

  snapshot: () => ipcRenderer.invoke('snapshot'),

  selectFiles: () => ipcRenderer.invoke('select-files'),

  importPaths: (paths) => ipcRenderer.invoke('import-paths', paths),

  filePath: (file) => webUtils.getPathForFile(file),

  start: (id, options) => ipcRenderer.invoke('start', id, options),

  startRequest: (ids, options) => ipcRenderer.invoke('start-request', ids, options),
  rename: (kind, id, title) => ipcRenderer.invoke('rename', kind, id, title),

  cancel: () => ipcRenderer.invoke('cancel'),

  exportJob: (id, format, segments) => ipcRenderer.invoke('export', id, format, segments),

  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: BackendEvent): void => callback(data)

    ipcRenderer.on('core:event', listener)

    return () => {
      ipcRenderer.removeListener('core:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
