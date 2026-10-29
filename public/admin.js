/* Panel transaksi JualanAplikasiAI — interaksi ringan */
(function () {
  "use strict";

  /* ---------- salin teks ---------- */
  document.addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-copy], .copy-btn");
    if (!btn) return;
    const text = btn.getAttribute("data-copy");
    if (!text) return;
    const done = function () {
      const original = btn.textContent;
      btn.textContent = "Tersalin ✓";
      setTimeout(function () { btn.textContent = original; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
      done();
    }
  });

  /* ---------- item invoice dinamis ---------- */
  const itemsWrap = document.getElementById("items");
  const addItem = document.getElementById("addItem");
  if (itemsWrap && addItem) {
    const template = itemsWrap.querySelector("[data-row]");
    addItem.addEventListener("click", function () {
      const row = template.cloneNode(true);
      row.querySelectorAll("input").forEach(function (input) {
        if (input.name === "item_qty") input.value = "1";
        else input.value = "";
      });
      itemsWrap.appendChild(row);
      const first = row.querySelector('input[name="item_name"]');
      if (first) first.focus();
    });
    itemsWrap.addEventListener("click", function (ev) {
      const rm = ev.target.closest(".item-remove");
      if (!rm) return;
      const rows = itemsWrap.querySelectorAll("[data-row]");
      if (rows.length <= 1) {
        rows[0].querySelectorAll("input").forEach(function (i) {
          if (i.name === "item_qty") i.value = "1"; else i.value = "";
        });
        return;
      }
      rm.closest("[data-row]").remove();
    });
  }

  /* ---------- unggah gambar QRIS ---------- */
  const upload = document.getElementById("qrisUpload");
  if (upload) {
    const input = document.getElementById("qrisFile");
    const status = document.getElementById("uploadStatus");
    const base = upload.getAttribute("data-base") || "";
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (!file) return;
      status.className = "upload-status";
      status.textContent = "Membaca kode QRIS…";
      const reader = new FileReader();
      reader.onload = function () {
        fetch(base + "/admin/settings/qris/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: reader.result }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok) {
              status.className = "upload-status ok";
              status.textContent = "QRIS tersimpan: " + (data.merchant || "merchant") +
                (data.nmid ? " · NMID " + data.nmid : "") + ". Memuat ulang…";
              setTimeout(function () { window.location.reload(); }, 1100);
            } else {
              status.className = "upload-status err";
              status.textContent = data.error || "Gagal menyimpan QRIS.";
            }
          })
          .catch(function () {
            status.className = "upload-status err";
            status.textContent = "Gagal mengunggah gambar. Coba lagi.";
          });
      };
      reader.readAsDataURL(file);
    });
  }
})();
