# UML Maker JSON format v1

UML MakerのJSONは、描画の再現に必要な座標と、AIが設計意図を理解するための意味情報を一緒に保持します。

```json
{
  "schema": "umlmaker.document",
  "schemaVersion": 1,
  "diagramType": "class",
  "title": "注文ドメイン",
  "metadata": {
    "description": "ECサイトの注文処理",
    "createdAt": "2026-09-07T00:00:00.000Z",
    "updatedAt": "2026-09-07T00:10:00.000Z"
  },
  "elements": [],
  "relationships": [],
  "notes": []
}
```

## class

`elements` は `kind: "class"` を持ち、`name`, `attributes[]`, `operations[]`, `note`, `x`, `y`, `width` を格納します。関係の `type` は `association`, `aggregation`, `composition`, `inheritance`, `realization`, `dependency` のいずれかです。

## sequence

`elements` は `kind: "participant"` を持ちます。`relationships` はメッセージを表し、`type` は `sync`, `async`, `return`, `create`, `destroy` のいずれかです。`y` がメッセージの時系列位置です。

## 新しい図タイプの追加

1. `src/core/diagram-types.js` から `registerDiagramType` を呼び、ラベル、要素ファクトリー、関係タイプを登録します。
2. `src/renderer/app.js` にその図固有のノード／関係描画を追加します。
3. `validateDocument` に渡す対応タイプ一覧はレジストリから自動生成されます。
