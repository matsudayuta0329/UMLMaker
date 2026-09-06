const CLASS_RELATIONSHIPS = {
  association: '関連', aggregation: '集約', composition: 'コンポジション',
  inheritance: '継承', realization: '実現', dependency: '依存'
};

const MESSAGE_TYPES = {
  sync: '同期', async: '非同期', return: '戻り', create: '生成', destroy: '破棄'
};

function present(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== '' && value !== null && value !== undefined;
  }));
}

function common(document, diagramLabel) {
  return present({
    用途: 'AIへのUML設計指示',
    図の種類: diagramLabel,
    タイトル: document.title,
    設計概要: document.metadata?.description || ''
  });
}

function classExport(document) {
  const names = new Map(document.elements.map(element => [element.id, element.name]));
  return {
    ...common(document, 'クラス図'),
    クラス一覧: document.elements.map(element => present({
      クラス名: element.name,
      属性: (element.attributes || []).map(value => `- ${value.replace(/^[-+#~]\s*/, '')}`),
      操作: (element.operations || []).map(value => `+ ${value.replace(/^[-+#~]\s*/, '')}`),
      メモ: element.note || ''
    })),
    関係一覧: document.relationships.map(relationship => present({
      接続元クラス: names.get(relationship.sourceId) || relationship.sourceId,
      接続先クラス: names.get(relationship.targetId) || relationship.targetId,
      関係: CLASS_RELATIONSHIPS[relationship.type] || relationship.type,
      ラベル: relationship.label || '',
      メモ: relationship.note || ''
    })),
    図全体のメモ: (document.notes || []).map(note => note.text).filter(Boolean)
  };
}

function sequenceExport(document) {
  const names = new Map(document.elements.map(element => [element.id, element.name]));
  const orderedMessages = [...document.relationships].sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
  return {
    ...common(document, 'シーケンス図'),
    オブジェクト一覧: document.elements.map((element, index) => present({
      順番: index + 1,
      オブジェクト名: element.name,
      メモ: element.note || ''
    })),
    処理フロー: orderedMessages.map((message, index) => present({
      順序: index + 1,
      送信元: names.get(message.sourceId) || message.sourceId,
      送信先: names.get(message.targetId) || message.targetId,
      処理: message.label || '',
      種類: MESSAGE_TYPES[message.type] || message.type,
      メモ: message.note || ''
    })),
    図全体のメモ: (document.notes || []).map(note => note.text).filter(Boolean)
  };
}

export function createAiInstruction(document) {
  if (document.diagramType === 'class') return classExport(document);
  if (document.diagramType === 'sequence') return sequenceExport(document);
  throw new Error(`AI指示用JSONに未対応の図タイプです: ${document.diagramType}`);
}

export function createAiInstructionText(document) {
  return JSON.stringify(createAiInstruction(document), null, 2);
}
