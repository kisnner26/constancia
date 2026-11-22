// reproductor de escritorio: abre index.html?escena=<nombre> (por defecto constancia) en una ventana de electron.
// f11 o ctrl/cmd+f: pantalla completa. esc: sale de pantalla completa y, ya en ventana, cierra.
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

const arg = process.argv.find((a) => a.startsWith('--escena='));
const escena = arg ? arg.slice(9) : 'constancia';
const valida = /^[a-z0-9_-]+$/.test(escena) ? escena : 'constancia';

function crear() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 480, minHeight: 320,
    backgroundColor: '#0a0705', title: valida, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'document-user-activation-required' },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'index.html'), { query: { escena: valida } });
  win.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F11' || (mod && input.key.toLowerCase() === 'f')) { win.setFullScreen(!win.isFullScreen()); ev.preventDefault(); }
    else if (input.key === 'Escape') { if (win.isFullScreen()) win.setFullScreen(false); else win.close(); ev.preventDefault(); }
  });
}

app.whenReady().then(crear);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crear(); });
