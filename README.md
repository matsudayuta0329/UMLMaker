# UML Maker

Windowsでクラス図とシーケンス図を編集し、AIが読み取りやすいJSONとして保存するデスクトップアプリです。

## 主な機能

- クラス図: クラス名、属性、操作、メモ、位置、関係タイプを編集
- シーケンス図: オブジェクト、メッセージ、タイプ、メモ、時系列位置を編集
- 要素の上下左右の接続点からドラッグして関係を作成
- JSONの保存、名前を付けて保存、インポート
- 自動保存なし。新規作成時にもファイルを作りません
- レジストリ方式で図タイプを追加可能

## 開発

```powershell
npm install
npm test
npm start
```

Windows向け成果物は `npm run pack:win` で `dist` に生成されます。

## JSON形式

文書は `schema`, `schemaVersion`, `diagramType`, `metadata`, `elements`, `relationships`, `notes` を持ちます。位置情報と設計上の意味を同じファイルに収めているため、AIにはJSONをそのまま設計資料として渡せます。

新しい図タイプは `src/core/diagram-types.js` で定義を登録し、レンダラーに対応する表示アダプターを追加します。
