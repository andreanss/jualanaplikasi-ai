"use strict";

/** Escape HTML. */
function e(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Kerangka halaman. */
function shell({ title, base = "", body, className = "", robots = "noindex,nofollow" }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(title)}</title>
<meta name="robots" content="${robots}" />
<meta name="theme-color" content="#057A55" />
<link rel="icon" href="${base}/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${base}/style.css" />
<link rel="stylesheet" href="${base}/admin.css" />
</head>
<body class="${e(className)}">
${body}
<script src="${base}/admin.js"></script>
</body>
</html>`;
}

function badge(status) {
  const map = {
    unpaid: ["Belum dibayar", "badge-warn"],
    claimed: ["Menunggu verifikasi", "badge-claim"],
    paid: ["Lunas", "badge-ok"],
    cancelled: ["Dibatalkan", "badge-muted"],
  };
  const [label, cls] = map[status] || [status, "badge-muted"];
  return `<span class="badge ${cls}">${e(label)}</span>`;
}

function adminNav(base, active) {
  const items = [
    ["/admin", "Dashboard", "dashboard"],
    ["/admin/invoice/new", "Invoice Baru", "new"],
    ["/admin/settings", "Pengaturan", "settings"],
  ];
  return `<header class="admin-topbar">
  <div class="admin-topbar-inner">
    <a class="brand brand-sm" href="${base}/admin">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.5 7.5l2.5 1.5M17 15l2.5 1.5M4.5 16.5L7 15M17 9l2.5-1.5"/><circle cx="12" cy="12" r="3.4"/></svg>
      </span>
      <span class="brand-text"><strong>JualanAplikasi<span>AI</span></strong><small>Panel transaksi</small></span>
    </a>
    <nav class="admin-nav" aria-label="Navigasi admin">
      ${items
        .map(
          ([href, label, key]) =>
            `<a href="${base}${href}"${active === key ? ' class="is-active"' : ""}>${label}</a>`
        )
        .join("")}
      <a href="${base}/" target="_blank" rel="noopener">Lihat Situs</a>
      <form method="post" action="${base}/admin/logout" class="inline-form">
        <button type="submit" class="linkbtn">Keluar</button>
      </form>
    </nav>
  </div>
</header>`;
}

function alertBox(type, message) {
  if (!message) return "";
  return `<div class="alert alert-${e(type)}">${e(message)}</div>`;
}

module.exports = { e, shell, badge, adminNav, alertBox };
