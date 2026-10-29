"use strict";
const { e, shell, badge, adminNav, alertBox } = require("./layout");
const { rupiah, tanggalID, waktuID, waDisplay, waLink } = require("../lib/wa");

const KIND_LABEL = {
  invoice: "Invoice diterbitkan",
  claimed: "Konfirmasi pembayaran customer",
  paid: "Bukti lunas",
};
const AUD_LABEL = { customer: "Customer", owner: "CC · Pemilik" };

function msgStatus(m) {
  if (m.status === "sent") return `<span class="badge badge-ok">Terkirim</span>`;
  if (m.status === "failed") return `<span class="badge badge-error">Gagal</span>`;
  return `<span class="badge badge-warn">Menunggu dikirim</span>`;
}

function messageRow(m, base) {
  return `<article class="msg-row">
  <div class="msg-main">
    <div class="msg-meta">
      <strong>${e(KIND_LABEL[m.kind] || m.kind)}</strong>
      <span class="msg-aud">${e(AUD_LABEL[m.audience] || m.audience)}</span>
      <span class="msg-to">${e(waDisplay(m.target))}</span>
      ${msgStatus(m)}
    </div>
    <details class="msg-body"><summary>Lihat isi pesan</summary><pre>${e(m.body)}</pre></details>
    ${m.error ? `<p class="msg-error">${e(m.error)}</p>` : ""}
  </div>
  <div class="msg-actions">
    <a class="btn btn-primary btn-sm" href="${e(waLink(m.target, m.body))}" target="_blank" rel="noopener">Buka WhatsApp</a>
    ${
      m.status !== "sent"
        ? `<form method="post" action="${base}/admin/messages/${m.id}/sent" class="inline-form">
             <button type="submit" class="btn btn-ghost btn-sm">Tandai terkirim</button>
           </form>
           <form method="post" action="${base}/admin/messages/${m.id}/autosend" class="inline-form">
             <button type="submit" class="btn btn-ghost btn-sm">Kirim otomatis</button>
           </form>`
        : `<span class="msg-sent">${e(waktuID(m.sent_at))}</span>`
    }
  </div>
</article>`;
}

/* ---------------------------------- login ---------------------------------- */

function login({ base, error = "", next = "", isDefault }) {
  const body = `
<main class="pub-page login-page">
  <div class="pub-head">
    <a class="brand brand-sm" href="${base}/">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.5 7.5l2.5 1.5M17 15l2.5 1.5M4.5 16.5L7 15M17 9l2.5-1.5"/><circle cx="12" cy="12" r="3.4"/></svg>
      </span>
      <span class="brand-text"><strong>JualanAplikasi<span>AI</span></strong><small>Panel transaksi</small></span>
    </a>
  </div>
  <section class="pub-card glass login-card">
    <span class="eyebrow">Admin</span>
    <h1 class="pub-title">Masuk panel transaksi</h1>
    <p class="pub-lead">Kelola invoice, QRIS, dan notifikasi WhatsApp ke customer.</p>
    ${error ? `<div class="alert alert-error">${e(error)}</div>` : ""}
    ${isDefault ? `<div class="alert alert-warn">Kata sandi masih bawaan: <strong>admin123</strong>. Segera ubah di menu Pengaturan setelah masuk.</div>` : ""}
    <form method="post" action="${base}/admin/login" class="pub-form">
      <input type="hidden" name="next" value="${e(next)}" />
      <div class="field">
        <label for="password">Kata sandi</label>
        <input id="password" name="password" type="password" required autocomplete="current-password" autofocus />
      </div>
      <button type="submit" class="btn btn-primary">Masuk</button>
    </form>
  </section>
</main>`;
  return shell({ title: "Masuk — Panel Transaksi", base, body, className: "pub-body" });
}

/* -------------------------------- dashboard -------------------------------- */

function dashboard({ base, invoices, stats, messages, settings, notice = "" }) {
  const rows = invoices
    .map(
      (inv) => `<tr>
      <td><a class="inv-link" href="${base}/admin/invoice/${inv.id}">${e(inv.number)}</a>
        <span class="cell-sub">${e(tanggalID(inv.created_at))}</span></td>
      <td>${e(inv.customer_name)}<span class="cell-sub">${e(waDisplay(inv.customer_wa))}</span></td>
      <td class="num">${e(rupiah(inv.amount))}</td>
      <td>${badge(inv.status)}</td>
      <td class="row-actions">
        <a class="btn btn-ghost btn-sm" href="${base}/admin/invoice/${inv.id}">Detail</a>
      </td>
    </tr>`
    )
    .join("");

  const outbox = messages.length
    ? messages.map((m) => messageRow(m, base)).join("")
    : `<p class="empty-state">Tidak ada notifikasi yang menunggu. Semua pesan sudah terkirim.</p>`;

  const gatewayOn = Boolean((settings.wa_gateway_token || "").trim());

  const body = `
${adminNav(base, "dashboard")}
<main class="admin-main">
  ${alertBox("ok", notice)}
  <div class="admin-head">
    <div>
      <h1>Dashboard transaksi</h1>
      <p class="admin-sub">Ringkasan invoice, pembayaran, dan notifikasi WhatsApp.</p>
    </div>
    <a class="btn btn-primary" href="${base}/admin/invoice/new">+ Invoice Baru</a>
  </div>

  <section class="stat-grid">
    <div class="stat-card">
      <span class="stat-label">Total invoice</span>
      <strong>${e(stats.count)}</strong>
      <span class="stat-sub">${e(rupiah(stats.total))} nilai tagihan</span>
    </div>
    <div class="stat-card stat-warn">
      <span class="stat-label">Belum dibayar</span>
      <strong>${e(stats.unpaidCount)}</strong>
      <span class="stat-sub">${e(rupiah(stats.unpaidAmount))} menunggu</span>
    </div>
    <div class="stat-card stat-claim">
      <span class="stat-label">Menunggu verifikasi</span>
      <strong>${e(stats.claimedCount)}</strong>
      <span class="stat-sub">perlu dicek di mutasi</span>
    </div>
    <div class="stat-card stat-ok">
      <span class="stat-label">Lunas</span>
      <strong>${e(stats.paidCount)}</strong>
      <span class="stat-sub">${e(rupiah(stats.paidAmount))} diterima</span>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Notifikasi WhatsApp</h2>
      <span class="panel-hint">${gatewayOn ? "Gateway aktif — pesan baru terkirim otomatis." : "Gateway belum aktif — kirim lewat tombol WhatsApp di tiap pesan."}</span>
    </div>
    <div class="msg-list">${outbox}</div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Daftar invoice</h2>
      <a class="link-mini" href="${base}/admin/invoice/new">Buat invoice baru →</a>
    </div>
    <div class="table-wrap">
      <table class="items-table admin-table">
        <thead><tr><th>Invoice</th><th>Customer</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">Belum ada invoice. Mulai dengan membuat invoice baru.</td></tr>`}</tbody>
      </table>
    </div>
  </section>
</main>`;
  return shell({ title: "Dashboard — Panel Transaksi", base, body, className: "admin-body" });
}

/* ------------------------------- invoice baru ------------------------------ */

function newInvoice({ base, settings, error = "", values = {} }) {
  const itemRow = (i = 0, it = {}) => `<div class="item-row" data-row>
    <div class="field">
      <label>Produk / layanan</label>
      <input name="item_name" list="produk-list" aria-label="Produk atau layanan" placeholder="Contoh: Chatbot WhatsApp — paket Bisnis" value="${e(it.name || "")}" required />
    </div>
    <div class="field field-qty">
      <label>Qty</label>
      <input name="item_qty" type="number" min="1" step="1" aria-label="Jumlah" value="${e(it.qty || 1)}" required />
    </div>
    <div class="field field-price">
      <label>Harga satuan (Rp)</label>
      <input name="item_price" type="number" min="0" step="1000" aria-label="Harga satuan" value="${e(it.price || "")}" placeholder="1500000" required />
    </div>
    <button type="button" class="btn btn-ghost btn-sm item-remove" aria-label="Hapus item">Hapus</button>
  </div>`;

  const body = `
${adminNav(base, "new")}
<main class="admin-main">
  <div class="admin-head">
    <div>
      <h1>Buat invoice baru</h1>
      <p class="admin-sub">Nomor invoice, QRIS dinamis, dan notifikasi WhatsApp dibuat otomatis.</p>
    </div>
    <a class="btn btn-ghost" href="${base}/admin">Kembali</a>
  </div>
  ${error ? alertBox("error", error) : ""}
  ${settings.qris_static ? "" : `<div class="alert alert-warn">QRIS merchant belum diatur, jadi invoice akan berisi instruksi transfer saja.
     Unggah kode QRIS Anda di <a href="${base}/admin/settings">Pengaturan</a> agar pembayaran bisa lewat QRIS.</div>`}

  <form method="post" action="${base}/admin/invoice" class="panel form-invoice">
    <div class="panel-head"><h2>Data customer</h2></div>
    <div class="grid-2">
      <div class="field">
        <label for="customer_name">Nama customer *</label>
        <input id="customer_name" name="customer_name" value="${e(values.customer_name || "")}" required />
      </div>
      <div class="field">
        <label for="customer_wa">Nomor WhatsApp customer *</label>
        <input id="customer_wa" name="customer_wa" value="${e(values.customer_wa || "")}" placeholder="08xxxxxxxxxx" required />
      </div>
      <div class="field">
        <label for="company">Perusahaan / instansi</label>
        <input id="company" name="company" value="${e(values.company || "")}" />
      </div>
      <div class="field">
        <label for="customer_email">Email customer</label>
        <input id="customer_email" name="customer_email" type="email" value="${e(values.customer_email || "")}" />
      </div>
    </div>

    <div class="panel-head panel-head-gap"><h2>Produk &amp; layanan</h2>
      <button type="button" class="btn btn-ghost btn-sm" id="addItem">+ Tambah item</button>
    </div>
    <datalist id="produk-list">
      <option>Chatbot Layanan Pelanggan</option>
      <option>Generator Konten &amp; Copywriting</option>
      <option>Otomasi Penjualan &amp; CRM</option>
      <option>Analitik &amp; Prediksi</option>
      <option>Pengembangan Aplikasi Custom</option>
      <option>Konsultasi &amp; Pendampingan</option>
    </datalist>
    <div id="items">${itemRow(0)}</div>

    <div class="panel-head panel-head-gap"><h2>Keterangan</h2></div>
    <div class="grid-2">
      <div class="field">
        <label for="due_date">Jatuh tempo</label>
        <input id="due_date" name="due_date" type="date" value="${e(values.due_date || "")}" />
      </div>
      <div class="field">
        <label for="note">Catatan invoice</label>
        <input id="note" name="note" value="${e(values.note || "")}" placeholder="Contoh: termasuk pelatihan 1 sesi" />
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary">Buat invoice &amp; kirim notifikasi</button>
      <a class="btn btn-ghost" href="${base}/admin">Batal</a>
    </div>
    <p class="form-note">Setelah dibuat: notifikasi invoice dikirim ke WhatsApp customer, dengan salinan (CC) ke
      WhatsApp ${e(waDisplay(settings.owner_wa))} — ${e(settings.owner_name)}.</p>
  </form>
</main>`;
  return shell({ title: "Invoice Baru — Panel Transaksi", base, body, className: "admin-body" });
}

/* ------------------------------ detail invoice ----------------------------- */

function invoiceDetail({ base, settings, invoice, items, messages, notice = "", publicUrl }) {
  const rows = items
    .map(
      (it) => `<tr><td>${e(it.name)}</td><td class="num">${e(it.qty)}</td>
      <td class="num">${e(rupiah(it.price))}</td><td class="num">${e(rupiah(it.qty * it.price))}</td></tr>`
    )
    .join("");

  const msgList = messages.length
    ? messages.map((m) => messageRow(m, base)).join("")
    : `<p class="empty-state">Belum ada notifikasi untuk invoice ini.</p>`;

  const paidPanel =
    invoice.status === "paid"
      ? `<div class="alert alert-ok">Invoice sudah lunas ${e(waktuID(invoice.paid_at))} · ${e(invoice.paid_method || "QRIS / Transfer")}</div>`
      : `<form method="post" action="${base}/admin/invoice/${invoice.id}/paid" class="paid-form">
           <div class="field">
             <label for="paid_method">Metode pembayaran</label>
             <select id="paid_method" name="paid_method">
               <option>QRIS</option>
               <option>Transfer BCA</option>
               <option>Tunai</option>
               <option>Lainnya</option>
             </select>
           </div>
           <button type="submit" class="btn btn-primary">Tandai LUNAS &amp; kirim notifikasi</button>
         </form>`;

  const body = `
${adminNav(base, "dashboard")}
<main class="admin-main">
  ${alertBox("ok", notice)}
  <div class="admin-head">
    <div>
      <h1>${e(invoice.number)} ${badge(invoice.status)}</h1>
      <p class="admin-sub">Dibuat ${e(tanggalID(invoice.created_at))} · Customer ${e(invoice.customer_name)} (${e(waDisplay(invoice.customer_wa))})</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost btn-sm" href="${base}/admin">Kembali</a>
      <a class="btn btn-ghost btn-sm" href="${publicUrl}" target="_blank" rel="noopener">Lihat invoice</a>
    </div>
  </div>

  <div class="detail-grid">
    <section class="panel">
      <div class="panel-head"><h2>Rincian tagihan</h2><strong class="total-big">${e(rupiah(invoice.amount))}</strong></div>
      <div class="table-wrap">
        <table class="items-table admin-table">
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${invoice.note ? `<p class="invoice-note-sm"><strong>Catatan:</strong> ${e(invoice.note)}</p>` : ""}
      <div class="link-box">
        <span>Tautan invoice untuk customer</span>
        <div class="link-row">
          <input readonly value="${e(publicUrl)}" id="publicUrl" />
          <button type="button" class="btn btn-ghost btn-sm copy-btn" data-copy="${e(publicUrl)}">Salin</button>
        </div>
      </div>
      <div class="paid-block">${paidPanel}</div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Pembayaran QRIS</h2><span class="panel-hint">${e(settings.bank_name)} ${e(settings.bank_account)} · ${e(settings.bank_holder)}</span></div>
      ${
        invoice.qris_payload
          ? `<img class="qris-admin" src="${base}/i/${invoice.token}/qris.png" alt="QRIS invoice ${e(invoice.number)}" width="240" height="240" />
             <p class="qris-caption">QRIS dinamis · nominal ${e(rupiah(invoice.amount))} sudah tersisip.</p>`
          : `<div class="qris-empty small"><img src="${base}/assets/qris-mark.svg" alt="" width="44" height="44" /><p>QRIS belum aktif. Atur kode QRIS merchant di <a href="${base}/admin/settings">Pengaturan</a>.</p></div>`
      }
    </section>
  </div>

  <section class="panel">
    <div class="panel-head"><h2>Notifikasi WhatsApp</h2>
      <span class="panel-hint">CC otomatis ke ${e(waDisplay(settings.owner_wa))}</span></div>
    <div class="msg-list">${msgList}</div>
  </section>
</main>`;
  return shell({ title: `${invoice.number} — Panel Transaksi`, base, body, className: "admin-body" });
}

/* -------------------------------- pengaturan ------------------------------- */

function settingsPage({ base, settings, notice = "", error = "", qrisInfo }) {
  const body = `
${adminNav(base, "settings")}
<main class="admin-main">
  ${alertBox("ok", notice)}
  ${error ? alertBox("error", error) : ""}
  <div class="admin-head">
    <div>
      <h1>Pengaturan</h1>
      <p class="admin-sub">Kode QRIS merchant, rekening, dan gateway notifikasi WhatsApp.</p>
    </div>
  </div>

  <div class="settings-grid">
    <section class="panel">
      <div class="panel-head"><h2>QRIS merchant</h2>
        ${settings.qris_static ? `<span class="badge badge-ok">Aktif</span>` : `<span class="badge badge-warn">Belum aktif</span>`}
      </div>
      ${
        qrisInfo
          ? `<ul class="kv">
               <li><span>Merchant</span><strong>${e(qrisInfo.merchant)}</strong></li>
               <li><span>Kota</span><strong>${e(qrisInfo.city)}</strong></li>
               <li><span>NMID</span><strong>${e(qrisInfo.nmid || "-")}</strong></li>
               <li><span>Mata uang</span><strong>${e(qrisInfo.currency)}</strong></li>
               <li><span>Tipe</span><strong>${qrisInfo.static ? "Statis (benar — akan dibuat dinamis per invoice)" : "Sudah dinamis"}</strong></li>
             </ul>`
          : `<p class="form-note">Belum ada kode QRIS tersimpan. Unggah gambar QRIS dari aplikasi BCA merchant Anda
             (atau tempel isi payload-nya), lalu setiap invoice akan mendapat QRIS dinamis dengan nominal otomatis.</p>`
      }

      <form id="qrisUpload" class="qris-upload" data-base="${e(base)}">
        <label class="upload-box" for="qrisFile">
          <strong>Unggah gambar QRIS</strong>
          <span>PNG atau JPG, foto/screenshot kode QR merchant Anda</span>
          <input id="qrisFile" type="file" accept="image/png,image/jpeg" hidden />
        </label>
        <p class="upload-status" id="uploadStatus" role="status"></p>
      </form>

      <details class="qr-paste">
        <summary>Atau tempel payload QRIS secara manual</summary>
        <form method="post" action="${base}/admin/settings/qris">
          <div class="field">
            <label for="qris_payload">Payload QRIS (teks dari hasil scan)</label>
            <textarea id="qris_payload" name="qris_payload" rows="4" placeholder="00020101021126...">${e(settings.qris_static)}</textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Simpan payload</button>
        </form>
      </details>
      ${settings.qris_static ? `<form method="post" action="${base}/admin/settings/qris/clear" class="inline-form mt-8"><button class="linkbtn danger">Hapus kode QRIS tersimpan</button></form>` : ""}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Rekening &amp; penerima</h2></div>
      <form method="post" action="${base}/admin/settings/bank">
        <div class="grid-2">
          <div class="field"><label for="bank_name">Nama bank</label><input id="bank_name" name="bank_name" value="${e(settings.bank_name)}" /></div>
          <div class="field"><label for="bank_account">Nomor rekening</label><input id="bank_account" name="bank_account" value="${e(settings.bank_account)}" /></div>
          <div class="field"><label for="bank_holder">Atas nama</label><input id="bank_holder" name="bank_holder" value="${e(settings.bank_holder)}" /></div>
          <div class="field"><label for="owner_name">Nama pemilik</label><input id="owner_name" name="owner_name" value="${e(settings.owner_name)}" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Simpan rekening</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Notifikasi WhatsApp</h2>
        ${(settings.wa_gateway_token || "").trim() ? `<span class="badge badge-ok">Gateway aktif</span>` : `<span class="badge badge-warn">Mode manual</span>`}
      </div>
      <p class="form-note">Nomor pemilik menerima salinan (CC) setiap notifikasi invoice dan pembayaran.
        Tanpa gateway, pesan tetap tersusun otomatis dan dikirim dengan satu klik lewat tombol WhatsApp di dashboard.</p>
      <form method="post" action="${base}/admin/settings/wa">
        <div class="grid-2">
          <div class="field"><label for="owner_wa">WhatsApp pemilik (CC)</label><input id="owner_wa" name="owner_wa" value="${e(waDisplay(settings.owner_wa))}" /></div>
          <div class="field"><label for="company_email">Email perusahaan</label><input id="company_email" name="company_email" type="email" value="${e(settings.company_email)}" /></div>
          <div class="field"><label for="wa_gateway_url">URL gateway WhatsApp</label><input id="wa_gateway_url" name="wa_gateway_url" value="${e(settings.wa_gateway_url)}" /></div>
          <div class="field"><label for="wa_gateway_token">Token gateway (opsional)</label><input id="wa_gateway_token" name="wa_gateway_token" type="password" value="${e(settings.wa_gateway_token)}" placeholder="kosongkan untuk mode manual" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Simpan notifikasi</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Kata sandi admin</h2></div>
      <form method="post" action="${base}/admin/settings/password">
        <div class="grid-2">
          <div class="field"><label for="current">Kata sandi saat ini</label><input id="current" name="current" type="password" required autocomplete="current-password" /></div>
          <div class="field"><label for="baru">Kata sandi baru</label><input id="baru" name="baru" type="password" required minlength="6" autocomplete="new-password" /></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Ubah kata sandi</button>
      </form>
    </section>
  </div>
</main>`;
  return shell({ title: "Pengaturan — Panel Transaksi", base, body, className: "admin-body" });
}

module.exports = { login, dashboard, newInvoice, invoiceDetail, settingsPage };
