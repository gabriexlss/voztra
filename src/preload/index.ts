import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { DesktopAPI, BackendEvent } from '../shared/types'

/** Lista explícita de operações: não expõe IPC genérico ao React. */

const api: DesktopAPI = {
  cudaAction: (action) => ipcRenderer.invoke('cuda-action', action),
  saveEngine: (profile, key, remember) => ipcRenderer.invoke('engine-save', profile, key, remember),
  deleteEngine: (id) => ipcRenderer.invoke('engine-delete', id),
  switchEngine: (id) => ipcRenderer.invoke('engine-switch', id),
  engineModels: (id) => ipcRenderer.invoke('engine-models', id),
  testEngine: (id) => ipcRenderer.invoke('engine-test', id),
  startMicrophone: () => ipcRenderer.invoke('microphone-start'),
  microphoneFrame: (id, audio) => ipcRenderer.invoke('microphone-frame', id, audio),
  finishMicrophone: (id) => ipcRenderer.invoke('microphone-end', id),
  updatesSnapshot: () => ipcRenderer.invoke('updates-snapshot'),
  updateCommand: (command) => ipcRenderer.invoke('updates-command', command),
  setAutomaticUpdates: (value) => ipcRenderer.invoke('updates-automatic', value),
  onUpdate: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: import('../shared/updates').UpdateState
    ): void => callback(data)
    ipcRenderer.on('updates:event', listener)
    return () => {
      ipcRenderer.removeListener('updates:event', listener)
    }
  },
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
