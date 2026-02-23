![Antigravity Auto Press Run](./header.jpg)

# Antigravity Auto Press Run

**Antigravity Auto Press Run** は、AI コーディングアシスタント「Antigravity（VSCode 拡張機能）」が表示する許可確認ボタン（`Allow Once`・`Allow This Conversation`・`Run` など）を自動でクリックするための、軽量なバックグラウンドスクリプトです。

## 概要

Antigravity は、ファイルアクセスやコマンド実行の許可を求める確認ダイアログを頻繁に表示します。このスクリプトは、Chrome DevTools Protocol（CDP）経由で Antigravity の UI を監視し、対象ボタンを検知次第、自動でクリックします。

---

> [!CAUTION]
> ## ⚠️ 重大な警告：このスクリプトの使用には重大なリスクがあります
>
> このスクリプトは Antigravity が表示する**すべての許可確認を無条件・無検閲で自動承認**します。
>
> これは以下のような**取り返しのつかない操作も自動で許可してしまう**ことを意味します：
>
> - **ファイルの削除・上書き**（プロジェクト全体の消去を含む）
> - **システムコマンドの実行**（管理者権限のある操作も含む）
> - **外部ネットワークへのアクセス・データ送信**
> - **環境変数・秘匿情報（APIキー等）の読み取り**
>
> **ご使用にあたっての最低限の安全策：**
> - 重要なファイルは事前にバックアップを取ること
> - 信頼できるプロンプト・タスクの実行時のみ起動すること
> - AI に大規模な操作をさせていない時間帯は必ず停止すること
> - 本番環境・本番データベースに接続した状態では絶対に使用しないこと
>
> **自己責任でご使用ください。発生した損害について開発者は一切の責任を負いません。**

---
## おすすめの導入方法

antigravityのAIチャットに以下のプロンプトを入力してください。
「https://github.com/harunamitrader/antigravity_auto_press_run を導入して。可能な範囲でAI側で作業を行い、必要な情報があれば質問して。手動で行う必要があるものは丁寧にやり方を教えて。」

導入が完了したら、
「デバッグモード用ショートカットとantigravity_auto_press_runの起動用ショートカットをデスクトップに作成して」
も必要に応じてプロンプトを送信しても良いかもしれません。

導入方法でわからないことやエラーがあれば都度antigravityのAIチャットで質問すればどうにか導入できるはずです。


## 動作前提：Antigravity をデバッグモードで起動する

このスクリプトは Chrome DevTools Protocol（CDP）を使って Antigravity の UI に接続します。そのため、**Antigravity（VSCode）をデバッグポートを有効にした状態で起動する必要があります。**

### VSCode のデバッグポートを有効にする方法

VSCode の起動オプションに `--remote-debugging-port=9222` を追加します。

**方法 1：コマンドラインから起動**

```bash
code --remote-debugging-port=9222
```

**方法 2：ショートカットに引数を追加（Windows）**

1. VSCode のショートカットを右クリック →「プロパティ」
2. 「リンク先」の末尾に ` --remote-debugging-port=9222` を追加
3. 例：`"C:\...\Code.exe" --remote-debugging-port=9222`

> [!NOTE]
> デバッグポートが有効でない状態でこのスクリプトを起動しても、接続に失敗して自動クリックは動作しません。

## 機能

- Antigravity の許可確認ダイアログを 5 秒間隔で自動検知・クリック
- クリック前に「何を許可したか」のコンテキストをログ出力
- 接続が切れた場合は自動で再接続
- 誤爆防止：`Always run` 等の意図しないボタンは除外

## インストール

```bash
git clone https://github.com/<あなたのGitHubユーザー名>/antigravity_auto_press_run.git
cd antigravity_auto_press_run
npm install
```

## 使い方

### 前提：Antigravity をデバッグポート付きで起動してから、このスクリプトを起動してください。

### 方法 1：コマンドラインから起動（推奨）

```bash
npm start
```

### 方法 2：バッチファイルから起動（Windows）

`start_bot.bat` をダブルクリック、またはデスクトップのショートカットから起動します。

### ログの見方

```
[10:30:01] Starting Antigravity Auto Press Run background process...
[10:30:01] Found primary target on port 9222: helloworld - Antigravity
[10:30:01] Connected to Antigravity UI!
[10:30:06] [Action] "Allow Once" ボタンを自動クリックします
  ┗ [Context]
      Allow file access to
      C:\Users\harunami\Desktop\helloworld\discord_interaction.l
      Deny  Allow Once  Allow This Conversation
```

## 自動クリック対象ボタン（優先順位順）

| 優先度 | ボタン名 |
|--------|----------|
| 1 | Allow Once |
| 2 | Allow This Conversation |
| 3 | Run |
| 4 | Allow |
| 5 | Approve / Yes / 実行 / 許可 / 承認 / はい |

`Always run` のような、他コンテキストのボタンは除外されます。

## 設定

`antigravity_auto_press_run.js` の冒頭で以下の値を変更できます。

```js
const CDP_PORTS = [9222, 9000, 9001, 9002, 9003]; // 監視するCDPポート
const POLLING_INTERVAL = 5000;                     // チェック間隔（ミリ秒）
```

## ファイル構成

```
antigravity_auto_press_run/
├── antigravity_auto_press_run.js  # メインスクリプト
├── start_bot.bat                  # Windows用起動バッチファイル
├── package.json
└── README.md
```

## ライセンス

MIT License © harunamitrader
