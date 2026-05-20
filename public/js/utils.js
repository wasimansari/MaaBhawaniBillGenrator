function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return "₹ " + value.toLocaleString("en-IN", {
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

function formatDate(value) {
  if (!value) return "-";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateInvoice(value) {
  const date = value
    ? (value.toDate ? value.toDate() : new Date(value))
    : new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
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

function calculateQuotationTotals(items, cgstPercent, sgstPercent) {
  const subtotal = items.reduce((sum, item) => sum + calculateLineTotal(item.qty, item.rate), 0);
  const cgst = subtotal * (Number(cgstPercent) || 0) / 100;
  const sgst = subtotal * (Number(sgstPercent) || 0) / 100;
  const grandTotal = subtotal + cgst + sgst;
  return {
    subtotal,
    cgst,
    sgst,
    grandTotal,
    amountInWords: numberToWordsIndian(grandTotal)
  };
}

function getLogoUrl() {
  return "images/logo.png";
}

function getBusinessFromProfile(profile) {
  const business = profile.business || {};
  return {
    name: business.name || profile.name || "Your Business Name",
    address: business.address || profile.address || "",
    mobile: business.mobile || profile.mobile || "",
    email: business.email || profile.email || "",
    gstin: business.gstin || "",
    stateCode: business.stateCode || "",
    stateName: business.stateName || "",
    tagline: business.tagline || "",
    bankName: business.bankName || "",
    accountNo: business.accountNo || "",
    ifsc: business.ifsc || ""
  };
}
