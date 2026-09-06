import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiInstruction } from '../src/core/ai-export.js';

test('class AI export lists classes before Japanese relationships without coordinates or ids', () => {
  const result = createAiInstruction({
    diagramType: 'class', title: '注文', metadata: { description: '注文設計' },
    elements: [
      { id: 'a', name: 'Order', attributes: ['id: string'], operations: ['save()'], note: '' },
      { id: 'b', name: 'Customer', attributes: [], operations: [], note: '購入者' }
    ],
    relationships: [{ sourceId: 'a', targetId: 'b', type: 'association', label: '', note: '' }], notes: []
  });
  assert.deepEqual(Object.keys(result), ['用途', '図の種類', 'タイトル', '設計概要', 'クラス一覧', '関係一覧', '図全体のメモ']);
  assert.deepEqual(result.クラス一覧[0].属性, ['- id: string']);
  assert.deepEqual(result.クラス一覧[0].操作, ['+ save()']);
  assert.deepEqual(result.関係一覧[0], { 接続元クラス: 'Order', 接続先クラス: 'Customer', 関係: '関連' });
  assert.equal(JSON.stringify(result).includes('sourceId'), false);
  assert.equal(JSON.stringify(result).includes('"x"'), false);
});

test('sequence AI export orders messages by time and uses Japanese labels', () => {
  const result = createAiInstruction({
    diagramType: 'sequence', title: 'ログイン', metadata: {},
    elements: [{ id: 'ui', name: '画面' }, { id: 'api', name: 'API' }],
    relationships: [
      { sourceId: 'api', targetId: 'ui', type: 'return', label: '結果', y: 400 },
      { sourceId: 'ui', targetId: 'api', type: 'sync', label: '認証', y: 200 }
    ], notes: []
  });
  assert.equal(result.処理フロー[0].処理, '認証');
  assert.equal(result.処理フロー[0].種類, '同期');
  assert.equal(result.処理フロー[1].種類, '戻り');
});
