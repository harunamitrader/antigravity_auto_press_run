import http from 'http';
import WebSocket from 'ws';

// 設定
const CDP_PORTS = [9222, 9000, 9001, 9002, 9003];
const POLLING_INTERVAL = 1000;

// 自動クリック対象のボタンテキスト（優先順位順）
const TARGET_KEYWORDS = [
    'Allow This Conversation',
    'Allow Once',
    'Run',
    'Allow',
    'Approve',
    'Yes',
    '実行',
    '許可',
    '承認',
    'はい'
];

let cdpWs = null;
let isPolling = false;
let checkInterval = null;
let messageIdCounter = 1;
const pendingRequests = new Map();

/**
 * 簡易ログ出力
 */
function log(msg) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${msg}`);
}

/**
 * Promise ベースで CDP メッセージを送信する
 */
function sendCdpMessage(method, params = {}) {
    return new Promise((resolve, reject) => {
        if (!cdpWs || cdpWs.readyState !== WebSocket.OPEN) {
            return reject(new Error('WebSocket is not open'));
        }
        const id = messageIdCounter++;
        pendingRequests.set(id, { resolve, reject, method });
        const payload = JSON.stringify({ id, method, params });
        cdpWs.send(payload);

        // タイムアウト設定(10秒)
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error(`Timeout: ${method}`));
            }
        }, 10000);
    });
}

/**
 * Antigravity (Chrome DevTools Protocol) の WebSocket URL を探す
 */
async function findAntigravityTarget() {
    for (const port of CDP_PORTS) {
        try {
            const targets = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
                    let data = '';
                    res.on('data', chunk => { data += chunk; });
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                req.on('error', reject);
                req.setTimeout(500, () => {
                    req.abort();
                    reject(new Error('Timeout'));
                });
            });

            // Antigravity の画面（index.html など）を探す
            for (const target of targets) {
                if (target.type === 'page' && target.webSocketDebuggerUrl) {
                    const title = (target.title || '').toLowerCase();
                    const url = (target.url || '').toLowerCase();
                    // Antigravityのタブ、または関連するローカルのURL
                    if (title.includes('antigravity') || url.includes('vscode-file://') || url.includes('localhost') || url.includes('127.0.0.1')) {
                        log(`Found target on port ${port}: ${target.title || target.url}`);
                        return target.webSocketDebuggerUrl;
                    }
                }
            }
        } catch (e) {
            // ポートが開いていない場合は無視して次へ
            continue;
        }
    }
    return null;
}

/**
 * Antigravityの画面にCDP接続する
 */
async function connectToAntigravity() {
    if (cdpWs) return;

    const wsUrl = await findAntigravityTarget();
    if (!wsUrl) {
        // 見つからなければ少し待って再試行
        setTimeout(connectToAntigravity, 3000);
        return;
    }

    log(`Connecting to CDP: ${wsUrl}`);
    cdpWs = new WebSocket(wsUrl);

    cdpWs.on('open', async () => {
        log('Connected to Antigravity UI!');
        // DOMエージェントを有効化
        try {
            await sendCdpMessage('DOM.enable');
            startPolling();
        } catch (e) {
            log(`Failed to enable DOM: ${e.message}`);
        }
    });

    cdpWs.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.id && pendingRequests.has(msg.id)) {
            const { resolve, reject } = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            if (msg.error) {
                reject(msg.error);
            } else {
                resolve(msg.result);
            }
        }
    });

    cdpWs.on('close', () => {
        log('Connection closed. Reconnecting...');
        cleanup();
        setTimeout(connectToAntigravity, 3000);
    });

    cdpWs.on('error', (err) => {
        log(`WebSocket error: ${err.message}`);
        cleanup();
    });
}

/**
 * 接続が切れた後のクリーンアップ
 */
function cleanup() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    isPolling = false;
    cdpWs = null;
    for (const req of pendingRequests.values()) {
        req.reject(new Error('Connection closed'));
    }
    pendingRequests.clear();
}

/**
 * 定期的に画面全体のDOMツリーを取得し、ボタンを探す
 */
function startPolling() {
    if (isPolling) return;
    isPolling = true;

    checkInterval = setInterval(async () => {
        if (!cdpWs || cdpWs.readyState !== WebSocket.OPEN) return;

        try {
            await checkForButtons();
        } catch (e) {
            // CDPエラーは一時的な場合が多いのでログは最小限に
            // log(`Polling error: ${e.message}`);
        }
    }, POLLING_INTERVAL);
}

/**
 * DOMツリーを探査して、クリック対象のボタンを見つける
 */
async function checkForButtons() {
    // 画面全体のルートノードを取得
    const docResult = await sendCdpMessage('DOM.getDocument', { depth: -1 });
    const rootNodeId = docResult.root.nodeId;

    // button 要素 または role="button" の要素を検索するクエリ
    const queryResult = await sendCdpMessage('DOM.querySelectorAll', {
        nodeId: rootNodeId,
        selector: 'button, div[role="button"]'
    });

    const nodeIds = queryResult.nodeIds || [];
    if (nodeIds.length === 0) return;

    for (const nodeId of nodeIds) {
        // ボタンのテキストや属性を取得
        const outerHtmlResult = await sendCdpMessage('DOM.getOuterHTML', { nodeId });
        const html = (outerHtmlResult.outerHTML || '').toLowerCase();

        // ターゲットキーワードに合致するかチェック（簡易的にHTML文字列から検索）
        let matchedKeyword = null;
        for (const kw of TARGET_KEYWORDS) {
            // HTMLタグを除去したテキストに近い形でマッチしたいが、
            // 今回は簡易的にouterHTML内にキーワードが含まれるか(>Allow< のように)で判定
            const lowerKw = kw.toLowerCase();
            if (html.includes(`>${lowerKw}<`) || html.includes(`">${lowerKw}<`) || html.includes(` ${lowerKw}<`) || html.includes(`>${lowerKw} `)) {
                matchedKeyword = kw;
                break;
            }
        }

        if (matchedKeyword) {
            // BoxModelを取得して座標を計算
            const boxResult = await sendCdpMessage('DOM.getBoxModel', { nodeId });
            const quad = boxResult.model.content;
            // quad = [x1, y1, x2, y2, x3, y3, x4, y4]
            const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
            const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

            log(`Auto-clicking button: [${matchedKeyword}] at (${Math.round(x)}, ${Math.round(y)})`);

            // クリックイベントを発行
            await sendCdpMessage('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x,
                y,
                button: 'left',
                clickCount: 1
            });
            await sendCdpMessage('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x,
                y,
                button: 'left',
                clickCount: 1
            });

            // 1回のループで1クリックのみ。複数ある場合は次回ループで。
            return;
        }
    }
}

// 起動時に監視開始
log('Starting Auto Accept background process...');
connectToAntigravity();
