/* ============================================================
   JualanAplikasiAI — interaksi halaman
   ============================================================ */
(function () {
  "use strict";

  var WA_NUMBER = "6287846107464";
  var EMAIL = "terrasolusi.net@gmail.com";

  /* ---------- Header shadow on scroll ---------- */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile navigation ---------- */
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("primaryNav");

  function closeNav() {
    if (!nav || !toggle) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") closeNav();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 820) closeNav();
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealTargets = document.querySelectorAll(
    ".section-head, .card, .feature, .step, .about-visual, .about-copy, .contact-info, .contact-form-wrap, .trust-strip, .cta-card"
  );

  if ("IntersectionObserver" in window) {
    revealTargets.forEach(function (el, i) {
      el.classList.add("reveal");
      el.style.transitionDelay = Math.min(i % 4, 3) * 70 + "ms";
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    revealTargets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Quotation form ---------- */
  var form = document.getElementById("quoteForm");
  var errorBox = document.getElementById("formError");
  var emailBtn = document.getElementById("emailBtn");

  function gather() {
    var nama = document.getElementById("nama").value.trim();
    var bisnis = document.getElementById("bisnis").value.trim();
    var wa = document.getElementById("wa").value.trim();
    var kebutuhan = document.getElementById("kebutuhan").value;
    var pesan = document.getElementById("pesan").value.trim();

    if (!nama || !wa || !kebutuhan) {
      if (errorBox) errorBox.hidden = false;
      return null;
    }
    if (errorBox) errorBox.hidden = true;

    var lines = [
      "Halo JualanAplikasiAI, saya ingin meminta penawaran.",
      "",
      "Nama: " + nama,
      "Bisnis: " + (bisnis || "-"),
      "WhatsApp: " + wa,
      "Kebutuhan: " + kebutuhan,
      "Keterangan: " + (pesan || "-"),
      "",
      "Mohon informasi selanjutnya. Terima kasih."
    ];

    return { text: lines.join("\n"), nama: nama, kebutuhan: kebutuhan };
  }

  function sendViaWhatsApp(e) {
    if (e) e.preventDefault();
    var data = gather();
    if (!data) return;
    var url = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(data.text);
    window.open(url, "_blank", "noopener");
  }

  function sendViaEmail() {
    var data = gather();
    if (!data) return;
    var subject = "Permintaan Penawaran Aplikasi AI — " + data.nama;
    var url = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(data.text);
    window.location.href = url;
  }

  if (form) {
    form.addEventListener("submit", sendViaWhatsApp);
    form.addEventListener("input", function () {
      if (errorBox && !errorBox.hidden) errorBox.hidden = true;
    });
  }
  if (emailBtn) emailBtn.addEventListener("click", sendViaEmail);
})();
