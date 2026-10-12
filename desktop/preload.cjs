// t193/t195: the desktop bridge. contextBridge keeps the renderer sandboxed
// (no direct ipcRenderer) while main hands it room codes and capture sources.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hbBridge', {
  onJoin: (fn) => ipcRenderer.on('hb-join', (_e, code) => { try { fn(code); } catch {} }),
  desktopSources: () => ipcRenderer.invoke('hb-desktop-sources')   // t195: screen-share rooms
});
