export const SCHEMA_VERSION = 1;

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
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`未対応のschemaVersionです: ${value.schemaVersion}`);
  if (!supportedTypes.includes(value.diagramType)) throw new Error(`未対応の図タイプです: ${value.diagramType}`);
  if (!Array.isArray(value.elements) || !Array.isArray(value.relationships)) throw new Error('elementsとrelationshipsは配列である必要があります。');
  return structuredClone(value);
}

export function serializable(document) {
  const copy = structuredClone(document);
  copy.metadata ||= {};
  copy.metadata.updatedAt = new Date().toISOString();
  return copy;
}
