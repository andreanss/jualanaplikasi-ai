"use strict";
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

/** Hash password: scrypt dengan salt acak. Format: salt:hash */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return salt + ":" + hash;
}

const DEFAULTS = {
  company_name: "JualanAplikasiAI",
  company_email: "terrasolusi.net@gmail.com",
  company_address: "Jl. Raya Jatimekar, Gg. Suci No. 11, Jatimekar, Jatiasih, Kota Bekasi, Jawa Barat",
  owner_wa: "6287846107464",
  owner_name: "Mohamad Chaeruddin",
  bank_name: "BCA",
  bank_account: "6755587765",
  bank_holder: "Mohamad Chaeruddin",
  qris_static: "",
  qris_merchant: "",
  qris_nmid: "",
  wa_gateway_url: "https://api.fonnte.com/send",
  wa_gateway_token: "",
  invoice_prefix: "INV",
  counter_year: String(new Date().getFullYear()),
  counter_seq: "0",
  admin_password: hashPassword("admin123"),
};

/** Buat tabel + isi default. Dijalankan sekali dalam satu transaksi. */
const bootstrap = db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      number        TEXT NOT NULL UNIQUE,
      token         TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_wa   TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      company       TEXT NOT NULL DEFAULT '',
      note          TEXT NOT NULL DEFAULT '',
      amount        INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'unpaid',
      qris_payload  TEXT NOT NULL DEFAULT '',
      due_date      TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL,
      claimed_at    TEXT,
      paid_at       TEXT,
      paid_method   TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      qty        INTEGER NOT NULL DEFAULT 1,
      price      INTEGER NOT NULL DEFAULT 0,
      position   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      kind       TEXT NOT NULL,
      audience   TEXT NOT NULL,
      target     TEXT NOT NULL,
      body       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      error      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      sent_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_messages_invoice ON messages(invoice_id);
  `);

  const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULTS)) insert.run(k, v);
});
bootstrap();

function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value ?? ""));
}

function allSettings() {
  const out = { ...DEFAULTS };
  for (const row of db.prepare("SELECT key, value FROM settings").all()) out[row.key] = row.value;
  return out;
}

module.exports = { db, DB_PATH, getSetting, setSetting, allSettings, hashPassword };
