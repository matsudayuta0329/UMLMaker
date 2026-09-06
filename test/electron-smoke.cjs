const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const port = 9327;
const child = spawn(electron, [root, `--remote-debugging-port=${port}`, '--no-sandbox'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function target() {
  for (let attempt=0; attempt<40; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const page = pages.find(x => x.type === 'page' && x.url.includes('index.html'));
      if (page) return page;
    } catch {}
    await delay(250);
  }
  throw new Error('Renderer did not expose a debugging target');
}
function connect(url) {
  const socket = new WebSocket(url); let nextId=1; const pending=new Map();
  socket.onmessage = event => { const msg=JSON.parse(event.data); if(msg.id&&pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);} };
  const ready = new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  return { ready, close:()=>socket.close(), evaluate:async expression=>{await ready;const id=nextId++;socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));const msg=await new Promise(resolve=>pending.set(id,resolve));if(msg.result?.exceptionDetails)throw new Error(JSON.stringify(msg.result.exceptionDetails));return msg.result.result.value;} };
}

(async () => {
  let client;
  try {
    const page = await target(); client=connect(page.webSocketDebuggerUrl);
    for (let attempt=0; attempt<40; attempt++) {
      if (await client.evaluate(`document.querySelectorAll('.type-card').length === 2`)) break;
      await delay(100);
    }
    const initial = await client.evaluate(`({dialog:document.querySelector('#new-dialog').open,types:document.querySelectorAll('.type-card').length})`);
    if (!initial.dialog || initial.types !== 2) throw new Error(`Unexpected new dialog: ${JSON.stringify(initial)}`);
    await client.evaluate(`document.querySelector('#create-document').click()`);
    await client.evaluate(`document.querySelector('#add-element').click();document.querySelector('#add-element').click()`);
    const classState = await client.evaluate(`({nodes:document.querySelectorAll('.class-node').length,badge:document.querySelector('#diagram-badge').textContent})`);
    if (classState.nodes !== 2 || classState.badge !== 'クラス図') throw new Error(`Class UI failed: ${JSON.stringify(classState)}`);
    await client.evaluate(`document.querySelector('#new-button').click()`); await delay(100);
    await client.evaluate(`document.querySelector('[data-type="sequence"]').click();document.querySelector('#create-document').click();document.querySelector('#add-element').click()`);
    const sequenceState = await client.evaluate(`({nodes:document.querySelectorAll('.participant').length,badge:document.querySelector('#diagram-badge').textContent})`);
    if (sequenceState.nodes !== 1 || sequenceState.badge !== 'シーケンス図') throw new Error(`Sequence UI failed: ${JSON.stringify(sequenceState)}`);
    console.log('Electron smoke test passed:', { initial, classState, sequenceState });
  } finally {
    client?.close(); child.kill();
  }
})().catch(error => { console.error(error); child.kill(); process.exitCode=1; });
