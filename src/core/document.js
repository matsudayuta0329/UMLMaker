export const SCHEMA_VERSION = 2;

export function id(prefix = 'item') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createDocument(type, title = type === 'class' ? '新しいクラス図' : '新しいシーケンス図') {
  return {
    schema: 'umlmaker.document', schemaVersion: SCHEMA_VERSION,
    diagramType: type, title,
    metadata: { description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    elements: [], relationships: [], notes: []
  };
}

export function validateDocument(value, supportedTypes = ['class', 'sequence']) {
  if (!value || typeof value !== 'object') throw new Error('JSONのルートはオブジェクトである必要があります。');
  if (value.schema !== 'umlmaker.document') throw new Error('UML Maker文書ではありません。schemaを確認してください。');
  if (![1, SCHEMA_VERSION].includes(value.schemaVersion)) throw new Error(`未対応のschemaVersionです: ${value.schemaVersion}`);
  if (!supportedTypes.includes(value.diagramType)) throw new Error(`未対応の図タイプです: ${value.diagramType}`);
  if (!Array.isArray(value.elements) || !Array.isArray(value.relationships)) throw new Error('elementsとrelationshipsは配列である必要があります。');
  const document = structuredClone(value);
  if (document.schemaVersion === 1) migrateVersion1(document);
  return document;
}

function visibilityFromSymbol(symbol, fallback) {
  return ({ '+': 'public', '-': 'private', '#': 'protected', '~': 'package' })[symbol] || fallback;
}

function migrateAttribute(value, index) {
  if (value && typeof value === 'object') return { id: value.id || id('attribute'), name: value.name || '', type: value.type || '', visibility: value.visibility || 'private' };
  const text = String(value || '').trim();
  const match = text.match(/^([+\-#~])?\s*([^:]+?)(?:\s*:\s*(.+))?$/);
  return { id: id('attribute'), name: match?.[2]?.trim() || `attribute${index + 1}`, type: match?.[3]?.trim() || '', visibility: visibilityFromSymbol(match?.[1], 'private') };
}

function migrateOperation(value, index) {
  if (value && typeof value === 'object') return {
    id: value.id || id('operation'), name: value.name || '', returnType: value.returnType || 'void',
    visibility: value.visibility || 'public', parameters: (value.parameters || []).map((parameter, parameterIndex) => ({ id: parameter.id || id('parameter'), name: parameter.name || `arg${parameterIndex + 1}`, type: parameter.type || '' }))
  };
  const text = String(value || '').trim();
  const match = text.match(/^([+\-#~])?\s*([^(:]+?)\s*(?:\(([^)]*)\))?\s*(?::\s*(.+))?$/);
  const parameters = (match?.[3] || '').split(',').map(item => item.trim()).filter(Boolean).map((item, parameterIndex) => {
    const [name, type = ''] = item.split(':').map(part => part.trim());
    return { id: id('parameter'), name: name || `arg${parameterIndex + 1}`, type };
  });
  return { id: id('operation'), name: match?.[2]?.trim() || `operation${index + 1}`, returnType: match?.[4]?.trim() || 'void', visibility: visibilityFromSymbol(match?.[1], 'public'), parameters };
}

function migrateVersion1(document) {
  if (document.diagramType === 'class') {
    document.elements.forEach(element => {
      element.attributes = (element.attributes || []).map(migrateAttribute);
      element.operations = (element.operations || []).map(migrateOperation);
    });
  }
  document.schemaVersion = SCHEMA_VERSION;
}

export function serializable(document) {
  const copy = structuredClone(document);
  copy.metadata ||= {};
  copy.metadata.updatedAt = new Date().toISOString();
  return copy;
}
