"use strict";
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const QRCode = require("qrcode");

const { db, allSettings, getSetting, setSetting } = require("./lib/db");
const qris = require("./lib/qris");
const wa = require("./lib/wa");
const auth = require("./lib/auth");
const pub = require("./views/public");
const adm = require("./views/admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "24mb" }));
app.use(express.json({ limit: "24mb" }));

/** Prefix publik dari platform ("" bila lewat domain kustom). */
app.use((req, _res, next) => {
  req.BASE = req.headers["x-public-base-path"] || "";
  next();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  })
);

/* ------------------------------- helpers -------------------------------- */

function origin(req) {
  const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
  return `${proto}://${req.headers.host}`;
}
const absBase = (req) => origin(req) + req.BASE;
const invoiceUrl = (req, token) => `${absBase(req)}/i/${token}`;

function toArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

const nextNumber = db.transaction((prefix) => {
  const year = String(new Date().getFullYear());
  let counterYear = getSetting("counter_year", year);
  let seq = parseInt(getSetting("counter_seq", "0"), 10) || 0;
  if (counterYear !== year) {
    counterYear = year;
    seq = 0;
    setSetting("counter_year", year);
  }
  seq += 1;
  setSetting("counter_seq", String(seq));
  return `${prefix}/${year}/${String(seq).padStart(4, "0")}`;
});

function newToken() {
  let token;
  do {
    token = crypto.randomBytes(16).toString("hex");
  } while (db.prepare("SELECT 1 FROM invoices WHERE token = ?").get(token));
  return token;
}

function createInvoiceRow({ number, token, customer, items, dueDate, note, amount, qrisPayload }) {
  const now = new Date().toISOString();
  const insert = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO invoices (number, token, customer_name, customer_wa, customer_email, company,
           note, amount, status, qris_payload, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)`
      )
      .run(
        number,
        token,
        customer.name,
        wa.normalizeWa(customer.wa),
        customer.email,
        customer.company,
        note,
        amount,
        qrisPayload,
        dueDate,
        now
      );
    const invoiceId = info.lastInsertRowid;
    const itemStmt = db.prepare(
      "INSERT INTO invoice_items (invoice_id, name, qty, price, position) VALUES (?, ?, ?, ?, ?)"
    );
    items.forEach((it, i) => itemStmt.run(invoiceId, it.name, it.qty, it.price, i));
    return invoiceId;
  });
  return insert();
}

async function notify(req, invoiceId, kind) {
  const settings = allSettings();
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position").all(invoiceId);
  const entries = wa
    .buildMessages({
      kind,
      invoice,
      items,
      settings,
      link: invoiceUrl(req, invoice.token),
      adminLink: `${absBase(req)}/admin/invoice/${invoice.id}`,
    })
    .map((m) => ({ ...m, invoice_id: invoice.id, kind }));
  if (!entries.length) return { queued: 0, sent: 0 };
  const ids = wa.queueMessages(entries);
  const result = await wa.autoSendPending(invoice.id, settings);
  return { queued: ids.length, sent: result.sent, gateway: Boolean((settings.wa_gateway_token || "").trim()) };
}

/* ------------------------------- situs publik ---------------------------- */

app.get("/", (req, res) => {
  res.type("html").send(pub.home(allSettings(), req.BASE));
});

app.get("/invoice", (req, res) => {
  const settings = allSettings();
  res.send(pub.lookup({ base: req.BASE, settings, error: String(req.query.e || "") }));
});

app.post("/invoice", (req, res) => {
  const number = String(req.body.number || "").trim();
  const waInput = wa.normalizeWa(req.body.wa);
  const row = db
    .prepare("SELECT * FROM invoices WHERE upper(number) = upper(?)")
    .get(number.replace(/\s+/g, " "));
  if (!row || row.customer_wa !== waInput) {
    return res.send(
      pub.lookup({
        base: req.BASE,
        settings: allSettings(),
        error: "Nomor invoice dan nomor WhatsApp tidak cocok. Periksa kembali atau hubungi admin.",
        values: { number, wa: req.body.wa },
      })
    );
  }
  res.redirect(`${req.BASE}/i/${row.token}`);
});

function loadInvoiceByToken(token) {
  const invoice = db.prepare("SELECT * FROM invoices WHERE token = ?").get(token);
  if (!invoice) return null;
  invoice.items = db
    .prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position")
    .all(invoice.id);
  return invoice;
}

app.get("/i/:token", (req, res) => {
  const invoice = loadInvoiceByToken(req.params.token);
  if (!invoice) return res.status(404).send(pub.notFound(req.BASE));
  res.send(
    pub.invoicePage({
      base: req.BASE,
      settings: allSettings(),
      invoice,
      items: invoice.items,
      claimNotice: req.query.claim ? "Konfirmasi terkirim. Terima kasih — admin akan memverifikasi pembayaran Anda." : "",
      error: String(req.query.e || ""),
    })
  );
});

app.get("/i/:token/qris.png", async (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE token = ?").get(req.params.token);
  if (!invoice || !invoice.qris_payload) return res.status(404).end();
  try {
    const buf = await QRCode.toBuffer(invoice.qris_payload, {
      type: "png",
      width: 560,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#04231AFF", light: "#FFFFFFFF" },
    });
    res.type("png").setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (err) {
    console.error("Gagal membuat QR:", err.message);
    res.status(500).end();
  }
});

app.post("/i/:token/claim", async (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE token = ?").get(req.params.token);
  if (!invoice) return res.status(404).send(pub.notFound(req.BASE));
  if (invoice.status === "paid") return res.redirect(`${req.BASE}/i/${invoice.token}`);
  if (invoice.status !== "claimed") {
    db.prepare("UPDATE invoices SET status='claimed', claimed_at=? WHERE id=? AND status='unpaid'").run(
      new Date().toISOString(),
      invoice.id
    );
    await notify(req, invoice.id, "claimed");
  }
  res.redirect(`${req.BASE}/i/${invoice.token}?claim=1`);
});

/* --------------------------------- admin -------------------------------- */

app.get("/admin/login", (req, res) => {
  if (auth.sessionFrom(req)) return res.redirect(`${req.BASE}/admin`);
  res.send(
    adm.login({
      base: req.BASE,
      error: String(req.query.e || ""),
      next: String(req.query.next || ""),
      isDefault: auth.checkLogin ? isDefaultPassword() : false,
    })
  );
});

function isDefaultPassword() {
  return auth.checkLogin("admin123");
}

app.post("/admin/login", (req, res) => {
  const { password, next } = req.body;
  if (!auth.checkLogin(password || "")) {
    return res.send(
      adm.login({ base: req.BASE, error: "Kata sandi salah.", next: String(next || ""), isDefault: isDefaultPassword() })
    );
  }
  const { token, maxAge } = auth.createSession();
  res.cookie(auth.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: maxAge * 1000,
    path: "/",
  });
  const target = String(next || "").startsWith("/") ? String(next) : "/admin";
  res.redirect(req.BASE + target);
});

app.post("/admin/logout", (req, res) => {
  auth.destroySession(req);
  res.clearCookie(auth.SESSION_COOKIE, { path: "/" });
  res.redirect(`${req.BASE}/admin/login`);
});

app.get("/admin", auth.requireAdmin, (req, res) => {
  const settings = allSettings();
  const invoices = db
    .prepare(
      `SELECT i.*, (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS item_count
       FROM invoices i ORDER BY i.id DESC LIMIT 60`
    )
    .all();
  const count = db.prepare("SELECT COUNT(*) c FROM invoices").get().c;
  const total = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM invoices").get().s;
  const unpaid = db
    .prepare("SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM invoices WHERE status='unpaid'")
    .get();
  const claimed = db
    .prepare("SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM invoices WHERE status='claimed'")
    .get();
  const paid = db
    .prepare("SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM invoices WHERE status='paid'")
    .get();
  const messages = db
    .prepare(
      `SELECT m.*, i.number AS invoice_no FROM messages m
       LEFT JOIN invoices i ON i.id = m.invoice_id
       ORDER BY CASE m.status WHEN 'pending' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END, m.id DESC
       LIMIT 40`
    )
    .all();

  res.send(
    adm.dashboard({
      base: req.BASE,
      settings,
      invoices,
      messages,
      stats: {
        count,
        total,
        unpaidCount: unpaid.c,
        unpaidAmount: unpaid.s,
        claimedCount: claimed.c,
        claimedAmount: claimed.s,
        paidCount: paid.c,
        paidAmount: paid.s,
      },
      notice: String(req.query.notice || ""),
    })
  );
});

app.get("/admin/invoice/new", auth.requireAdmin, (req, res) => {
  res.send(adm.newInvoice({ base: req.BASE, settings: allSettings(), error: String(req.query.e || "") }));
});

app.post("/admin/invoice", auth.requireAdmin, async (req, res) => {
  const settings = allSettings();
  const body = req.body;

  const customer = {
    name: String(body.customer_name || "").trim(),
    wa: String(body.customer_wa || "").trim(),
    email: String(body.customer_email || "").trim(),
    company: String(body.company || "").trim(),
  };

  const names = toArray(body.item_name).map((v) => String(v || "").trim());
  const qtys = toArray(body.item_qty);
  const prices = toArray(body.item_price);
  const items = [];
  for (let i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    const qty = Math.max(1, parseInt(qtys[i], 10) || 1);
    const price = Math.max(0, parseInt(String(prices[i] || "0").replace(/\D/g, ""), 10) || 0);
    items.push({ name: names[i], qty, price });
  }

  const amount = items.reduce((sum, it) => sum + it.qty * it.price, 0);

  if (!customer.name || !wa.normalizeWa(customer.wa) || !items.length || amount <= 0) {
    return res.send(
      adm.newInvoice({
        base: req.BASE,
        settings,
        error: "Nama customer, nomor WhatsApp, minimal satu item, dan total di atas Rp 0 wajib diisi.",
        values: body,
      })
    );
  }

  let qrisPayload = "";
  let qrisWarning = "";
  if (settings.qris_static) {
    try {
      qrisPayload = qris.toDynamic(settings.qris_static, amount);
    } catch (err) {
      qrisWarning = "QRIS gagal dibuat: " + err.message;
    }
  }

  const token = newToken();
  const number = nextNumber(settings.invoice_prefix || "INV");
  const invoiceId = createInvoiceRow({
    number,
    token,
    customer,
    items,
    dueDate: String(body.due_date || ""),
    note: String(body.note || "").trim(),
    amount,
    qrisPayload,
  });

  const n = await notify(req, invoiceId, "invoice");
  const notice =
    `Invoice ${number} dibuat. ${n.queued} notifikasi WhatsApp tersusun` +
    (n.gateway ? `, ${n.sent} terkirim otomatis.` : " — kirim dengan tombol WhatsApp di dashboard.") +
    (qrisWarning ? " " + qrisWarning : "");

  res.redirect(`${req.BASE}/admin/invoice/${invoiceId}?notice=${encodeURIComponent(notice)}`);
});

app.get("/admin/invoice/:id(\\d+)", auth.requireAdmin, (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!invoice) return res.redirect(`${req.BASE}/admin`);
  const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position").all(invoice.id);
  const messages = db
    .prepare("SELECT * FROM messages WHERE invoice_id = ? ORDER BY id DESC")
    .all(invoice.id);
  res.send(
    adm.invoiceDetail({
      base: req.BASE,
      settings: allSettings(),
      invoice,
      items,
      messages,
      notice: String(req.query.notice || ""),
      publicUrl: invoiceUrl(req, invoice.token),
    })
  );
});

app.post("/admin/invoice/:id(\\d+)/paid", auth.requireAdmin, async (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!invoice) return res.redirect(`${req.BASE}/admin`);
  if (invoice.status !== "paid") {
    db.prepare("UPDATE invoices SET status='paid', paid_at=?, paid_method=? WHERE id=?").run(
      new Date().toISOString(),
      String(req.body.paid_method || "QRIS"),
      invoice.id
    );
    await notify(req, invoice.id, "paid");
  }
  res.redirect(
    `${req.BASE}/admin/invoice/${invoice.id}?notice=${encodeURIComponent(
      "Invoice ditandai lunas. Notifikasi bukti pembayaran sudah disiapkan untuk customer dan CC pemilik."
    )}`
  );
});

app.post("/admin/messages/:id(\\d+)/sent", auth.requireAdmin, (req, res) => {
  db.prepare("UPDATE messages SET status='sent', sent_at=? WHERE id=?").run(new Date().toISOString(), req.params.id);
  res.redirect(req.headers.referer || `${req.BASE}/admin`);
});

app.post("/admin/messages/:id(\\d+)/autosend", auth.requireAdmin, async (req, res) => {
  const result = await wa.sendMessage(req.params.id, allSettings());
  const notice = result.ok
    ? "Pesan terkirim lewat gateway WhatsApp."
    : result.error || "Pesan gagal dikirim.";
  const back = req.headers.referer || `${req.BASE}/admin`;
  res.redirect(back + (back.includes("?") ? "&" : "?") + "notice=" + encodeURIComponent(notice));
});

/* ------------------------------- pengaturan ------------------------------ */

app.get("/admin/settings", auth.requireAdmin, (req, res) => {
  const settings = allSettings();
  let info = null;
  if (settings.qris_static) {
    try {
      info = qris.info(settings.qris_static);
    } catch (_) {
      info = null;
    }
  }
  res.send(
    adm.settingsPage({
      base: req.BASE,
      settings,
      notice: String(req.query.notice || ""),
      error: String(req.query.e || ""),
      qrisInfo: info,
    })
  );
});

function saveQrisPayload(req, payload) {
  const check = qris.validate(payload);
  if (!check.ok) return { ok: false, error: check.reason };
  const info = qris.info(check.payload);
  if (info && !info.static && info.hasAmount) {
    // QRIS dinamis bernominal: nominal akan ditimpa per invoice, tetap boleh dipakai.
  }
  setSetting("qris_static", check.payload);
  setSetting("qris_merchant", (info && info.merchant) || "");
  setSetting("qris_nmid", (info && info.nmid) || "");
  return { ok: true, info };
}

app.post("/admin/settings/qris", auth.requireAdmin, (req, res) => {
  const result = saveQrisPayload(req, String(req.body.qris_payload || ""));
  const q = result.ok
    ? "Kode QRIS berhasil disimpan. Invoice baru akan memakai QRIS dinamis dengan nominal otomatis."
    : "QRIS gagal disimpan: " + result.error;
  res.redirect(`${req.BASE}/admin/settings?` + (result.ok ? "notice=" : "e=") + encodeURIComponent(q));
});

app.post("/admin/settings/qris/upload", auth.requireAdmin, (req, res) => {
  const dataUrl = String(req.body.dataUrl || "");
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
  if (!m) return res.status(400).json({ ok: false, error: "Format gambar harus PNG atau JPG." });
  try {
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 12 * 1024 * 1024) throw new Error("Ukuran gambar terlalu besar (maks 12 MB).");
    const payload = qris.decodeImage(buf);
    const result = saveQrisPayload(req, payload);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.json({ ok: true, merchant: result.info.merchant, nmid: result.info.nmid, static: result.info.static });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Gagal membaca QRIS dari gambar." });
  }
});

app.post("/admin/settings/qris/clear", auth.requireAdmin, (req, res) => {
  setSetting("qris_static", "");
  setSetting("qris_merchant", "");
  setSetting("qris_nmid", "");
  res.redirect(`${req.BASE}/admin/settings?notice=` + encodeURIComponent("Kode QRIS dihapus."));
});

app.post("/admin/settings/bank", auth.requireAdmin, (req, res) => {
  setSetting("bank_name", String(req.body.bank_name || "").trim());
  setSetting("bank_account", String(req.body.bank_account || "").trim());
  setSetting("bank_holder", String(req.body.bank_holder || "").trim());
  if (req.body.owner_name) setSetting("owner_name", String(req.body.owner_name).trim());
  res.redirect(`${req.BASE}/admin/settings?notice=` + encodeURIComponent("Data rekening diperbarui."));
});

app.post("/admin/settings/wa", auth.requireAdmin, (req, res) => {
  const owner = wa.normalizeWa(req.body.owner_wa || "");
  if (!owner) {
    return res.redirect(`${req.BASE}/admin/settings?e=` + encodeURIComponent("Nomor WhatsApp pemilik tidak valid."));
  }
  setSetting("owner_wa", owner);
  setSetting("company_email", String(req.body.company_email || "").trim());
  setSetting("wa_gateway_url", String(req.body.wa_gateway_url || "").trim());
  setSetting("wa_gateway_token", String(req.body.wa_gateway_token || "").trim());
  const notice = (req.body.wa_gateway_token || "").trim()
    ? "Pengaturan notifikasi disimpan. Gateway aktif — pesan baru dikirim otomatis."
    : "Pengaturan notifikasi disimpan (mode manual: kirim lewat tombol WhatsApp).";
  res.redirect(`${req.BASE}/admin/settings?notice=` + encodeURIComponent(notice));
});

app.post("/admin/settings/password", auth.requireAdmin, (req, res) => {
  if (!auth.checkLogin(String(req.body.current || ""))) {
    return res.redirect(`${req.BASE}/admin/settings?e=` + encodeURIComponent("Kata sandi saat ini salah."));
  }
  const baru = String(req.body.baru || "");
  if (baru.length < 6) {
    return res.redirect(`${req.BASE}/admin/settings?e=` + encodeURIComponent("Kata sandi baru minimal 6 karakter."));
  }
  auth.changePassword(baru);
  res.redirect(`${req.BASE}/admin/settings?notice=` + encodeURIComponent("Kata sandi admin diperbarui."));
});

/* --------------------------------- fallback ------------------------------ */

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use((req, res) => {
  res.status(404).type("html").send(pub.notFound(req.BASE));
});

app.use((err, _req, res, _next) => {
  console.error("Server error:", err.message);
  res.status(500).type("text").send("Terjadi kesalahan pada server.");
});

app.listen(PORT, () => {
  console.log(`JualanAplikasiAI berjalan di port ${PORT}`);
});
