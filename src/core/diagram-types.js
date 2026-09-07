import { id } from './document.js';
import { registerDiagramType } from './registry.js';

export const classRelationships = [
  ['association', '関連'], ['aggregation', '集約'], ['composition', 'コンポジション'],
  ['inheritance', '継承'], ['realization', '実現'], ['dependency', '依存']
];
export const messageTypes = [['sync', '同期'], ['async', '非同期'], ['return', '戻り'], ['create', '生成'], ['destroy', '破棄']];

registerDiagramType({
  type: 'class', label: 'クラス図', description: 'クラス、属性、操作と関係を設計します', icon: '◇',
  elementLabel: 'クラス', relationships: classRelationships,
  createElement: (index) => ({ id: id('class'), kind: 'class', name: `Class${index + 1}`, x: 120 + index * 36, y: 100 + index * 36, width: 260, attributes: [], operations: [], note: '' })
});
registerDiagramType({
  type: 'sequence', label: 'シーケンス図', description: 'オブジェクト間のメッセージを時系列で設計します', icon: '⇥',
  elementLabel: 'オブジェクト', relationships: messageTypes,
  createElement: (index) => ({ id: id('object'), kind: 'participant', name: `object${index + 1}`, x: 140 + index * 260, y: 70, width: 170, note: '' })
});
