"use strict";
const fs = require("fs");
const path = require("path");
const { e, shell, badge } = require("./layout");
const { rupiah, tanggalID, waktuID, waLink, waDisplay, normalizeWa } = require("../lib/wa");

const HOME_FILE = path.join(__dirname, "home.html");

/** Halaman utama: file statis dengan token yang diisi dari pengaturan. */
function home(settings, base) {
  let html = fs.readFileSync(HOME_FILE, "utf8");
  const wa = normalizeWa(settings.owner_wa);
  html = html
    .replace(/\{\{BASE\}\}/g, base)
    .replace(/6287846107464/g, wa)
    .replace(/0878-4610-7464/g, waDisplay(settings.owner_wa))
    .replace(/terrasolusi\.net@gmail\.com/g, settings.company_email);
  return html;
}

/* --------------------------------- cek invoice -------------------------------- */

function lookup({ base, settings, error = "", values = {} }) {
  const body = `
<main class="pub-page">
  <div class="pub-head">
    <a class="brand brand-sm" href="${base}/">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.5 7.5l2.5 1.5M17 15l2.5 1.5M4.5 16.5L7 15M17 9l2.5-1.5"/><circle cx="12" cy="12" r="3.4"/></svg>
      </span>
      <span class="brand-text"><strong>JualanAplikasi<span>AI</span></strong><small>Pembayaran invoice</small></span>
    </a>
    <a class="btn btn-ghost btn-sm" href="${base}/">Kembali ke situs</a>
  </div>

  <section class="pub-card glass">
    <span class="eyebrow">Cek invoice</span>
    <h1 class="pub-title">Buka invoice &amp; lakukan pembayaran</h1>
    <p class="pub-lead">Masukkan nomor invoice dan nomor WhatsApp yang Anda gunakan saat pemesanan.
      Halaman invoice berisi rincian tagihan, QRIS, dan status pembayaran.</p>
    ${error ? `<div class="alert alert-error">${e(error)}</div>` : ""}
    <form method="post" action="${base}/invoice" class="pub-form">
      <div class="field">
        <label for="number">Nomor invoice</label>
        <input id="number" name="number" placeholder="INV/${new Date().getFullYear()}/0001" value="${e(values.number || "")}" required autocomplete="off" />
      </div>
      <div class="field">
        <label for="wa">Nomor WhatsApp</label>
        <input id="wa" name="wa" placeholder="08xxxxxxxxxx" value="${e(values.wa || "")}" required autocomplete="tel" />
      </div>
      <button type="submit" class="btn btn-primary">Buka invoice</button>
    </form>
    <p class="pub-hint">Butuh bantuan? <a href="${waLink(settings.owner_wa, "Halo, saya ingin menanyakan invoice saya.")}" target="_blank" rel="noopener">Chat admin via WhatsApp</a></p>
  </section>
</main>`;
  return shell({ title: "Cek Invoice — JualanAplikasiAI", base, body, className: "pub-body", robots: "noindex,nofollow" });
}

/* --------------------------------- invoice ---------------------------------- */

function invoicePage({ base, settings, invoice, items, claimNotice = "", error = "" }) {
  const isPaid = invoice.status === "paid";
  const link = `${base}/i/${invoice.token}`;

  const statusPanel = isPaid
    ? `<div class="paid-panel">
         <div class="paid-icon" aria-hidden="true">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>
         </div>
         <div>
           <strong>Pembayaran diterima — LUNAS</strong>
           <span>Dibayarkan ${e(waktuID(invoice.paid_at))} · ${e(invoice.paid_method || "QRIS / Transfer")}</span>
         </div>
       </div>`
    : invoice.status === "claimed"
    ? `<div class="alert alert-info">Terima kasih — konfirmasi pembayaran Anda sudah kami terima dan sedang diverifikasi admin.
         Status invoice akan berubah menjadi <strong>LUNAS</strong> setelah pembayaran terverifikasi.</div>`
    : `<div class="alert alert-warn">Invoice ini belum dibayar. Selesaikan pembayaran sebelum
         ${invoice.due_date ? e(tanggalID(invoice.due_date)) : "jatuh tempo"}.</div>`;

  const payBlock = isPaid
    ? ""
    : `<div class="pay-grid">
        <div class="pay-qris">
          <div class="pay-qris-head">
            <span class="pay-label">Pembayaran QRIS</span>
            <span class="pay-tag">QRIS</span>
          </div>
          ${
            invoice.qris_payload
              ? `<img class="qris-img" src="${base}/i/${invoice.token}/qris.png" alt="Kode QRIS untuk invoice ${e(invoice.number)}" width="260" height="260" />
                 <p class="pay-note">Scan dengan aplikasi apa pun yang mendukung QRIS (m-banking, e-wallet).
                 Nominal <strong>${e(rupiah(invoice.amount))}</strong> sudah terisi otomatis — tidak perlu mengetik ulang.</p>`
              : `<div class="qris-empty">
                   <img src="${base}/assets/qris-mark.svg" alt="" width="56" height="56" />
                   <p>QRIS dinamis belum aktif pada akun ini. Silakan gunakan transfer bank di samping,
                   atau hubungi admin untuk memperoleh kode QRIS.</p>
                 </div>`
          }
        </div>
        <div class="pay-bank">
          <span class="pay-label">Transfer bank</span>
          <div class="bank-card">
            <span class="bank-name">${e(settings.bank_name)}</span>
            <strong class="bank-number" data-copy="${e(settings.bank_account)}">${e(settings.bank_account)}</strong>
            <span class="bank-holder">a.n. ${e(settings.bank_holder)}</span>
            <button type="button" class="btn btn-ghost btn-sm copy-btn" data-copy="${e(settings.bank_account)}">Salin nomor rekening</button>
          </div>
          <p class="pay-note">Cantumkan nomor invoice <strong>${e(invoice.number)}</strong> pada berita transfer
          agar pembayaran mudah kami verifikasi.</p>
          <form method="post" action="${base}/i/${invoice.token}/claim" class="claim-form">
            <button type="submit" class="btn btn-primary">Saya sudah bayar</button>
            <span class="claim-hint">Admin akan memverifikasi dan mengirim bukti lunas via WhatsApp.</span>
          </form>
        </div>
      </div>`;

  const rows = items
    .map(
      (it) => `<tr>
        <td>${e(it.name)}</td>
        <td class="num">${e(it.qty)}</td>
        <td class="num">${e(rupiah(it.price))}</td>
        <td class="num">${e(rupiah(it.qty * it.price))}</td>
      </tr>`
    )
    .join("");

  const body = `
<main class="pub-page">
  <div class="pub-head">
    <a class="brand brand-sm" href="${base}/">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.5 7.5l2.5 1.5M17 15l2.5 1.5M4.5 16.5L7 15M17 9l2.5-1.5"/><circle cx="12" cy="12" r="3.4"/></svg>
      </span>
      <span class="brand-text"><strong>JualanAplikasi<span>AI</span></strong><small>Invoice &amp; pembayaran</small></span>
    </a>
    <div class="pub-head-actions">
      <a class="btn btn-ghost btn-sm" href="${waLink(settings.owner_wa, "Halo, saya ingin bertanya soal invoice " + invoice.number)}" target="_blank" rel="noopener">Tanya admin</a>
      <a class="btn btn-ghost btn-sm" href="${base}/">Situs utama</a>
    </div>
  </div>

  <section class="invoice-sheet glass">
    <header class="invoice-head">
      <div>
        <span class="eyebrow">Invoice</span>
        <h1 class="invoice-number">${e(invoice.number)}</h1>
        <p class="invoice-meta">Diterbitkan ${e(tanggalID(invoice.created_at))}${
          invoice.due_date ? ` · Jatuh tempo ${e(tanggalID(invoice.due_date))}` : ""
        }</p>
      </div>
      <div class="invoice-head-right">
        ${badge(invoice.status)}
        <div class="invoice-total">
          <span>Total tagihan</span>
          <strong>${e(rupiah(invoice.amount))}</strong>
        </div>
      </div>
    </header>

    ${error ? `<div class="alert alert-error">${e(error)}</div>` : ""}
    ${claimNotice ? `<div class="alert alert-ok">${e(claimNotice)}</div>` : ""}
    ${statusPanel}

    <div class="invoice-parties">
      <div>
        <span class="party-label">Ditagihkan kepada</span>
        <strong>${e(invoice.customer_name)}</strong>
        ${invoice.company ? `<span>${e(invoice.company)}</span>` : ""}
        <span>${e(waDisplay(invoice.customer_wa))}</span>
        ${invoice.customer_email ? `<span>${e(invoice.customer_email)}</span>` : ""}
      </div>
      <div>
        <span class="party-label">Diterbitkan oleh</span>
        <strong>${e(settings.company_name)}</strong>
        <span>${e(settings.company_address)}</span>
        <span>${e(settings.company_email)} · ${e(waDisplay(settings.owner_wa))}</span>
      </div>
    </div>

    <div class="table-wrap">
      <table class="items-table">
        <thead><tr><th>Produk / layanan</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">Tidak ada rincian item.</td></tr>`}</tbody>
        <tfoot>
          <tr><td colspan="3" class="num">Total</td><td class="num">${e(rupiah(invoice.amount))}</td></tr>
        </tfoot>
      </table>
    </div>

    ${invoice.note ? `<div class="invoice-note"><strong>Catatan:</strong> ${e(invoice.note)}</div>` : ""}
    ${payBlock}
  </section>

  <p class="pub-foot">${e(settings.company_name)} · ${e(settings.company_address)} ·
    <a href="${waLink(settings.owner_wa, "Halo, saya ingin bertanya soal invoice " + invoice.number)}" target="_blank" rel="noopener">WhatsApp admin</a>
    · <a href="mailto:${e(settings.company_email)}">${e(settings.company_email)}</a>
  </p>
  <p class="pub-foot muted">Tautan invoice ini bersifat pribadi: ${e(link)}</p>
</main>`;
  return shell({
    title: `Invoice ${invoice.number} — ${settings.company_name}`,
    base,
    body,
    className: "pub-body",
    robots: "noindex,nofollow",
  });
}

function notFound(base) {
  const body = `
<main class="pub-page">
  <div class="pub-head">
    <a class="brand brand-sm" href="${base}/">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.5 7.5l2.5 1.5M17 15l2.5 1.5M4.5 16.5L7 15M17 9l2.5-1.5"/><circle cx="12" cy="12" r="3.4"/></svg>
      </span>
      <span class="brand-text"><strong>JualanAplikasi<span>AI</span></strong><small>Halaman tidak ditemukan</small></span>
    </a>
  </div>
  <section class="pub-card glass">
    <span class="eyebrow">404</span>
    <h1 class="pub-title">Halaman atau invoice tidak ditemukan</h1>
    <p class="pub-lead">Tautan mungkin salah, atau invoice sudah dihapus. Periksa kembali tautan yang Anda terima,
      atau cari invoice dengan nomor invoice dan nomor WhatsApp.</p>
    <div class="form-actions">
      <a class="btn btn-primary" href="${base}/invoice">Cek invoice</a>
      <a class="btn btn-ghost" href="${base}/">Kembali ke situs</a>
    </div>
  </section>
</main>`;
  return shell({ title: "Tidak ditemukan — JualanAplikasiAI", base, body, className: "pub-body" });
}

module.exports = { home, lookup, invoicePage, notFound };
