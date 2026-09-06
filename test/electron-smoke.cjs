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
    const classState = await client.evaluate(`({nodes:document.querySelectorAll('.class-node').length,badge:document.querySelector('#diagram-badge').textContent,emptySections:[...document.querySelectorAll('.class-node:first-of-type .class-section')].every(x=>!x.textContent.trim()),emptyPrompt:document.body.textContent.includes('要素を追加して設計を始めましょう'),listOnRight:Boolean(document.querySelector('.right-panel #element-list'))})`);
    if (classState.nodes !== 2 || classState.badge !== 'クラス図' || !classState.emptySections || classState.emptyPrompt || !classState.listOnRight) throw new Error(`Class UI failed: ${JSON.stringify(classState)}`);
    const classFormatting = await client.evaluate(`(()=>{const node=document.querySelector('.class-node');node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:150,clientY:120}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:150,clientY:120}));const fields=document.querySelectorAll('#inspector textarea');fields[0].value='name: string';fields[0].dispatchEvent(new Event('input',{bubbles:true}));fields[1].value='save()';fields[1].dispatchEvent(new Event('input',{bubbles:true}));return [...document.querySelectorAll('.class-node .class-section')].slice(0,2).map(x=>x.textContent.trim())})()`);
    if (classFormatting[0] !== '-name: string' || classFormatting[1] !== '+save()') throw new Error(`Class member formatting failed: ${JSON.stringify(classFormatting)}`);
    const classConnection = await client.evaluate(`(()=>{const port=document.querySelector('.class-node .port[data-side="right"]');const target=document.querySelectorAll('.class-node')[1];const a=port.getBoundingClientRect(),b=target.getBoundingClientRect();port.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:a.left+a.width/2,clientY:a.top+a.height/2}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:(a.right+b.left)/2,clientY:a.top}));const preview=Boolean(document.querySelector('.connection-preview'));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:b.left+b.width/2,clientY:b.top+b.height/2}));const line=document.querySelector('.edge-line');return {preview,edges:document.querySelectorAll('.edge-group').length,labels:document.querySelectorAll('.edge-label').length,plainLine:!line.hasAttribute('marker-start')&&!line.hasAttribute('marker-end')}})()`);
    if (!classConnection.preview || classConnection.edges !== 1 || classConnection.labels !== 0 || !classConnection.plainLine) throw new Error(`Class connection failed: ${JSON.stringify(classConnection)}`);
    const classMarker = await client.evaluate(`(()=>{const type=document.querySelector('#inspector [data-key="type"]');type.value='inheritance';type.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('.edge-line').getAttribute('marker-end')})()`);
    if (classMarker !== 'url(#triangle)') throw new Error(`Class marker failed: ${JSON.stringify(classMarker)}`);
    const classAiExport = await client.evaluate(`(()=>{document.querySelector('#ai-export-button').click();const text=document.querySelector('#ai-export-text').value;return {open:document.querySelector('#ai-export-dialog').open,hasClasses:text.includes('"クラス一覧"'),hasRelationships:text.includes('"関係一覧"'),hasInternalId:text.includes('sourceId'),hasCoordinates:/"[xy]"\s*:/.test(text)}})()`);
    if (!classAiExport.open || !classAiExport.hasClasses || !classAiExport.hasRelationships || classAiExport.hasInternalId || classAiExport.hasCoordinates) throw new Error(`Class AI export failed: ${JSON.stringify(classAiExport)}`);
    await client.evaluate(`document.querySelector('#copy-ai-json').click()`); await delay(100);
    const copied = await client.evaluate(`document.querySelector('#copy-ai-json').textContent`);
    if (copied !== 'コピーしました') throw new Error(`AI copy failed: ${JSON.stringify(copied)}`);
    await client.evaluate(`document.querySelector('#ai-export-dialog').close()`);
    await client.evaluate(`document.querySelector('#new-button').click()`); await delay(100);
    await client.evaluate(`document.querySelector('[data-type="sequence"]').click();document.querySelector('#create-document').click();document.querySelector('#add-element').click();document.querySelector('#add-element').click()`);
    const sequenceState = await client.evaluate(`(()=>{const participant=document.querySelector('.participant').getBoundingClientRect(),line=document.querySelector('.lifeline').getBoundingClientRect();return {nodes:document.querySelectorAll('.participant').length,badge:document.querySelector('#diagram-badge').textContent,ports:document.querySelectorAll('.participant .port').length,lifelines:document.querySelectorAll('.lifeline').length,lineStartsBelowObject:line.top>=participant.bottom-2,lineExtendsDown:line.bottom>line.top}})()`);
    if (sequenceState.nodes !== 2 || sequenceState.badge !== 'シーケンス図' || sequenceState.ports !== 0 || sequenceState.lifelines !== 2 || !sequenceState.lineStartsBelowObject || !sequenceState.lineExtendsDown) throw new Error(`Sequence UI failed: ${JSON.stringify(sequenceState)}`);
    const sequenceConnection = await client.evaluate(`(()=>{const lines=document.querySelectorAll('.lifeline');const a=lines[0].getBoundingClientRect(),b=lines[1].getBoundingClientRect(),y=Math.min(a.bottom-20,a.top+300);lines[0].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:a.left+a.width/2,clientY:y}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:b.left+b.width/2,clientY:y}));const preview=Boolean(document.querySelector('.connection-preview'));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:b.left+b.width/2,clientY:y}));const message=document.querySelector('.edge-group');return {preview,messages:document.querySelectorAll('.edge-group').length,type:message?.dataset.relationshipType,inspector:document.querySelector('.relationship-preview')?.textContent}})()`);
    if (!sequenceConnection.preview || sequenceConnection.messages !== 1 || sequenceConnection.type !== 'sync' || !sequenceConnection.inspector?.includes('→')) throw new Error(`Sequence message failed: ${JSON.stringify(sequenceConnection)}`);
    const sequenceGrowth = await client.evaluate(`(()=>{document.querySelector('.edge-group').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:300,clientY:300}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:300,clientY:300}));const y=document.querySelector('#inspector [data-key="y"]');y.value='1550';y.dispatchEvent(new Event('input',{bubbles:true}));return {canvas:parseFloat(document.querySelector('#canvas').style.height),lifeline:parseFloat(document.querySelector('.lifeline').style.height)}})()`);
    if (sequenceGrowth.canvas < 2100 || sequenceGrowth.lifeline < 1900) throw new Error(`Sequence growth failed: ${JSON.stringify(sequenceGrowth)}`);
    const sequenceOrder = await client.evaluate(`(()=>{const nodes=document.querySelectorAll('.participant'),second=nodes[1],r=second.getBoundingClientRect();second.querySelector('.node-title').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+20}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.left-250,clientY:r.top+20}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.left-250,clientY:r.top+20}));return [...document.querySelectorAll('.list-item')].map(x=>x.textContent.trim())})()`);
    if (!sequenceOrder[0].includes('object2')) throw new Error(`Sequence reorder failed: ${JSON.stringify(sequenceOrder)}`);
    const sequenceAiExport = await client.evaluate(`(()=>{document.querySelector('#ai-export-button').click();const value=JSON.parse(document.querySelector('#ai-export-text').value);return {type:value['図の種類'],objects:value['オブジェクト一覧'].length,messages:value['処理フロー'].length,messageType:value['処理フロー'][0]['種類']}})()`);
    if (sequenceAiExport.type !== 'シーケンス図' || sequenceAiExport.objects !== 2 || sequenceAiExport.messages !== 1 || sequenceAiExport.messageType !== '同期') throw new Error(`Sequence AI export failed: ${JSON.stringify(sequenceAiExport)}`);
    console.log('Electron smoke test passed:', { initial, classState, sequenceState });
  } finally {
    client?.close(); child.kill();
  }
})().catch(error => { console.error(error); child.kill(); process.exitCode=1; });
