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
    const classState = await client.evaluate(`({nodes:document.querySelectorAll('.class-node').length,badge:document.querySelector('#diagram-badge').textContent,emptySections:[...document.querySelectorAll('.class-node:first-of-type .class-section')].every(x=>!x.textContent.trim()),emptyPrompt:document.body.textContent.includes('要素を追加して設計を始めましょう'),connectionHint:document.body.textContent.includes('クラスの上下左右にある接続点から別のクラスへドラッグします。'),listOnRight:Boolean(document.querySelector('.right-panel #element-list')),headerControls:Boolean(document.querySelector('.header-left #save-button'))&&document.querySelector('#new-button').textContent.includes('新規ドキュメント'),removedToolbarButtons:['open-button','ai-export-button'].every(id=>!document.getElementById(id))})`);
    if (classState.nodes !== 2 || classState.badge !== 'クラス図' || !classState.emptySections || classState.emptyPrompt || classState.connectionHint || !classState.listOnRight || !classState.headerControls || !classState.removedToolbarButtons) throw new Error(`Class UI failed: ${JSON.stringify(classState)}`);
    await client.evaluate(`(()=>{const node=document.querySelector('.class-node'),r=node.getBoundingClientRect();node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+20,clientY:r.top+20}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.left+20,clientY:r.top+20}));document.querySelector('[data-array-action="add-attribute"]').click()})()`);
    await client.evaluate(`(()=>{const set=(key,value)=>{const control=document.querySelector('[data-member-model="attribute"][data-member-key="'+key+'"]');control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}))};set('visibility','protected');set('name','customer');set('type','Customer')})()`);
    await client.evaluate(`document.querySelector('[data-array-action="add-attribute"]').click();document.querySelector('[data-array-action="remove-attribute"]').click()`);
    await client.evaluate(`document.querySelector('[data-array-action="add-operation"]').click()`);
    await client.evaluate(`(()=>{const set=(key,value)=>{const control=document.querySelector('[data-member-model="operation"][data-member-key="'+key+'"]');control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}))};set('visibility','protected');set('name','find');set('returnType','Customer');document.querySelector('[data-array-action="add-parameter"]').click()})()`);
    await client.evaluate(`(()=>{const set=(key,value)=>{const control=document.querySelector('[data-member-model="parameter"][data-member-key="'+key+'"]');control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}))};set('name','id');set('type','string');document.querySelector('[data-array-action="add-parameter"]').click();document.querySelector('[data-array-action="remove-parameter"]').click()})()`);
    const classFormatting = await client.evaluate(`({sections:[...document.querySelectorAll('.class-node .class-section')].slice(0,2).map(x=>x.textContent.trim()),attributes:document.querySelectorAll('[data-array-item="attribute"]').length,operations:document.querySelectorAll('[data-array-item="operation"]').length,parameters:document.querySelectorAll('.parameter-item').length,visibilityOptions:document.querySelectorAll('[data-member-key="visibility"] option').length})`);
    if (classFormatting.sections[0] !== '# customer: Customer' || classFormatting.sections[1] !== '# find(id: string): Customer' || classFormatting.attributes !== 1 || classFormatting.operations !== 1 || classFormatting.parameters !== 1 || classFormatting.visibilityOptions !== 8) throw new Error(`Class member inspector failed: ${JSON.stringify(classFormatting)}`);
    const accordionState = await client.evaluate(`(()=>{const titles=[...document.querySelectorAll('.array-item-title')].map(x=>x.textContent);document.querySelector('[data-array-item="attribute"] .array-item-title').click();const collapsed=document.querySelector('[data-array-item="attribute"]').classList.contains('collapsed');document.querySelector('[data-array-item="attribute"] .array-item-title').click();return {titles,collapsed,expanded:!document.querySelector('[data-array-item="attribute"]').classList.contains('collapsed'),identityInput:Boolean(document.querySelector('.identity-name[aria-label="クラス名"]')),oldLabels:[...document.querySelectorAll('#inspector h3,.field>span')].some(x=>['クラス','名前'].includes(x.textContent.trim()))}})()`);
    if (!accordionState.titles.includes('customer') || !accordionState.titles.includes('find') || !accordionState.titles.includes('id') || !accordionState.collapsed || !accordionState.expanded || !accordionState.identityInput || accordionState.oldLabels) throw new Error(`Class accordion failed: ${JSON.stringify(accordionState)}`);
    const classConnection = await client.evaluate(`(()=>{const port=document.querySelector('.class-node .port[data-side="right"]');const target=document.querySelectorAll('.class-node')[1];const a=port.getBoundingClientRect(),b=target.getBoundingClientRect();port.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:a.left+a.width/2,clientY:a.top+a.height/2}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:(a.right+b.left)/2,clientY:a.top}));const preview=Boolean(document.querySelector('.connection-preview'));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:b.left+b.width/2,clientY:b.top+b.height/2}));const line=document.querySelector('.edge-line');return {preview,edges:document.querySelectorAll('.edge-group').length,labels:document.querySelectorAll('.edge-label').length,plainLine:!line.hasAttribute('marker-start')&&!line.hasAttribute('marker-end')}})()`);
    if (!classConnection.preview || classConnection.edges !== 1 || classConnection.labels !== 0 || !classConnection.plainLine) throw new Error(`Class connection failed: ${JSON.stringify(classConnection)}`);
    const classMarker = await client.evaluate(`(()=>{const type=document.querySelector('#inspector [data-key="type"]');type.value='inheritance';type.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('.edge-line').getAttribute('marker-end')})()`);
    if (classMarker !== 'url(#triangle)') throw new Error(`Class marker failed: ${JSON.stringify(classMarker)}`);
    await client.evaluate(`document.querySelector('#new-button').click()`); await delay(100);
    await client.evaluate(`document.querySelector('[data-type="sequence"]').click();document.querySelector('#create-document').click();document.querySelector('#add-element').click();document.querySelector('#add-element').click()`);
    const sequenceState = await client.evaluate(`(()=>{const participant=document.querySelector('.participant').getBoundingClientRect(),line=document.querySelector('.lifeline').getBoundingClientRect();return {nodes:document.querySelectorAll('.participant').length,badge:document.querySelector('#diagram-badge').textContent,ports:document.querySelectorAll('.participant .port').length,lifelines:document.querySelectorAll('.lifeline').length,lineStartsBelowObject:line.top>=participant.bottom-2,lineExtendsDown:line.bottom>line.top,guideRemoved:!document.body.textContent.includes('送信元の縦ライフラインを左クリックし'),identityInput:Boolean(document.querySelector('.identity-name[aria-label="オブジェクト名"]')),oldLabels:[...document.querySelectorAll('#inspector h3,.field>span')].some(x=>['オブジェクト','名前'].includes(x.textContent.trim()))}})()`);
    if (sequenceState.nodes !== 2 || sequenceState.badge !== 'シーケンス図' || sequenceState.ports !== 0 || sequenceState.lifelines !== 2 || !sequenceState.lineStartsBelowObject || !sequenceState.lineExtendsDown || !sequenceState.guideRemoved || !sequenceState.identityInput || sequenceState.oldLabels) throw new Error(`Sequence UI failed: ${JSON.stringify(sequenceState)}`);
    const sequenceConnection = await client.evaluate(`(()=>{const lines=document.querySelectorAll('.lifeline');const a=lines[0].getBoundingClientRect(),b=lines[1].getBoundingClientRect(),y=Math.min(a.bottom-20,a.top+300);lines[0].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:a.left+a.width/2,clientY:y}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:b.left+b.width/2,clientY:y}));const preview=Boolean(document.querySelector('.connection-preview'));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:b.left+b.width/2,clientY:y}));const message=document.querySelector('.edge-group');return {preview,messages:document.querySelectorAll('.edge-group').length,type:message?.dataset.relationshipType,inspector:document.querySelector('.relationship-preview')?.textContent}})()`);
    if (!sequenceConnection.preview || sequenceConnection.messages !== 1 || sequenceConnection.type !== 'sync' || !sequenceConnection.inspector?.includes('→')) throw new Error(`Sequence message failed: ${JSON.stringify(sequenceConnection)}`);
    const sequenceGrowth = await client.evaluate(`(()=>{document.querySelector('.edge-group').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:300,clientY:300}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:300,clientY:300}));const y=document.querySelector('#inspector [data-key="y"]');y.value='1550';y.dispatchEvent(new Event('input',{bubbles:true}));return {canvas:parseFloat(document.querySelector('#canvas').style.height),lifeline:parseFloat(document.querySelector('.lifeline').style.height)}})()`);
    if (sequenceGrowth.canvas < 2100 || sequenceGrowth.lifeline < 1900) throw new Error(`Sequence growth failed: ${JSON.stringify(sequenceGrowth)}`);
    const sequenceOrder = await client.evaluate(`(()=>{const nodes=document.querySelectorAll('.participant'),second=nodes[1],r=second.getBoundingClientRect();second.querySelector('.node-title').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+20}));document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.left-250,clientY:r.top+20}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.left-250,clientY:r.top+20}));return [...document.querySelectorAll('.list-item')].map(x=>x.textContent.trim())})()`);
    if (!sequenceOrder[0].includes('object2')) throw new Error(`Sequence reorder failed: ${JSON.stringify(sequenceOrder)}`);
    console.log('Electron smoke test passed:', { initial, classState, sequenceState });
  } finally {
    client?.close(); child.kill();
  }
})().catch(error => { console.error(error); child.kill(); process.exitCode=1; });
