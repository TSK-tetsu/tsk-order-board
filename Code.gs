/**
 * TSK 発注・納期ボード — Google Apps Script バックエンド
 * 1枚のスプレッドシートに orders / projects / tasks / meetings の4シートを自動作成し、
 * 各行を「id / json / updatedAt」で保存します。
 */
// 合言葉（PIN）はソースに書かず、スクリプトプロパティ「PIN」に入れる（プロジェクトの設定 → スクリプト プロパティ）。未設定なら全て拒否
const SHEET_ID = "";            // 空なら、このスクリプトが紐づくスプレッドシートを使う
const COLS = ["orders", "projects", "tasks", "meetings"];

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  const ss = ss_(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(["id", "json", "updatedAt"]); sh.setFrozenRows(1); }
  return sh;
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function auth_(pin) { const p = PropertiesService.getScriptProperties().getProperty("PIN"); return !!p && pin === p; }

function readAll_() {
  const data = {};
  COLS.forEach(c => {
    const v = sheet_(c).getDataRange().getValues(); data[c] = [];
    for (let i = 1; i < v.length; i++) { if (!v[i][0]) continue; try { data[c].push(Object.assign({ id: String(v[i][0]) }, JSON.parse(v[i][1]))); } catch (e) {} }
  });
  return data;
}

function doGet(e) {
  if (!auth_(e.parameter.pin)) return out_({ ok: false, error: "unauthorized" });
  return out_({ ok: true, data: readAll_() });
}

function doPost(e) {
  let body; try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: "bad json" }); }
  if (!auth_(body.pin)) return out_({ ok: false, error: "unauthorized" });
  if (COLS.indexOf(body.col) < 0 || !body.id) return out_({ ok: false, error: "bad request" });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_(body.col); const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(r => String(r[0]));
    const row = ids.indexOf(String(body.id)) + 1; // 0 = 無し
    if (body.action === "delete") { if (row > 1) sh.deleteRow(row); return out_({ ok: true }); }
    if (body.action === "set") {
      const vals = [String(body.id), JSON.stringify(body.data || {}), new Date().toISOString()];
      if (row > 1) sh.getRange(row, 1, 1, 3).setValues([vals]); else sh.appendRow(vals);
      mirrorLedger_(); return out_({ ok: true });
    }
    return out_({ ok: false, error: "unknown action" });
  } finally { lock.releaseLock(); }
}

/** 人が読む用の「台帳」シートを毎回作り直す（TSK_工事台帳への転記はここを起点にする） */
function mirrorLedger_() {
  const d = readAll_(); const pj = {}; d.projects.forEach(p => pj[p.id] = p);
  const rows = d.orders.map(o => { const p = pj[o.projectId] || {}; return [p.client || "", p.spec || "", p.k || o.k || "", o.item || "", o.supplier || "", o.orderDate || "", o.due || "", o.status || "", (o.updatedAt || "").slice(0, 10)]; })
    .sort((a, b) => (a[2] + a[6]).localeCompare(b[2] + b[6]));
  const ss = ss_(); let sh = ss.getSheetByName("台帳"); if (!sh) sh = ss.insertSheet("台帳");
  sh.clearContents(); sh.appendRow(["宛先", "仕様", "工事番号", "品名", "仕入先", "発注日", "納期予定", "状態", "最終更新"]);
  if (rows.length) sh.getRange(2, 1, rows.length, 9).setValues(rows);
}
