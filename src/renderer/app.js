import { createDocument, validateDocument, serializable, id } from '../core/document.js';
import { getDiagramType, listDiagramTypes } from '../core/registry.js';
import { createAiInstructionText } from '../core/ai-export.js';
import '../core/diagram-types.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#canvas');
const svg = $('#edges');
const PARTICIPANT_START_X = 100;
const PARTICIPANT_GAP = 240;
const PARTICIPANT_Y = 70;
const VISIBILITY = { public: '+', private: '-', protected: '#', package: '~' };

let doc = createDocument('class');
let selection = null;
let dirty = false;
let filePath = null;
let drag = null;
let connection = null;
let chosenType = 'class';
let memberSelection = { classId: null, attributeId: null, operationId: null, parameterId: null };
const collapsedMembers = new Set();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function markDirty() {
  dirty = true;
  doc.metadata.updatedAt = new Date().toISOString();
  window.desktop.markDirty(true);
  updateStatus();
}

function updateStatus() {
  const name = filePath ? filePath.split(/[\\/]/).pop() : '無題';
  $('#file-status').textContent = `${name} · ${dirty ? '未保存' : '保存済み'}`;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 1800);
}

function showAiExport() {
  const text = createAiInstructionText(doc);
  $('#ai-export-text').value = text;
  $('#ai-export-summary').textContent = `${getDiagramType(doc.diagramType).label} · ${doc.elements.length}要素 · ${doc.relationships.length}関係 · ${text.length.toLocaleString()}文字`;
  $('#copy-ai-json').textContent = '全文をコピー';
  $('#ai-export-dialog').showModal();
  $('#ai-export-text').scrollTop = 0;
}

function newDialog() {
  $('#type-options').innerHTML = listDiagramTypes().map(type => `<div class="type-card ${type.type === chosenType ? 'selected' : ''}" data-type="${type.type}"><span>${type.icon}</span><strong>${type.label}</strong><p>${type.description}</p></div>`).join('');
  $('#new-dialog').showModal();
}

async function requestNew() {
  if (dirty && !(await window.desktop.confirmReplace())) return;
  newDialog();
}

function createNew(type) {
  doc = createDocument(type);
  selection = null;
  dirty = false;
  filePath = null;
  connection = null;
  memberSelection = { classId: null, attributeId: null, operationId: null, parameterId: null };
  collapsedMembers.clear();
  window.desktop.newCreated();
  render();
  updateStatus();
  toast(`${getDiagramType(type).label}を作成しました`);
}

function normalizeSequenceParticipants() {
  if (doc.diagramType !== 'sequence') return;
  doc.elements.forEach((element, index) => {
    element.x = PARTICIPANT_START_X + index * PARTICIPANT_GAP;
    element.y = PARTICIPANT_Y;
    element.width = 170;
  });
}

function addElement() {
  const element = getDiagramType(doc.diagramType).createElement(doc.elements.length);
  doc.elements.push(element);
  normalizeSequenceParticipants();
  selection = { kind: 'element', id: element.id };
  markDirty();
  render();
}

function addNote() {
  const note = { id: id('note'), text: 'メモを入力', x: 180 + doc.notes.length * 28, y: 180 + doc.notes.length * 28, width: 190 };
  doc.notes.push(note);
  selection = { kind: 'note', id: note.id };
  markDirty();
  render();
}

function deleteSelection() {
  if (!selection) return;
  if (selection.kind === 'element') {
    doc.elements = doc.elements.filter(element => element.id !== selection.id);
    doc.relationships = doc.relationships.filter(rel => rel.sourceId !== selection.id && rel.targetId !== selection.id);
    normalizeSequenceParticipants();
  }
  if (selection.kind === 'relationship') doc.relationships = doc.relationships.filter(rel => rel.id !== selection.id);
  if (selection.kind === 'note') doc.notes = doc.notes.filter(note => note.id !== selection.id);
  selection = null;
  markDirty();
  render();
}

function portHtml() {
  return ['top', 'right', 'bottom', 'left'].map(side => `<i class="port" data-side="${side}"></i>`).join('');
}

function attributeNotation(attribute) {
  return `${VISIBILITY[attribute.visibility] || ''} ${attribute.name || ''}${attribute.type ? `: ${attribute.type}` : ''}`.trim();
}

function operationNotation(operation) {
  const parameters = (operation.parameters || []).map(parameter => `${parameter.name || ''}${parameter.type ? `: ${parameter.type}` : ''}`).join(', ');
  return `${VISIBILITY[operation.visibility] || ''} ${operation.name || ''}(${parameters}): ${operation.returnType || 'void'}`.trim();
}

function sequenceCanvasHeight() {
  const lastMessage = Math.max(0, ...doc.relationships.map(rel => Number(rel.y) || 0));
  const lastNote = Math.max(0, ...doc.notes.map(note => (Number(note.y) || 0) + 150));
  return Math.max(1600, lastMessage + 600, lastNote + 300);
}

function renderNode(element, index) {
  const selected = selection?.kind === 'element' && selection.id === element.id;
  if (doc.diagramType === 'class') {
    return `<div class="node class-node ${selected ? 'selected' : ''}" data-id="${element.id}" style="left:${element.x}px;top:${element.y}px;width:${element.width}px"><div class="node-title">${escapeHtml(element.name)}</div><div class="class-section">${(element.attributes || []).map(attribute => `<div>${escapeHtml(attributeNotation(attribute))}</div>`).join('')}</div><div class="class-section">${(element.operations || []).map(operation => `<div>${escapeHtml(operationNotation(operation))}</div>`).join('')}</div>${element.note ? `<div class="class-section class-note">${escapeHtml(element.note)}</div>` : ''}${portHtml()}</div>`;
  }
  const lifelineHeight = sequenceCanvasHeight() - PARTICIPANT_Y - 43;
  return `<div class="node participant ${selected ? 'selected' : ''}" data-id="${element.id}" style="left:${element.x}px;top:${PARTICIPANT_Y}px;width:${element.width}px"><span class="sequence-index">${index + 1}</span><div class="node-title">${escapeHtml(element.name)}</div><div class="lifeline" data-participant-id="${element.id}" style="height:${lifelineHeight}px" title="別のライフラインへドラッグしてメッセージを追加"></div></div>`;
}

function pointFor(element, side, relationship) {
  if (doc.diagramType === 'sequence') return { x: element.x + element.width / 2, y: Number(relationship?.y) || 220 };
  const node = canvas.querySelector(`.node[data-id="${element.id}"]`);
  const height = node?.offsetHeight || 50;
  const points = {
    top: { x: element.x + element.width / 2, y: element.y },
    bottom: { x: element.x + element.width / 2, y: element.y + height },
    left: { x: element.x, y: element.y + height / 2 },
    right: { x: element.x + element.width, y: element.y + height / 2 }
  };
  return points[side] || points.right;
}

function markerAttributesFor(type) {
  if (type === 'association') return '';
  if (type === 'aggregation') return 'marker-start="url(#diamond)"';
  if (type === 'composition') return 'marker-start="url(#diamond-filled)"';
  if (type === 'inheritance' || type === 'realization') return 'marker-end="url(#triangle)"';
  return 'marker-end="url(#arrow)"';
}

function edgeLabel(rel, x, y) {
  if (!rel.label) return '';
  const width = Math.max(70, Math.min(220, rel.label.length * 13 + 20));
  return `<rect class="edge-label-bg" x="${x - width / 2}" y="${y - 24}" width="${width}" height="22" rx="5"/><text class="edge-label" x="${x}" y="${y - 13}">${escapeHtml(rel.label)}</text>`;
}

function renderEdges() {
  const definitions = svg.querySelector('defs').outerHTML;
  const relationships = doc.relationships.map(rel => {
    const source = doc.elements.find(element => element.id === rel.sourceId);
    const target = doc.elements.find(element => element.id === rel.targetId);
    if (!source || !target) return '';
    const start = pointFor(source, rel.sourceSide, rel);
    const end = pointFor(target, rel.targetSide, rel);
    const dashed = ['dependency', 'realization', 'return', 'async'].includes(rel.type) ? 'stroke-dasharray="7 5"' : '';
    const middleX = (start.x + end.x) / 2;
    const middleY = (start.y + end.y) / 2;
    return `<g class="edge-group ${selection?.kind === 'relationship' && selection.id === rel.id ? 'selected' : ''}" data-id="${rel.id}" data-relationship-type="${rel.type}"><path class="edge-hit" d="M${start.x},${start.y} L${end.x},${end.y}"/><path class="edge-line" ${dashed} ${markerAttributesFor(rel.type)} d="M${start.x},${start.y} L${end.x},${end.y}"/>${edgeLabel(rel, middleX, middleY)}</g>`;
  }).join('');
  const preview = connection ? `<g><circle class="connection-source" cx="${connection.start.x}" cy="${connection.start.y}" r="5"/><path class="connection-preview" d="M${connection.start.x},${connection.start.y} L${connection.current.x},${connection.current.y}"/></g>` : '';
  svg.innerHTML = definitions + relationships + preview;
  svg.querySelectorAll('.edge-group').forEach(group => group.addEventListener('pointerdown', event => {
    event.stopPropagation();
    const relationship = doc.relationships.find(rel => rel.id === group.dataset.id);
    selection = { kind: 'relationship', id: group.dataset.id };
    if (doc.diagramType === 'sequence') drag = { target: relationship, startX: event.clientX, startY: event.clientY, y: relationship.y, type: 'relationship', changed: false };
    renderInspector();
    renderList();
    group.classList.add('selected');
  }));
}

function renderList() {
  $('#element-list').innerHTML = doc.elements.map((element, index) => `<div class="list-item ${selection?.id === element.id ? 'selected' : ''}" data-id="${element.id}"><span>${doc.diagramType === 'class' ? '◇' : index + 1}</span>${escapeHtml(element.name)}</div>`).join('');
  $('#element-count').textContent = doc.elements.length;
  $('#element-list').querySelectorAll('.list-item').forEach(item => { item.onclick = () => { selection = { kind: 'element', id: item.dataset.id }; render(); }; });
}

function field(label, key, value, type = 'input') {
  return `<label class="field"><span>${label}</span>${type === 'textarea' ? `<textarea data-key="${key}" rows="4">${escapeHtml(value)}</textarea>` : `<input data-key="${key}" value="${escapeHtml(value)}">`}</label>`;
}

function visibilityOptions(selected) {
  return Object.entries(VISIBILITY).map(([value, symbol]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value} (${symbol})</option>`).join('');
}

function memberField(label, model, itemId, key, value, operationId = '') {
  return `<label><span>${label}</span><input data-member-model="${model}" data-item-id="${itemId}" data-operation-id="${operationId}" data-member-key="${key}" value="${escapeHtml(value || '')}"></label>`;
}

function visibilityField(model, itemId, value) {
  return `<label><span>可視性</span><select data-member-model="${model}" data-item-id="${itemId}" data-member-key="visibility">${visibilityOptions(value)}</select></label>`;
}

function renderClassArrays(element) {
  const selectedAttribute = memberSelection.classId === element.id ? memberSelection.attributeId : null;
  const selectedOperation = memberSelection.classId === element.id ? memberSelection.operationId : null;
  const selectedParameter = memberSelection.classId === element.id ? memberSelection.parameterId : null;
  const attributes = (element.attributes || []).map((attribute, index) => `
    <div class="array-item ${selectedAttribute === attribute.id ? 'selected' : ''} ${collapsedMembers.has(attribute.id) ? 'collapsed' : ''}" data-array-item="attribute" data-item-id="${attribute.id}">
      <button type="button" class="array-item-title" data-select-member="attribute" data-item-id="${attribute.id}">${escapeHtml(attribute.name || `属性 ${index + 1}`)}</button>
      <div class="array-item-body"><div class="member-grid three">${visibilityField('attribute', attribute.id, attribute.visibility)}${memberField('名前', 'attribute', attribute.id, 'name', attribute.name)}${memberField('型名', 'attribute', attribute.id, 'type', attribute.type)}</div></div>
    </div>`).join('');
  const operations = (element.operations || []).map((operation, index) => {
    const parameters = (operation.parameters || []).map((parameter, parameterIndex) => `
      <div class="parameter-item ${selectedOperation === operation.id && selectedParameter === parameter.id ? 'selected' : ''} ${collapsedMembers.has(parameter.id) ? 'collapsed' : ''}">
        <button type="button" class="array-item-title small" data-select-member="parameter" data-operation-id="${operation.id}" data-item-id="${parameter.id}">${escapeHtml(parameter.name || `引数 ${parameterIndex + 1}`)}</button>
        <div class="array-item-body"><div class="member-grid two">${memberField('名前', 'parameter', parameter.id, 'name', parameter.name, operation.id)}${memberField('型名', 'parameter', parameter.id, 'type', parameter.type, operation.id)}</div></div>
      </div>`).join('');
    return `<div class="array-item operation-item ${selectedOperation === operation.id ? 'selected' : ''} ${collapsedMembers.has(operation.id) ? 'collapsed' : ''}" data-array-item="operation" data-item-id="${operation.id}">
      <button type="button" class="array-item-title" data-select-member="operation" data-item-id="${operation.id}">${escapeHtml(operation.name || `操作 ${index + 1}`)}</button>
      <div class="array-item-body"><div class="member-grid three">${visibilityField('operation', operation.id, operation.visibility)}${memberField('名前', 'operation', operation.id, 'name', operation.name)}${memberField('返り値型', 'operation', operation.id, 'returnType', operation.returnType || 'void')}</div>
      <div class="nested-array"><div class="array-header nested"><span>引数 <small>Size ${operation.parameters?.length || 0}</small></span><div><button type="button" data-array-action="add-parameter" data-operation-id="${operation.id}" title="引数を追加">＋</button><button type="button" data-array-action="remove-parameter" data-operation-id="${operation.id}" ${selectedOperation === operation.id && selectedParameter ? '' : 'disabled'} title="選択した引数を削除">−</button></div></div>${parameters || '<div class="array-empty">引数なし</div>'}</div></div>
    </div>`;
  }).join('');
  return `<div class="array-section"><div class="array-header"><strong>属性 <small>Size ${element.attributes?.length || 0}</small></strong><div><button type="button" data-array-action="add-attribute" title="属性を追加">＋</button><button type="button" data-array-action="remove-attribute" ${selectedAttribute ? '' : 'disabled'} title="選択した属性を削除">−</button></div></div>${attributes || '<div class="array-empty">属性なし</div>'}</div>
    <div class="array-section"><div class="array-header"><strong>操作 <small>Size ${element.operations?.length || 0}</small></strong><div><button type="button" data-array-action="add-operation" title="操作を追加">＋</button><button type="button" data-array-action="remove-operation" ${selectedOperation ? '' : 'disabled'} title="選択した操作を削除">−</button></div></div>${operations || '<div class="array-empty">操作なし</div>'}</div>`;
}

function renderInspector() {
  const box = $('#inspector');
  $('#inspector-empty').hidden = Boolean(selection);
  $('#delete-button').disabled = !selection;
  if (!selection) { box.innerHTML = ''; return; }
  if (selection.kind === 'element') {
    const element = doc.elements.find(item => item.id === selection.id);
    if (!element) return;
    const classFields = renderClassArrays(element);
    const positionFields = doc.diagramType === 'class' ? `<div class="row">${field('X', 'x', Math.round(element.x))}${field('Y', 'y', Math.round(element.y))}</div>` : `<p class="help-text">順番: ${doc.elements.indexOf(element) + 1}。左右へドラッグすると順番を入れ替えられます。</p>`;
    box.innerHTML = `<div class="inspector-section"><input class="identity-name" data-key="name" aria-label="${doc.diagramType === 'class' ? 'クラス名' : 'オブジェクト名'}" placeholder="${doc.diagramType === 'class' ? 'クラス名' : 'オブジェクト名'}" value="${escapeHtml(element.name)}">${doc.diagramType === 'class' ? classFields : ''}${field('メモ', 'note', element.note || '', 'textarea')}${positionFields}</div>`;
    bindInspector(element);
    if (doc.diagramType === 'class') bindClassArrayInspector(element);
    return;
  }
  if (selection.kind === 'note') {
    const note = doc.notes.find(item => item.id === selection.id);
    box.innerHTML = `<div class="inspector-section"><h3>メモ</h3>${field('内容', 'text', note.text, 'textarea')}<div class="row">${field('X', 'x', Math.round(note.x))}${field('Y', 'y', Math.round(note.y))}</div></div>`;
    bindInspector(note);
    return;
  }
  const rel = doc.relationships.find(item => item.id === selection.id);
  const definition = getDiagramType(doc.diagramType);
  const from = doc.elements.find(item => item.id === rel.sourceId)?.name;
  const to = doc.elements.find(item => item.id === rel.targetId)?.name;
  box.innerHTML = `<div class="inspector-section"><h3>${doc.diagramType === 'class' ? '関係' : 'メッセージ'}</h3><div class="relationship-preview">${escapeHtml(from)} → ${escapeHtml(to)}</div><label class="field"><span>タイプ</span><select data-key="type">${definition.relationships.map(([value, label]) => `<option value="${value}" ${value === rel.type ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field(doc.diagramType === 'class' ? '任意ラベル' : '処理名', 'label', rel.label || '')}${field('メモ', 'note', rel.note || '', 'textarea')}${doc.diagramType === 'sequence' ? field('時系列位置 Y', 'y', rel.y) : ''}</div>`;
  bindInspector(rel);
}

function bindInspector(target) {
  $('#inspector').querySelectorAll('[data-key]').forEach(control => control.addEventListener('input', () => {
    const key = control.dataset.key;
    let value = control.value;
    if (['x', 'y'].includes(key)) value = Number(value) || 0;
    target[key] = value;
    markDirty();
    renderCanvasOnly();
    renderList();
  }));
}

function commitArrayChange() {
  markDirty();
  renderCanvasOnly();
  renderInspector();
  renderList();
}

function bindClassArrayInspector(element) {
  $('#inspector').querySelectorAll('[data-select-member]').forEach(control => control.addEventListener('click', () => {
    memberSelection.classId = element.id;
    const kind = control.dataset.selectMember;
    if (kind === 'attribute') memberSelection.attributeId = control.dataset.itemId;
    if (kind === 'operation') { memberSelection.operationId = control.dataset.itemId; memberSelection.parameterId = null; }
    if (kind === 'parameter') { memberSelection.operationId = control.dataset.operationId; memberSelection.parameterId = control.dataset.itemId; }
    if (collapsedMembers.has(control.dataset.itemId)) collapsedMembers.delete(control.dataset.itemId);
    else collapsedMembers.add(control.dataset.itemId);
    renderInspector();
  }));
  $('#inspector').querySelectorAll('[data-member-key]').forEach(control => control.addEventListener('input', () => {
    const model = control.dataset.memberModel;
    let target;
    if (model === 'attribute') target = element.attributes.find(item => item.id === control.dataset.itemId);
    if (model === 'operation') target = element.operations.find(item => item.id === control.dataset.itemId);
    if (model === 'parameter') target = element.operations.find(item => item.id === control.dataset.operationId)?.parameters.find(item => item.id === control.dataset.itemId);
    if (!target) return;
    target[control.dataset.memberKey] = control.value;
    if (control.dataset.memberKey === 'name') {
      const title = control.closest('.array-item,.parameter-item')?.querySelector('.array-item-title');
      if (title) title.textContent = control.value || (model === 'attribute' ? '属性' : model === 'operation' ? '操作' : '引数');
    }
    markDirty();
    renderCanvasOnly();
    renderList();
  }));
  $('#inspector').querySelectorAll('[data-array-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.arrayAction;
    memberSelection.classId = element.id;
    if (action === 'add-attribute') {
      const attribute = { id: id('attribute'), name: `attribute${element.attributes.length + 1}`, type: '', visibility: 'private' };
      element.attributes.push(attribute); memberSelection.attributeId = attribute.id;
    }
    if (action === 'remove-attribute' && memberSelection.attributeId) {
      element.attributes = element.attributes.filter(item => item.id !== memberSelection.attributeId); memberSelection.attributeId = null;
    }
    if (action === 'add-operation') {
      const operation = { id: id('operation'), name: `operation${element.operations.length + 1}`, returnType: 'void', visibility: 'public', parameters: [] };
      element.operations.push(operation); memberSelection.operationId = operation.id; memberSelection.parameterId = null;
    }
    if (action === 'remove-operation' && memberSelection.operationId) {
      element.operations = element.operations.filter(item => item.id !== memberSelection.operationId); memberSelection.operationId = null; memberSelection.parameterId = null;
    }
    if (action === 'add-parameter') {
      const operation = element.operations.find(item => item.id === button.dataset.operationId);
      const parameter = { id: id('parameter'), name: `arg${operation.parameters.length + 1}`, type: '' };
      operation.parameters.push(parameter); memberSelection.operationId = operation.id; memberSelection.parameterId = parameter.id;
    }
    if (action === 'remove-parameter' && memberSelection.parameterId) {
      const operation = element.operations.find(item => item.id === button.dataset.operationId);
      operation.parameters = operation.parameters.filter(item => item.id !== memberSelection.parameterId); memberSelection.parameterId = null;
    }
    commitArrayChange();
  }));
}

function renderCanvasOnly() {
  const height = doc.diagramType === 'sequence' ? sequenceCanvasHeight() : 1600;
  canvas.style.height = `${height}px`;
  canvas.classList.toggle('sequence-mode', doc.diagramType === 'sequence');
  canvas.querySelectorAll('.node,.note').forEach(element => element.remove());
  canvas.insertAdjacentHTML('beforeend', doc.elements.map(renderNode).join('') + doc.notes.map(note => `<div class="note ${selection?.kind === 'note' && selection.id === note.id ? 'selected' : ''}" data-note-id="${note.id}" style="left:${note.x}px;top:${note.y}px;width:${note.width}px">${escapeHtml(note.text)}</div>`).join(''));
  bindCanvas();
  renderEdges();
}

function render() {
  const definition = getDiagramType(doc.diagramType);
  $('#diagram-badge').textContent = definition.label;
  $('#add-element span').textContent = definition.elementLabel;
  $('#document-title').value = doc.title;
  $('#document-description').value = doc.metadata.description || '';
  renderCanvasOnly();
  renderList();
  renderInspector();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startClassConnection(event, node) {
  event.stopPropagation();
  const source = doc.elements.find(element => element.id === node.dataset.id);
  const side = event.target.dataset.side;
  const start = pointFor(source, side);
  connection = { mode: 'class', source, sourceSide: side, start, current: start };
  renderEdges();
}

function startSequenceConnection(event, lifeline) {
  event.stopPropagation();
  const source = doc.elements.find(element => element.id === lifeline.dataset.participantId);
  const pointer = canvasPoint(event);
  const start = { x: source.x + source.width / 2, y: Math.max(PARTICIPANT_Y + 55, pointer.y) };
  connection = { mode: 'sequence', source, sourceSide: 'right', start, current: start };
  renderEdges();
}

function bindCanvas() {
  canvas.querySelectorAll('.node').forEach(node => node.addEventListener('pointerdown', event => {
    if (event.target.classList.contains('port')) { startClassConnection(event, node); return; }
    if (event.target.classList.contains('lifeline')) { startSequenceConnection(event, event.target); return; }
    event.stopPropagation();
    const element = doc.elements.find(item => item.id === node.dataset.id);
    selection = { kind: 'element', id: element.id };
    if (doc.diagramType === 'sequence') drag = { target: element, startX: event.clientX, startIndex: doc.elements.indexOf(element), type: 'participant', changed: false };
    else drag = { target: element, startX: event.clientX, startY: event.clientY, x: element.x, y: element.y, type: 'element', changed: false };
    renderInspector();
    renderList();
    node.classList.add('selected');
  }));
  canvas.querySelectorAll('.note').forEach(node => node.addEventListener('pointerdown', event => {
    event.stopPropagation();
    const note = doc.notes.find(item => item.id === node.dataset.noteId);
    selection = { kind: 'note', id: note.id };
    drag = { target: note, startX: event.clientX, startY: event.clientY, x: note.x, y: note.y, type: 'note', changed: false };
    renderInspector();
    renderList();
    node.classList.add('selected');
  }));
}

document.addEventListener('pointermove', event => {
  if (connection) { connection.current = canvasPoint(event); renderEdges(); return; }
  if (!drag) return;
  if (drag.type === 'relationship') {
    drag.target.y = Math.max(PARTICIPANT_Y + 55, drag.y + event.clientY - drag.startY);
    drag.changed = true;
  } else if (drag.type === 'participant') {
    const offset = Math.round((event.clientX - drag.startX) / PARTICIPANT_GAP);
    const targetIndex = Math.max(0, Math.min(doc.elements.length - 1, drag.startIndex + offset));
    const currentIndex = doc.elements.indexOf(drag.target);
    if (targetIndex !== currentIndex) {
      doc.elements.splice(currentIndex, 1);
      doc.elements.splice(targetIndex, 0, drag.target);
      normalizeSequenceParticipants();
      drag.startIndex = targetIndex;
      drag.startX = event.clientX;
      drag.changed = true;
    }
  } else {
    drag.target.x = Math.max(0, drag.x + event.clientX - drag.startX);
    drag.target.y = Math.max(0, drag.y + event.clientY - drag.startY);
    drag.changed = true;
  }
  renderCanvasOnly();
});

document.addEventListener('pointerup', event => {
  if (drag) {
    const changed = drag.changed;
    drag = null;
    if (changed) markDirty();
    render();
  }
  if (!connection) return;
  const targetElement = document.elementFromPoint(event.clientX, event.clientY);
  const targetNode = connection.mode === 'sequence'
    ? [...document.querySelectorAll('.lifeline')].find(line => {
        const rect = line.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        return Math.abs(event.clientX - centerX) <= 14 && event.clientY >= rect.top && event.clientY <= rect.bottom;
      })
    : targetElement?.closest('.node');
  const targetId = connection.mode === 'sequence' ? targetNode?.dataset.participantId : targetNode?.dataset.id;
  if (targetId && targetId !== connection.source.id) {
    const target = doc.elements.find(element => element.id === targetId);
    const relationshipTypes = getDiagramType(doc.diagramType).relationships;
    const relation = { id: id(doc.diagramType === 'sequence' ? 'message' : 'rel'), sourceId: connection.source.id, targetId: target.id, sourceSide: connection.sourceSide, targetSide: connection.mode === 'sequence' ? 'left' : opposite(connection.sourceSide), type: relationshipTypes[0][0], label: '', note: '' };
    if (connection.mode === 'sequence') relation.y = connection.start.y;
    doc.relationships.push(relation);
    selection = { kind: 'relationship', id: relation.id };
    connection = null;
    markDirty();
    render();
    return;
  }
  connection = null;
  renderEdges();
});

function opposite(side) {
  return ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' })[side] || 'left';
}

$('#document-title').addEventListener('input', event => { doc.title = event.target.value; markDirty(); });
$('#document-description').addEventListener('input', event => { doc.metadata.description = event.target.value; markDirty(); });
$('#new-button').onclick = requestNew;
$('#save-button').onclick = () => window.desktop.save(false);
$('#add-element').onclick = addElement;
$('#add-note').onclick = addNote;
$('#delete-button').onclick = deleteSelection;
canvas.addEventListener('pointerdown', event => { if (event.target === canvas || event.target === svg) { selection = null; render(); } });
$('#type-options').addEventListener('click', event => {
  const card = event.target.closest('.type-card');
  if (!card) return;
  chosenType = card.dataset.type;
  document.querySelectorAll('.type-card').forEach(item => item.classList.toggle('selected', item === card));
});
$('#create-document').addEventListener('click', () => createNew(chosenType));
$('#copy-ai-json').addEventListener('click', async () => {
  await window.desktop.copyText($('#ai-export-text').value);
  $('#copy-ai-json').textContent = 'コピーしました';
  toast('AI指示用JSONをクリップボードへコピーしました');
});
window.addEventListener('keydown', event => { if (event.key === 'Delete' && selection && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) deleteSelection(); });

window.desktop.onNewRequested(() => newDialog());
window.desktop.onAIExportRequested(showAiExport);
window.desktop.onOpened(({ document: incoming, filePath: openedPath }) => {
  try {
    doc = validateDocument(incoming, listDiagramTypes().map(type => type.type));
    normalizeSequenceParticipants();
    selection = null;
    dirty = false;
    filePath = openedPath;
    render();
    updateStatus();
    toast('ドキュメントを開きました');
  } catch (error) { alert(error.message); }
});
window.desktop.onSaved(({ filePath: savedPath }) => { filePath = savedPath; dirty = false; updateStatus(); toast('保存しました'); });
window.desktop.onSerialize(() => serializable(doc));

createNew('class');
setTimeout(newDialog, 120);
