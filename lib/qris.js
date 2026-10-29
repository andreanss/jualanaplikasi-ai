"use strict";
/**
 * QRIS (EMVCo Merchant Presented QR) tools.
 *
 * - validateStatic()/info()  : membaca payload QRIS statis milik merchant
 * - toDynamic()              : menyisipkan nominal ke payload statis (tag 54) sehingga
 *                              menjadi QRIS dinamis satu-kali-bayar, dengan CRC16 dihitung ulang
 * - decodeImage()            : membaca payload QRIS dari foto/screenshot QR (PNG/JPEG)
 *
 * Spesifikasi: EMV QRCPS, CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) pada tag 63.
 */

const jsQR = require("jsqr");
const { PNG } = require("pngjs");
const jpeg = require("jpeg-js");

/** CRC16-CCITT-FALSE */
function crc16(input) {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Parse payload menjadi daftar TLV top-level. */
function parseTLV(payload) {
  const out = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) break;
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) {
      throw new Error(`Struktur TLV tidak valid pada posisi ${i} (tag "${tag}", panjang "${lenStr}").`);
    }
    const len = parseInt(lenStr, 10);
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error("Panjang data TLV tidak cocok dengan isinya.");
    out.push({ tag, len, value });
    i += 4 + len;
  }
  return out;
}

function serialize(entries) {
  return entries
    .map((e) => e.tag + String(e.value.length).padStart(2, "0") + e.value)
    .join("");
}

/** Periksa keberadaan & kebenaran CRC (tag 63). */
function checkCRC(payload) {
  if (!/6304[0-9A-Fa-f]{4}$/.test(payload)) return { ok: false, reason: "Tag CRC (63) tidak ditemukan di akhir payload." };
  const body = payload.slice(0, -4);
  const given = payload.slice(-4).toUpperCase();
  const calc = crc16(body);
  if (given !== calc) return { ok: false, reason: `CRC tidak cocok (terbaca ${given}, seharusnya ${calc}).` };
  return { ok: true };
}

function mapOf(entries) {
  const m = {};
  for (const e of entries) m[e.tag] = e.value;
  return m;
}

/** Validasi payload QRIS statis/dinamis dari merchant. */
function validate(payload) {
  // Hanya buang spasi baris/tab; spasi di dalam nama merchant harus dipertahankan.
  const clean = String(payload || "").replace(/[\r\n\t]+/g, "").trim();
  if (!clean) return { ok: false, reason: "Payload kosong." };
  if (!/^0002\d{2}01$/.test(clean.slice(0, 6)) && !clean.startsWith("000201")) {
    return { ok: false, reason: "Ini bukan payload QRIS (harus diawali 000201)." };
  }
  let entries;
  try {
    entries = parseTLV(clean);
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  const crc = checkCRC(clean);
  if (!crc.ok) return { ok: false, reason: crc.reason };
  const m = mapOf(entries);
  if (!m["00"] || m["00"] !== "01") return { ok: false, reason: "Payload format indicator harus 01." };
  if (!m["53"] || m["53"] !== "360") return { ok: false, reason: "Mata uang QRIS harus 360 (IDR)." };
  if (!m["59"]) return { ok: false, reason: "Nama merchant (tag 59) tidak ditemukan." };
  return { ok: true, payload: clean, entries };
}

/** Ringkasan informasi merchant dari payload. */
function info(payload) {
  try {
    const entries = parseTLV(String(payload || "").replace(/[\r\n\t]+/g, "").trim());
    const m = mapOf(entries);
    let nmid = "";
    let pan = "";
    if (m["51"]) {
      try {
        const sub = mapOf(parseTLV(m["51"]));
        nmid = sub["03"] || "";
        pan = sub["02"] || "";
      } catch (_) {
        /* abaikan */
      }
    }
    return {
      static: m["01"] === "11",
      merchant: m["59"] || "",
      city: m["60"] || "",
      country: m["58"] || "",
      postal: m["61"] || "",
      currency: m["53"] || "",
      nmid,
      pan,
      hasAmount: Boolean(m["54"]),
      amount: m["54"] || "",
      acquirer: m["51"] ? "terbaca" : "",
    };
  } catch (_) {
    return null;
  }
}

/**
 * Ubah payload QRIS menjadi dinamis dengan nominal tertentu.
 * @param {string} payload payload QRIS statis merchant (sudah lolos validate())
 * @param {number} amount  nominal rupiah (bilangan bulat)
 */
function toDynamic(payload, amount) {
  const v = validate(payload);
  if (!v.ok) throw new Error(v.reason);
  const nominal = Math.round(Number(amount));
  if (!Number.isFinite(nominal) || nominal < 1) throw new Error("Nominal tidak valid.");

  const entries = v.entries.filter((e) => e.tag !== "63");
  const m = mapOf(entries);

  // 01: 11 = statis, 12 = dinamis (satu kali bayar)
  m["01"] = "12";
  // nominal tetap; hapus indikator tip agar tidak bentrok dengan nominal
  m["54"] = String(nominal);
  delete m["55"];

  // Urutkan tag secara numerik, CRC selalu paling akhir.
  const tags = Object.keys(m)
    .filter((t) => t !== "63")
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const body = serialize(tags.map((t) => ({ tag: t, len: m[t].length, value: m[t] })));
  const withCrcTag = body + "6304";
  const dynamic = withCrcTag + crc16(withCrcTag);

  const verify = validate(dynamic);
  if (!verify.ok) throw new Error("QRIS dinamis gagal diverifikasi: " + verify.reason);
  const vm = mapOf(verify.entries);
  if (vm["54"] !== String(nominal)) throw new Error("Nominal gagal disisipkan ke QRIS.");
  if (vm["01"] !== "12") throw new Error("Penanda QRIS dinamis gagal diset.");
  return dynamic;
}

/** Baca payload QRIS dari buffer gambar (PNG/JPEG). */
function decodeImage(buf) {
  let width;
  let height;
  let data;

  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;

  if (isPng) {
    const png = PNG.sync.read(buf);
    width = png.width;
    height = png.height;
    data = png.data;
  } else if (isJpeg) {
    const raw = jpeg.decode(buf, { useTArray: true });
    width = raw.width;
    height = raw.height;
    data = raw.data;
  } else {
    throw new Error("Format gambar harus PNG atau JPG.");
  }

  const result = jsQR(new Uint8ClampedArray(data), width, height);
  if (!result || !result.data) {
    throw new Error("QR tidak terbaca. Pastikan gambar QRIS tajam dan tidak terpotong.");
  }
  return result.data;
}

module.exports = { crc16, parseTLV, validate, info, toDynamic, decodeImage };
