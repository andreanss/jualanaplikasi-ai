"use strict";
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("./db");

const SESSION_COOKIE = "jaa_sess";
const SESSION_MS = 1000 * 60 * 60 * 12; // 12 jam

function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  const a = Buffer.from(calc, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function checkLogin(pw) {
  return verifyPassword(pw, getSetting("admin_password"));
}

function changePassword(newPw) {
  const { hashPassword } = require("./db");
  setSetting("admin_password", hashPassword(newPw));
}

function createSession() {
  const token = crypto.randomBytes(28).toString("hex");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)").run(
    token,
    now,
    now + SESSION_MS
  );
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  return { token, maxAge: Math.floor(SESSION_MS / 1000) };
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionFrom(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return row;
}

function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Middleware: wajib login admin. */
function requireAdmin(req, res, next) {
  req.admin = sessionFrom(req);
  if (req.admin) return next();
  const base = req.BASE || "";
  return res.redirect(base + "/admin/login?next=" + encodeURIComponent(req.originalUrl));
}

module.exports = {
  SESSION_COOKIE,
  checkLogin,
  changePassword,
  createSession,
  sessionFrom,
  destroySession,
  requireAdmin,
  parseCookies,
};
