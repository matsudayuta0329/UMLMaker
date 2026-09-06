import { createDocument, validateDocument, serializable, id } from '../core/document.js';
import { getDiagramType, listDiagramTypes } from '../core/registry.js';
import '../core/diagram-types.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const svg = $('#edges');
let doc = createDocument('class');
let selection = null;
let dirty = false;
let filePath = null;
let drag = null;
let connection = null;
let chosenType = 'class';

function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function markDirty() { dirty = true; doc.metadata.updatedAt = new Date().toISOString(); window.desktop.markDirty(true); updateStatus(); }
function updateStatus() { $('#file-status').textContent = `${filePath ? filePath.split(/[\\/]/).pop() : '無題'} · ${dirty ? '未保存' : '保存済み'}`; }
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),1800); }

function newDialog() {
  $('#type-options').innerHTML = listDiagramTypes().map(type => `<div class="type-card ${type.type===chosenType?'selected':''}" data-type="${type.type}"><span>${type.icon}</span><strong>${type.label}</strong><p>${type.description}</p></div>`).join('');
  $('#new-dialog').showModal();
}
async function requestNew() { if (dirty && !(await window.desktop.confirmReplace())) return; newDialog(); }
function createNew(type) { doc=createDocument(type); selection=null; dirty=false; filePath=null; window.desktop.newCreated(); render(); updateStatus(); toast(`${getDiagramType(type).label}を作成しました`); }

function addElement() {
  const type=getDiagramType(doc.diagramType); const element=type.createElement(doc.elements.length);
  if (doc.diagramType==='sequence') element.x=100+doc.elements.length*240;
  doc.elements.push(element); selection={kind:'element',id:element.id}; markDirty(); render();
}
function addNote() { const note={id:id('note'),text:'メモを入力',x:180+doc.notes.length*28,y:180+doc.notes.length*28,width:190}; doc.notes.push(note); selection={kind:'note',id:note.id}; markDirty(); render(); }
function deleteSelection() {
  if (!selection) return;
  if(selection.kind==='element'){ doc.elements=doc.elements.filter(x=>x.id!==selection.id); doc.relationships=doc.relationships.filter(x=>x.sourceId!==selection.id&&x.targetId!==selection.id); }
  if(selection.kind==='relationship') doc.relationships=doc.relationships.filter(x=>x.id!==selection.id);
  if(selection.kind==='note') doc.notes=doc.notes.filter(x=>x.id!==selection.id);
  selection=null; markDirty(); render();
}

function portHtml() { return ['top','right','bottom','left'].map(s=>`<i class="port" data-side="${s}"></i>`).join(''); }
function renderNode(element) {
  const selected=selection?.kind==='element'&&selection.id===element.id;
  if(doc.diagramType==='class') return `<div class="node class-node ${selected?'selected':''}" data-id="${element.id}" style="left:${element.x}px;top:${element.y}px;width:${element.width}px"><div class="node-title">${escapeHtml(element.name)}</div><div class="class-section">${element.attributes.length?element.attributes.map(escapeHtml).join('<br>'):'<span class="muted">属性</span>'}</div><div class="class-section">${element.operations.length?element.operations.map(escapeHtml).join('<br>'):'<span class="muted">操作</span>'}</div>${element.note?`<div class="class-section class-note">${escapeHtml(element.note)}</div>`:''}${portHtml()}</div>`;
  return `<div class="node participant ${selected?'selected':''}" data-id="${element.id}" style="left:${element.x}px;top:${element.y}px;width:${element.width}px"><div class="node-title">${escapeHtml(element.name)}</div><div class="lifeline"></div>${portHtml()}</div>`;
}
function pointFor(element, side, relationship) {
  const node=canvas.querySelector(`.node[data-id="${element.id}"]`); const h=node?.offsetHeight||50;
  if(doc.diagramType==='sequence') { const y=relationship?.y??220; return {x:element.x+element.width/2,y}; }
  const map={top:{x:element.x+element.width/2,y:element.y},bottom:{x:element.x+element.width/2,y:element.y+h},left:{x:element.x,y:element.y+h/2},right:{x:element.x+element.width,y:element.y+h/2}};
  return map[side]||map.right;
}
function markerFor(type) { if(type==='inheritance'||type==='realization') return 'url(#triangle)'; if(type==='aggregation')return'url(#diamond)';if(type==='composition')return'url(#diamond-filled)';return'url(#arrow)'; }
function renderEdges() {
  const defs=svg.querySelector('defs').outerHTML;
  svg.innerHTML=defs+doc.relationships.map(rel=>{
    const a=doc.elements.find(x=>x.id===rel.sourceId), b=doc.elements.find(x=>x.id===rel.targetId); if(!a||!b)return'';
    const p1=pointFor(a,rel.sourceSide,rel), p2=pointFor(b,rel.targetSide,rel); const dashed=['dependency','realization','return','async'].includes(rel.type)?'stroke-dasharray="7 5"':'';
    const midX=(p1.x+p2.x)/2, midY=(p1.y+p2.y)/2; const label=rel.label||getDiagramType(doc.diagramType).relationships.find(x=>x[0]===rel.type)?.[1]||rel.type;
    return `<g class="edge-group ${selection?.kind==='relationship'&&selection.id===rel.id?'selected':''}" data-id="${rel.id}"><path class="edge-hit" d="M${p1.x},${p1.y} L${p2.x},${p2.y}"/><path class="edge-line" ${dashed} marker-end="${markerFor(rel.type)}" d="M${p1.x},${p1.y} L${p2.x},${p2.y}"/><rect class="edge-label-bg" x="${midX-45}" y="${midY-11}" width="90" height="22" rx="5"/><text class="edge-label" x="${midX}" y="${midY}">${escapeHtml(label)}</text></g>`;
  }).join('');
  svg.querySelectorAll('.edge-group').forEach(el=>el.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    const relationship=doc.relationships.find(x=>x.id===el.dataset.id);
    selection={kind:'relationship',id:el.dataset.id};
    if(doc.diagramType==='sequence') drag={target:relationship,startX:e.clientX,startY:e.clientY,x:0,y:relationship.y,type:'relationship'};
    renderInspector(); renderList(); el.classList.add('selected');
  }));
}
function renderList() { $('#element-list').innerHTML=doc.elements.map(el=>`<div class="list-item ${selection?.id===el.id?'selected':''}" data-id="${el.id}"><span>${doc.diagramType==='class'?'◇':'⇥'}</span>${escapeHtml(el.name)}</div>`).join(''); $('#element-count').textContent=doc.elements.length; $('#element-list').querySelectorAll('.list-item').forEach(el=>el.onclick=()=>{selection={kind:'element',id:el.dataset.id};render();}); }

function field(label,key,value,type='input') { return `<label class="field"><span>${label}</span>${type==='textarea'?`<textarea data-key="${key}" rows="4">${escapeHtml(value)}</textarea>`:`<input data-key="${key}" value="${escapeHtml(value)}">`}</label>`; }
function renderInspector() {
  const box=$('#inspector'); $('#inspector-empty').hidden=Boolean(selection); $('#delete-button').disabled=!selection;
  if(!selection){box.innerHTML='';return;}
  if(selection.kind==='element'){
    const el=doc.elements.find(x=>x.id===selection.id); if(!el)return;
    box.innerHTML=`<div class="inspector-section"><h3>${doc.diagramType==='class'?'クラス':'オブジェクト'}</h3>${field('名前','name',el.name)}${doc.diagramType==='class'?field('属性（1行に1つ）','attributes',el.attributes.join('\n'),'textarea')+field('操作（1行に1つ）','operations',el.operations.join('\n'),'textarea'):''}${field('メモ','note',el.note||'','textarea')}<div class="row">${field('X','x',Math.round(el.x))}${field('Y','y',Math.round(el.y))}</div></div>`;
    bindInspector(el);
  } else if(selection.kind==='note'){
    const note=doc.notes.find(x=>x.id===selection.id); box.innerHTML=`<div class="inspector-section"><h3>メモ</h3>${field('内容','text',note.text,'textarea')}<div class="row">${field('X','x',Math.round(note.x))}${field('Y','y',Math.round(note.y))}</div></div>`; bindInspector(note);
  } else {
    const rel=doc.relationships.find(x=>x.id===selection.id); const def=getDiagramType(doc.diagramType); const from=doc.elements.find(x=>x.id===rel.sourceId)?.name; const to=doc.elements.find(x=>x.id===rel.targetId)?.name;
    box.innerHTML=`<div class="inspector-section"><h3>${doc.diagramType==='class'?'関係':'メッセージ'}</h3><div class="relationship-preview">${escapeHtml(from)} → ${escapeHtml(to)}</div><label class="field"><span>タイプ</span><select data-key="type">${def.relationships.map(([v,l])=>`<option value="${v}" ${v===rel.type?'selected':''}>${l}</option>`).join('')}</select></label>${field(doc.diagramType==='class'?'ラベル':'メッセージ','label',rel.label||'')}${field('メモ','note',rel.note||'','textarea')}${doc.diagramType==='sequence'?field('時系列位置 Y','y',rel.y):''}</div>`; bindInspector(rel);
  }
}
function bindInspector(target){ $('#inspector').querySelectorAll('[data-key]').forEach(control=>control.addEventListener('input',()=>{const key=control.dataset.key;let value=control.value;if(['x','y'].includes(key))value=Number(value)||0;if(['attributes','operations'].includes(key))value=value.split('\n').filter(Boolean);target[key]=value;markDirty();renderCanvasOnly();renderList();})); }

function renderCanvasOnly(){ canvas.querySelectorAll('.node,.note').forEach(x=>x.remove()); canvas.insertAdjacentHTML('beforeend',doc.elements.map(renderNode).join('')+doc.notes.map(n=>`<div class="note ${selection?.kind==='note'&&selection.id===n.id?'selected':''}" data-note-id="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.width}px">${escapeHtml(n.text)}</div>`).join('')); $('#empty-state').hidden=doc.elements.length+doc.notes.length>0; bindCanvas(); renderEdges(); }
function render(){ const def=getDiagramType(doc.diagramType); $('#diagram-badge').textContent=def.label; $('#add-element span').textContent=def.elementLabel; $('#document-title').value=doc.title; $('#document-description').value=doc.metadata.description||''; renderCanvasOnly(); renderList(); renderInspector(); }

function bindCanvas(){
  canvas.querySelectorAll('.node').forEach(node=>{
    node.addEventListener('pointerdown',e=>{
      if(e.target.classList.contains('port')){startConnection(e,node);return;} e.stopPropagation(); selection={kind:'element',id:node.dataset.id}; const el=doc.elements.find(x=>x.id===node.dataset.id); drag={target:el,startX:e.clientX,startY:e.clientY,x:el.x,y:el.y,type:'element'}; node.setPointerCapture(e.pointerId); renderInspector(); renderList(); node.classList.add('selected');
    });
  });
  canvas.querySelectorAll('.note').forEach(node=>node.addEventListener('pointerdown',e=>{e.stopPropagation();const note=doc.notes.find(x=>x.id===node.dataset.noteId);selection={kind:'note',id:note.id};drag={target:note,startX:e.clientX,startY:e.clientY,x:note.x,y:note.y,type:'note'};node.setPointerCapture(e.pointerId);renderInspector();renderList();node.classList.add('selected');}));
}
function startConnection(e,node){ e.stopPropagation(); const el=doc.elements.find(x=>x.id===node.dataset.id); connection={source:el,sourceSide:e.target.dataset.side,pointerId:e.pointerId}; e.target.setPointerCapture(e.pointerId); }
document.addEventListener('pointermove',e=>{ if(drag){
  if(drag.type==='relationship') drag.target.y=Math.max(130,drag.y+e.clientY-drag.startY);
  else { drag.target.x=Math.max(0,drag.x+e.clientX-drag.startX); drag.target.y=Math.max(0,drag.y+e.clientY-drag.startY); }
  renderCanvasOnly();
} });
document.addEventListener('pointerup',e=>{
  if(drag){markDirty();drag=null;render();}
  if(connection){const targetNode=document.elementFromPoint(e.clientX,e.clientY)?.closest('.node');if(targetNode&&targetNode.dataset.id!==connection.source.id){const target=doc.elements.find(x=>x.id===targetNode.dataset.id);const rels=getDiagramType(doc.diagramType).relationships;const relation={id:id('rel'),sourceId:connection.source.id,targetId:target.id,sourceSide:connection.sourceSide,targetSide:opposite(connection.sourceSide),type:rels[0][0],label:'',note:''};if(doc.diagramType==='sequence'){relation.y=Math.max(150,e.clientY-canvas.getBoundingClientRect().top);relation.sourceSide='right';relation.targetSide='left';}doc.relationships.push(relation);selection={kind:'relationship',id:relation.id};markDirty();render();}connection=null;}
});
function opposite(side){return({top:'bottom',bottom:'top',left:'right',right:'left'})[side]||'left';}

$('#document-title').addEventListener('input',e=>{doc.title=e.target.value;markDirty();});
$('#document-description').addEventListener('input',e=>{doc.metadata.description=e.target.value;markDirty();});
$('#new-button').onclick=requestNew; $('#open-button').onclick=()=>window.desktop.open(); $('#save-button').onclick=()=>window.desktop.save(false); $('#add-element').onclick=addElement; $('#add-note').onclick=addNote; $('#delete-button').onclick=deleteSelection;
canvas.addEventListener('pointerdown',e=>{if(e.target===canvas||e.target===svg){selection=null;render();}});
$('#type-options').addEventListener('click',e=>{const card=e.target.closest('.type-card');if(!card)return;chosenType=card.dataset.type;document.querySelectorAll('.type-card').forEach(x=>x.classList.toggle('selected',x===card));});
$('#create-document').addEventListener('click',()=>createNew(chosenType));
window.addEventListener('keydown',e=>{if(e.key==='Delete'&&selection&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName))deleteSelection();});

window.desktop.onNewRequested(()=>newDialog());
window.desktop.onOpened(({document:incoming,filePath:openedPath})=>{try{doc=validateDocument(incoming,listDiagramTypes().map(x=>x.type));selection=null;dirty=false;filePath=openedPath;render();updateStatus();toast('ドキュメントを開きました');}catch(error){alert(error.message);}});
window.desktop.onSaved(({filePath:savedPath})=>{filePath=savedPath;dirty=false;updateStatus();toast('保存しました');});
window.desktop.onSerialize(()=>serializable(doc));

createNew('class');
setTimeout(newDialog,120);
