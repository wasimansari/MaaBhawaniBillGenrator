function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return "₹ " + value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatNumberOnly(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatRoundOff(val) {
  const num = Number(val) || 0;
  if (Math.abs(num) < 0.0001) return "0.00";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatQty(qty) {
  return Number(qty).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseDateSafely(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  // Firestore Timestamp instance with toDate()
  if (typeof value.toDate === "function") {
    try {
      const d = value.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) { }
  }

  // Serialized Firestore Timestamp: { seconds: ..., nanoseconds: ... } or { _seconds: ... }
  if (typeof value === "object") {
    if (typeof value.seconds === "number" && !isNaN(value.seconds)) {
      return new Date(value.seconds * 1000);
    }
    if (typeof value._seconds === "number" && !isNaN(value._seconds)) {
      return new Date(value._seconds * 1000);
    }
  }

  // Numeric timestamp in milliseconds or seconds
  if (typeof value === "number" && !isNaN(value)) {
    return value > 1e11 ? new Date(value) : new Date(value * 1000);
  }

  // String date format
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    const isoMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10) - 1;
      const d = parseInt(isoMatch[3], 10);
      const res = new Date(y, m, d);
      if (!isNaN(res.getTime())) return res;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10) - 1;
      const y = parseInt(dmyMatch[3], 10);
      const res = new Date(y, m, d);
      if (!isNaN(res.getTime())) return res;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function formatDate(value) {
  const date = parseDateSafely(value);
  if (!date) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateInvoice(value) {
  const date = parseDateSafely(value) || new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN"
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function threeDigits(n) {
  if (n === 0) return "";
  if (n < 100) return twoDigits(n);
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [ONES[hundred] + " HUNDRED", twoDigits(rest)].filter(Boolean).join(" ");
}

function numberToWordsIndian(amount) {
  const value = Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
  if (!value) return "ZERO RUPEES ONLY";

  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  const parts = [];

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundredRest = rupees % 1000;

  if (crore) parts.push(threeDigits(crore) + " CRORE");
  if (lakh) parts.push(twoDigits(lakh) + " LAKH");
  if (thousand) parts.push(twoDigits(thousand) + " THOUSAND");
  if (hundredRest) parts.push(threeDigits(hundredRest));

  let words = parts.join(" ").trim() + " RUPEES";
  if (paise) words += " AND " + twoDigits(paise) + " PAISE";
  return words + " ONLY";
}

function calculateLineTotal(qty, rate) {
  return (Number(qty) || 0) * (Number(rate) || 0);
}

function toTitleCaseWords(str) {
  return String(str).toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAmountInWordsINR(amount) {
  const words = numberToWordsIndian(amount);
  const cleaned = words.replace(/ RUPEES ONLY$/i, "").replace(/ ONLY$/i, "");
  return "INR " + toTitleCaseWords(cleaned) + " Only";
}

function calculateQuotationTotals(items, igstOverride = null, legacySgst = null) {
  let subtotal = 0;
  let totalIgst = 0;

  (items || []).forEach((item) => {
    const lineTotal = calculateLineTotal(item.qty, item.rate);
    subtotal += lineTotal;
    const rate = Number(item.gstRate != null && item.gstRate !== "" ? item.gstRate : (item.gst != null ? item.gst : 0));
    const lineTax = lineTotal * (rate / 100);
    totalIgst += lineTax;
  });

  // If no item-level tax was specified, check if overall override was provided (or legacy cgst+sgst)
  if (totalIgst === 0) {
    const overrideVal = (Number(igstOverride) || 0) + (Number(legacySgst) || 0);
    if (overrideVal > 0) {
      totalIgst = subtotal * (overrideVal / 100);
    }
  }

  totalIgst = Math.round(totalIgst * 100) / 100;
  subtotal = Math.round(subtotal * 100) / 100;

  const rawTotal = subtotal + totalIgst;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));

  return {
    subtotal,
    igst: totalIgst,
    cgst: 0,
    sgst: 0,
    roundOff,
    grandTotal,
    amountInWords: formatAmountInWordsINR(grandTotal)
  };
}

function getLogoUrl() {
  if (typeof LOGO_DATA_URL !== "undefined" && LOGO_DATA_URL) {
    return LOGO_DATA_URL;
  }
  return "images/logo.png";
}

function getSignatureUrl() {
  if (typeof SIGNATURE_DATA_URL !== "undefined" && SIGNATURE_DATA_URL) {
    return SIGNATURE_DATA_URL;
  }
  return "images/signature.png";
}

function getBusinessFromProfile(profile) {
  const p = profile || {};
  const business = p.business || {};
  return {
    name: business.name || p.name || "Maa Bhawani Enterprises",
    address: business.address || "Motipur, Muzaffarpur, Bihar, 843111.",
    mobile: business.mobile || "8789703832",
    email: business.email || "yadavwanshigroupofcompany@gmail.com",
    gstin: business.gstin || "10IXRPD8555F1Z9",
    stateCode: business.stateCode || "10",
    stateName: business.stateName || "Bihar",
    tagline: business.tagline || "Government Contractor & Order Supplier.",
    bankName: (business.bankName && business.bankName !== "Uttar Bihar Gramin Bank, Fulwariya") ? business.bankName : (business.bankName || "Bihar Gramin Bank, Fulwariya"),
    accountNo: business.accountNo || "1080851130010536",
    ifsc: (business.ifsc && business.ifsc !== "CBIN0R10001") ? business.ifsc : "PUNB0MBGB06"
  };
}

function isLegacyDummyCatalog(items) {
  if (!Array.isArray(items) || items.length === 0) return true;
  const itemNames = items.map((it) => ((typeof it === "string" ? it : it.description) || "").toLowerCase().trim());
  const hasRealItems = itemNames.some((name) =>
    name === "plastic chair" || name === "ceiling fan" || name === "led bulb 12w" || name === "student attendance register"
  );
  if (hasRealItems) return false;

  const hasDummyItems = itemNames.some((name) =>
    name.includes("football") || name.includes("cricket") || name.includes("badminton") ||
    name === "monitor(24 inch)" || name === "keyboard" || name === "wireless mouse" || name === "ups 600va"
  );
  return hasDummyItems;
}
