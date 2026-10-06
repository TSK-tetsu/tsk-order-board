# TSK 発注・納期ボード — ウェブアプリ導入手順

Claudeのログイン不要で、社内の誰でもスマホで開ける形にします。
**構成**：画面＝`index.html`（静的ファイル置き場に置くだけ）／データ＝Googleスプレッドシート（Apps Script経由）／AI整理＝n8n Webhook（任意）

所要時間の目安：30〜40分。手を動かすのは3か所（Googleスプレッドシート、置き場所、index.htmlの設定）。

---

## 手順1：データの置き場（Googleスプレッドシート＋Apps Script）

1. Googleドライブで新しいスプレッドシートを作る。名前は「TSK_発注ボードDB」など
2. メニュー **拡張機能 → Apps Script** を開く
3. 最初から入っている `function myFunction(){}` を全部消し、`Code.gs` の中身を貼り付ける
4. 合言葉（PIN）はソースに書かない。左の歯車 **プロジェクトの設定 → スクリプト プロパティ → スクリプト プロパティを追加** で、プロパティ `PIN`・値に社内の合言葉を入れて保存（未設定のあいだは全員拒否）
5. 右上 **デプロイ → 新しいデプロイ** → 種類の歯車で「**ウェブアプリ**」
   - 説明：任意
   - 次のユーザーとして実行：**自分**
   - アクセスできるユーザー：**全員**（合言葉で守るのでこれで可）
6. **デプロイ** → 初回は「アクセスを承認」→ 自分のGoogleアカウントを選ぶ → 「詳細」→「（安全ではないページ）に移動」→ 許可
7. 表示される **ウェブアプリのURL（…/exec で終わる）をコピー**

> 以後 Code.gs を直したら、**デプロイ → デプロイを管理 → 鉛筆 → バージョン「新バージョン」→ デプロイ** で更新。URLは変わりません。

---

## 手順2：index.html の設定

`index.html` をテキストエディタで開き、上の方にある `const CONFIG={ ... }` を書き換える。

```js
const CONFIG={
  API_URL:"https://script.google.com/macros/s/XXXXX/exec",  // 手順1-7のURL
  PIN:"",                                                     // 空のまま（公開ページのソースに合言葉を書かない）
  AI_URL:"",                                                  // 手順4で設定（最初は空でよい）
  POLL_MS:8000
};
```

合言葉は、各端末で初めて開いたときに入力欄が出るので、そこで1回だけ入れる（その端末に保存される）。違っていれば入力し直しの画面が出る。

---

## 手順3：画面の置き場（どれか1つ）

### A. Netlify Drop（いちばん簡単・アカウント不要で試せる）
1. https://app.netlify.com/drop を開く
2. `index.html` `manifest.json` `icon-192.png` `icon-512.png` の4ファイルが入った**フォルダごと**ドラッグ＆ドロップ
3. 発行されたURL（`https://xxxx.netlify.app`）がアプリのURL。無料登録するとURLを固定・変更できます

### B. GitHub Pages（toraさん向け・更新管理がしやすい）
Claude Code にそのまま貼ってください：

```
このフォルダ（index.html, manifest.json, icon-192.png, icon-512.png, Code.gs, README_導入手順.md）を
GitHubの新しいプライベートリポジトリ tsk-order-board に push し、GitHub Pages を main ブランチの / で有効化して、
公開URLを教えてください。Code.gs と README はリポジトリに含めるが Pages 配信には不要です。
```

### C. 既存の社内サーバー／レンタルサーバー
4ファイルを同じフォルダにアップロードするだけ。`https://` 必須（ホーム画面追加・音声入力・コピーがhttpでは動きません）。

---

## 手順4（任意）：議事録の「AIで整理する」を有効にする

n8n（https://tskai.app.n8n.cloud）に Webhook を1本立てます。Claude Code / n8n-MCP への指示：

```
n8n に「TSK発注ボード AI整理」ワークフローを作成：
1) Webhook（POST, path: tsk-order-ai, Respond: Using 'Respond to Webhook' node）
2) IF：body.pin が "tsk2026" と一致しなければ 401 で終了
3) Anthropic Chat Model（claude-sonnet-4-6）に body.prompt をそのまま user メッセージとして送る。system: 「JSONのみを返す。前置き・コードフェンス禁止」
4) Code ノードで応答テキストから ```json フェンスを除去し JSON.parse、失敗時は {"summary":"","tasks":[],"orders":[]}
5) Respond to Webhook：Content-Type application/json、Access-Control-Allow-Origin: * を付けて、そのJSONを返す
公開URL（Production URL）を教えてください。
```

出てきた Production URL を `CONFIG.AI_URL` に入れ、index.html を置き直す。

---

## 手順5：スマホに「アプリとして」入れる（各自）

- **iPhone**：SafariでアプリURLを開く → 共有ボタン → **ホーム画面に追加** → 追加
- **Android**：ChromeでURLを開く → 右上「︙」→ **ホーム画面に追加**（または「アプリをインストール」）

TSKのネイビー×ゴールドのアイコンが並び、タップで全画面起動します。入力は8秒以内に全員の画面へ反映されます。

---

## 動作確認チェック
- [ ] アプリを開いてヘッダーが「0件」などになる（「接続できません」ならAPI_URLかPINの不一致）
- [ ] 発注を1件追加 → スプレッドシートの `orders` シートに行が増え、`台帳` シートに人が読める形で載る
- [ ] 別のスマホで同じURLを開く → さっきの1件が見える
- [ ] 台帳タブ → 「CSVを保存」でファイルが落ちる

## データの流れ
```
スマホ/PC（index.html）──POST──▶ Apps Script ──▶ シート orders/projects/tasks/meetings（1行＝1レコード、json列）
                     ◀──GET 8秒ごと──┘            └──▶ 「台帳」シート（人が読む用・毎回再生成）
                                                           └─▶ ここから TSK_工事台帳 への転記を n8n で（次フェーズ）
```

## よくあるつまずき
- **「接続できません」**：URL末尾が `/exec` か、デプロイの「アクセスできるユーザー」が「全員」か（Google Workspace は管理コンソールで外部公開が許可されているか）
- **合言葉の入力画面が何度も出る**：スクリプトプロパティ `PIN` が未設定か、入力した合言葉と違う
- **反映が遅い**：Apps Script の都合で1〜2秒かかります。画面は先に更新されるので操作感には影響しません
- **音声入力が出ない**：https で開いているか。iPhoneはSafariのみ対応
- **Code.gs を直したのに変わらない**：「新バージョン」でデプロイし直したか
