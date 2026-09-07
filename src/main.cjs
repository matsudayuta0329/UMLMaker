const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let mainWindow;
let currentPath = null;
let dirty = false;
const serializeRequests = new Map();

async function askToDiscard() {
  if (!dirty) return true;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['キャンセル', '破棄'],
    defaultId: 0,
    cancelId: 0,
    title: '未保存の変更',
    message: '保存されていない変更があります。破棄しますか？'
  });
  return response === 1;
}

async function openDocument() {
  if (!(await askToDiscard())) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'UML JSONを開く',
    filters: [{ name: 'UML Maker JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled) return;
  try {
    const text = await fs.readFile(result.filePaths[0], 'utf8');
    const document = JSON.parse(text);
    mainWindow.webContents.send('document:opened', { document, filePath: result.filePaths[0] });
    currentPath = result.filePaths[0];
    dirty = false;
    updateTitle();
  } catch (error) {
    dialog.showErrorBox('ファイルを開けません', error.message);
  }
}

async function saveDocument(saveAs = false) {
  let target = saveAs ? null : currentPath;
  if (!target) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'UML Makerドキュメントを保存',
      defaultPath: 'diagram.umlmaker.json',
      filters: [{ name: 'UML MakerドキュメントJSON', extensions: ['json'] }]
    });
    if (result.canceled) return false;
    target = result.filePath;
  }
  const requestId = `${Date.now()}-${Math.random()}`;
  const document = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { serializeRequests.delete(requestId); reject(new Error('文書の読み取りがタイムアウトしました。')); }, 5000);
    serializeRequests.set(requestId, value => { clearTimeout(timer); resolve(value); });
    mainWindow.webContents.send('document:serialize-request', requestId);
  });
  await fs.writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  currentPath = target;
  dirty = false;
  mainWindow.webContents.send('document:saved', { filePath: target });
  updateTitle();
  return true;
}

function updateTitle() {
  const name = currentPath ? path.basename(currentPath) : '無題';
  mainWindow?.setTitle(`${dirty ? '● ' : ''}${name} — UML Maker`);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'ファイル',
      submenu: [
        { label: '新規作成…', accelerator: 'CmdOrCtrl+N', click: async () => {
          if (await askToDiscard()) {
            currentPath = null; dirty = false; updateTitle();
            mainWindow.webContents.send('document:new-requested');
          }
        } },
        { label: '開く / インポート…', accelerator: 'CmdOrCtrl+O', click: openDocument },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => saveDocument(false) },
        { label: '名前を付けて保存…', accelerator: 'CmdOrCtrl+Shift+S', click: () => saveDocument(true) },
        { label: 'エクスポート', submenu: [
          { label: 'ドキュメントJSONを保存…', click: () => saveDocument(true) },
          { label: 'AI指示用JSONを表示…', click: () => mainWindow.webContents.send('document:ai-export-requested') }
        ] },
        { type: 'separator' },
        { role: 'quit', label: '終了' }
      ]
    },
    { label: '編集', submenu: [
      { role: 'undo', label: '元に戻す' }, { role: 'redo', label: 'やり直す' },
      { type: 'separator' }, { role: 'cut', label: '切り取り' },
      { role: 'copy', label: 'コピー' }, { role: 'paste', label: '貼り付け' }
    ] },
    { label: '表示', submenu: [{ role: 'reload', label: '再読み込み' }, { role: 'toggleDevTools', label: '開発者ツール' }, { role: 'togglefullscreen', label: '全画面' }] },
    { label: 'ヘルプ', submenu: [{ label: 'UML Makerについて', click: () => dialog.showMessageBox(mainWindow, { title: 'UML Maker', message: 'UML Maker 0.4.0', detail: 'AIに渡しやすいJSON形式のUML設計ツール' }) }] }
  ]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 640,
    backgroundColor: '#0d1117',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  Menu.setApplicationMenu(buildMenu());
  updateTitle();
  mainWindow.on('close', async (event) => {
    if (!dirty) return;
    event.preventDefault();
    if (await askToDiscard()) { dirty = false; mainWindow.close(); }
  });
}

ipcMain.on('document:dirty', (_event, value) => { dirty = Boolean(value); updateTitle(); });
ipcMain.on('document:serialize-response', (_event, requestId, document) => {
  const resolve = serializeRequests.get(requestId);
  if (resolve) { serializeRequests.delete(requestId); resolve(document); }
});
ipcMain.handle('document:save', (_event, saveAs) => saveDocument(Boolean(saveAs)));
ipcMain.handle('document:open', openDocument);
ipcMain.handle('document:confirm-replace', askToDiscard);
ipcMain.handle('clipboard:write-text', (_event, value) => clipboard.writeText(String(value)));
ipcMain.on('document:new-created', () => { currentPath = null; dirty = false; updateTitle(); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
