"use strict";
const { db } = require("./db");

/* ----------------------------- format util ----------------------------- */

function normalizeWa(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("620")) d = "62" + d.slice(3);
  if (d.startsWith("62")) return d;
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("8")) return "62" + d;
  return d;
}

function waDisplay(input) {
  const n = normalizeWa(input);
  if (!n) return "";
  const local = "0" + n.slice(2);
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

function rupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function tanggalID(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

function waktuID(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB";
}

function itemLines(invoice, items) {
  if (!items || !items.length) return "-";
  return items
    .map((it, i) => `${i + 1}. ${it.name} × ${it.qty} = ${rupiah(it.qty * it.price)}`)
    .join("\n");
}

/* --------------------------- message building -------------------------- */

function buildMessages({ kind, invoice, items, settings, link, adminLink }) {
  const base = [];
  const s = settings;

  if (kind === "invoice") {
    const bodyCustomer = [
      `Halo ${invoice.customer_name},`,
      ``,
      `Terima kasih telah mempercayakan kebutuhan AI bisnis Anda kepada ${s.company_name}.`,
      `Berikut invoice Anda:`,
      ``,
      `No. Invoice : ${invoice.number}`,
      `Total       : ${rupiah(invoice.amount)}`,
      `Batas bayar : ${invoice.due_date ? tanggalID(invoice.due_date) : "-"}`,
      `Status      : Menunggu pembayaran`,
      ``,
      `Rincian:`,
      itemLines(invoice, items),
      ``,
      `Rincian lengkap + QRIS:`,
      link,
      ``,
      `Cara membayar:`,
      `1. Scan QRIS pada tautan di atas (bisa dari semua e-wallet / m-banking)`,
      `2. Atau transfer ${s.bank_name} ${s.bank_account} a.n. ${s.bank_holder}`,
      ``,
      `Setelah membayar, tekan tombol "Saya sudah bayar" di halaman invoice`,
      `agar kami dapat segera memverifikasi.`,
      ``,
      `Terima kasih.`,
      `${s.company_name}`,
      waDisplay(s.owner_wa),
    ].join("\n");

    const bodyOwner = [
      `[CC] Invoice baru dibuat`,
      ``,
      `No. Invoice : ${invoice.number}`,
      `Customer    : ${invoice.customer_name} (${waDisplay(invoice.customer_wa)})`,
      `Total       : ${rupiah(invoice.amount)}`,
      `Status      : Menunggu pembayaran`,
      `Batas bayar : ${invoice.due_date ? tanggalID(invoice.due_date) : "-"}`,
      ``,
      `Tautan invoice: ${link}`,
      `Dashboard     : ${adminLink}`,
    ].join("\n");

    base.push({ audience: "customer", target: invoice.customer_wa, body: bodyCustomer });
    base.push({ audience: "owner", target: s.owner_wa, body: bodyOwner });
  }

  if (kind === "claimed") {
    base.push({
      audience: "owner",
      target: s.owner_wa,
      body: [
        `Konfirmasi pembayaran masuk`,
        ``,
        `Customer ${invoice.customer_name} (${waDisplay(invoice.customer_wa)})`,
        `menyatakan sudah membayar invoice ${invoice.number} sebesar ${rupiah(invoice.amount)}`,
        `pada ${waktuID(new Date().toISOString())}.`,
        ``,
        `Mohon cek mutasi ${s.bank_name} ${s.bank_account}, lalu tandai LUNAS di dashboard:`,
        adminLink,
        ``,
        `Tautan invoice: ${link}`,
      ].join("\n"),
    });
  }

  if (kind === "paid") {
    const bodyCustomer = [
      `Halo ${invoice.customer_name},`,
      ``,
      `Pembayaran invoice ${invoice.number} telah kami terima.`,
      `Status: LUNAS ✔`,
      ``,
      `Total       : ${rupiah(invoice.amount)}`,
      `Dibayarkan  : ${waktuID(invoice.paid_at)}`,
      `Metode      : ${invoice.paid_method || "QRIS / Transfer"}`,
      ``,
      `Kuitansi dan tautan invoice tetap dapat dibuka di:`,
      link,
      ``,
      `Terima kasih atas kepercayaan Anda kepada ${s.company_name}.`,
      `${s.company_name}`,
      waDisplay(s.owner_wa),
    ].join("\n");

    const bodyOwner = [
      `[CC] Pembayaran diterima`,
      ``,
      `Invoice     : ${invoice.number}`,
      `Customer    : ${invoice.customer_name} (${waDisplay(invoice.customer_wa)})`,
      `Total       : ${rupiah(invoice.amount)}`,
      `Dibayarkan  : ${waktuID(invoice.paid_at)}`,
      `Metode      : ${invoice.paid_method || "QRIS / Transfer"}`,
      `Status      : LUNAS`,
      ``,
      `Tautan invoice: ${link}`,
    ].join("\n");

    base.push({ audience: "customer", target: invoice.customer_wa, body: bodyCustomer });
    base.push({ audience: "owner", target: s.owner_wa, body: bodyOwner });
  }

  return base;
}

/** Simpan notifikasi ke antrean (outbox). */
const queueMessages = db.transaction((entries) => {
  const stmt = db.prepare(
    `INSERT INTO messages (invoice_id, kind, audience, target, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  );
  const now = new Date().toISOString();
  const ids = [];
  for (const e of entries) {
    const info = stmt.run(e.invoice_id, e.kind, e.audience, normalizeWa(e.target), e.body, now);
    ids.push(info.lastInsertRowid);
  }
  return ids;
});

/**
 * Kirim satu pesan. Tanpa token gateway, pesan tetap di antrean dan dikirim
 * manual lewat tombol WhatsApp (wa.me) di dashboard.
 */
async function sendMessage(messageId, settings) {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
  if (!row) return { ok: false, error: "Pesan tidak ditemukan." };
  const token = (settings.wa_gateway_token || "").trim();
  if (!token) {
    return { ok: false, skipped: true, error: "Gateway WhatsApp belum dikonfigurasi — kirim manual lewat tautan WhatsApp." };
  }
  const url = (settings.wa_gateway_url || "https://api.fonnte.com/send").trim();
  try {
    const body = new URLSearchParams({ target: row.target, message: row.body });
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      /* respons bukan JSON */
    }
    const apiOk = parsed && (parsed.status === true || parsed.status === "true" || parsed.status === 200);
    if (!res.ok || (parsed && parsed.status !== undefined && !apiOk)) {
      db.prepare("UPDATE messages SET status='failed', error=? WHERE id=?").run(
        (parsed && (parsed.reason || parsed.message)) || text.slice(0, 300) || `HTTP ${res.status}`,
        messageId
      );
      return { ok: false, error: "Gateway menolak pengiriman." };
    }
    db.prepare("UPDATE messages SET status='sent', sent_at=?, error='' WHERE id=?").run(
      new Date().toISOString(),
      messageId
    );
    return { ok: true };
  } catch (err) {
    db.prepare("UPDATE messages SET status='failed', error=? WHERE id=?").run(
      String(err.message || err).slice(0, 300),
      messageId
    );
    return { ok: false, error: "Gagal menghubungi gateway WhatsApp." };
  }
}

/** Kirim otomatis seluruh pesan pending untuk satu invoice (jika gateway aktif). */
async function autoSendPending(invoiceId, settings) {
  if (!(settings.wa_gateway_token || "").trim()) return { attempted: 0, sent: 0 };
  const rows = db
    .prepare("SELECT id FROM messages WHERE invoice_id = ? AND status = 'pending'")
    .all(invoiceId);
  let sent = 0;
  for (const r of rows) {
    const res = await sendMessage(r.id, settings);
    if (res.ok) sent++;
  }
  return { attempted: rows.length, sent };
}

function waLink(target, body) {
  return `https://wa.me/${normalizeWa(target)}?text=${encodeURIComponent(body)}`;
}

module.exports = {
  normalizeWa,
  waDisplay,
  rupiah,
  tanggalID,
  waktuID,
  buildMessages,
  queueMessages,
  sendMessage,
  autoSendPending,
  waLink,
};
