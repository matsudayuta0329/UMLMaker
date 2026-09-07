# UML Maker JSON format v2

UML MakerのJSONは、描画の再現に必要な座標と、AIが設計意図を理解するための意味情報を一緒に保持します。

この形式は再編集用のドキュメントJSONです。標準のファイル名は `*.umlmaker.json` です。AIへの貼り付けには、アプリの「AI指示用JSON」を使用します。AI指示用JSONはファイル保存せず、座標・内部ID・接続点などの描画専用情報を除いて日本語キーへ変換されます。

```json
{
  "schema": "umlmaker.document",
  "schemaVersion": 2,
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

属性は `{ id, name, type, visibility }`、操作は `{ id, name, returnType, visibility, parameters }`、引数は `{ id, name, type }` です。`visibility` は `public`, `private`, `protected`, `package` のいずれかです。旧schemaVersion 1の文字列配列は、読み込み時にこの形式へ自動移行されます。

AI指示用JSONでは内部IDを除き、属性を `{ 名前, 型名, 可視性, UML表記 }`、操作を `{ 名前, 返り値型, 可視性, 引数, UML表記 }` として出力します。構造化情報を直接利用できる一方、`UML表記`を読むだけでもクラス定義を把握できます。

## sequence

`elements` は `kind: "participant"` を持ちます。`relationships` はメッセージを表し、`type` は `sync`, `async`, `return`, `create`, `destroy` のいずれかです。`y` がメッセージの時系列位置です。

参加オブジェクトは配列順で左から並び、上下移動や任意座標への配置は行いません。メッセージの `y` が増えると編集キャンバスとライフラインも自動的に延長されます。

## 新しい図タイプの追加

1. `src/core/diagram-types.js` から `registerDiagramType` を呼び、ラベル、要素ファクトリー、関係タイプを登録します。
2. `src/renderer/app.js` にその図固有のノード／関係描画を追加します。
3. `validateDocument` に渡す対応タイプ一覧はレジストリから自動生成されます。
