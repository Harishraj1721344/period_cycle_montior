/* Windows desktop app: shows the same web screens (copied into ./www) in its own window.
 * Data still goes to YOUR Google Sheet through the Web app URL in config.js, after sign-in.
 * Closing the window keeps the app in the system tray, so dose reminders still pop up. */
const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');

app.setAppUserModelId('com.medicinemonitor.app');     // needed for Windows notifications

if (!app.requestSingleInstanceLock()) app.quit();     // only one copy at a time

let win = null, tray = null, quitting = false;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 820, minWidth: 380, minHeight: 600,
    title: 'Medicine Monitor',
    icon: path.join(__dirname, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'www', 'index.html'));

  // web links open in the normal browser; opened report files (blob:) open in a small viewer window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) { event.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  win.on('close', event => {                           // X button hides to tray instead of quitting
    if (!quitting) { event.preventDefault(); win.hide(); }
  });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'icons', 'icon-192.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Medicine Monitor');
  const build = () => Menu.buildFromTemplate([
    { label: 'Open Medicine Monitor', click: showWindow },
    {
      label: 'Start with Windows', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(build());
  tray.on('click', showWindow);
}

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { /* stay in the tray */ });
