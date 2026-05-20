function renderQuotationHTML(bill, profile) {
  const safeBill = {
    items: Array.isArray(bill.items) ? bill.items : [],
    billNumber: bill.billNumber || "N/A",
    customerName: bill.customerName || "",
    customerAddress: bill.customerAddress || "",
    customerMobile: bill.customerMobile || "",
    subtotal: Number(bill.subtotal) || 0,
    cgst: Number(bill.cgst) || 0,
    sgst: Number(bill.sgst) || 0,
    grandTotal: Number(bill.grandTotal) || 0,
    amountInWords: bill.amountInWords || "",
    cgstPercent: Number(bill.cgstPercent) || 9,
    sgstPercent: Number(bill.sgstPercent) || 9,
    createdAt: bill.createdAt || new Date()
  };

  const business = getBusinessFromProfile(profile);
  const logoUrl = getLogoUrl();
  const invoiceDate = formatDateInvoice(safeBill.createdAt);
  const cgstPct = safeBill.cgstPercent;
  const sgstPct = safeBill.sgstPercent;

  const itemRows = safeBill.items.map((item, index) => {
    const amount = calculateLineTotal(item.qty, item.rate);
    return [
      "<tr>",
      `<td class="col-sl">${index + 1}</td>`,
      `<td class="col-desc">${escapeHtml(item.description)}</td>`,
      `<td class="col-qty">${formatQty(item.qty)}</td>`,
      `<td class="col-rate">${formatCurrency(item.rate)}</td>`,
      `<td class="col-per">${escapeHtml(item.per || "pcs")}</td>`,
      `<td class="col-amt">${formatCurrency(amount)}</td>`,
      "</tr>"
    ].join("");
  }).join("");

  const gstLine = business.gstin
    ? `GSTIN : ${escapeHtml(business.gstin)}${business.stateCode && business.stateName ? ` , STATE: ${escapeHtml(business.stateCode)} ${escapeHtml(business.stateName)}` : ""}`
    : "";

  let html = '<div class="quotation-document" id="quotationDocument">';

  html += '<div class="q-header"><div class="q-logo-wrap">';
  html += `<img src="${logoUrl}" alt="Company Logo" class="q-logo" crossorigin="anonymous" loading="eager" onerror="console.warn('Logo failed to load'); this.style.visibility='hidden'">`;
  html += '</div><div class="q-company">';
  html += `<h1 class="q-company-name">${escapeHtml(business.name)}</h1>`;
  html += `<p>${escapeHtml(business.address)}</p>`;
  html += `<p>Mobile - (+91) ${escapeHtml(business.mobile)}, Email Id- ${escapeHtml(business.email)}</p>`;
  if (business.tagline) html += `<p class="q-tagline">${escapeHtml(business.tagline)}</p>`;
  html += '</div></div>';

  html += '<div class="q-billto">';
  html += '<div class="q-billto-title">BILL TO</div>';
  html += '<div class="q-billto-row">';
  html += `<span><strong>Name:-</strong> ${escapeHtml(bill.customerName || "")}</span>`;
  html += `<span><strong>Date:-</strong> ${invoiceDate}</span>`;
  html += '</div>';
  html += '<div class="q-billto-row">';
  html += `<span><strong>Address:-</strong> ${escapeHtml(bill.customerAddress || "")}</span>`;
  html += `<span><strong>Invoice No-</strong> ${escapeHtml(bill.billNumber)}</span>`;
  html += '</div>';
  if (bill.customerMobile) {
    html += `<div class="q-billto-row q-billto-mobile"><span><strong>Mobile:-</strong> ${escapeHtml(bill.customerMobile)}</span></div>`;
  }
  html += '</div>';

  html += '<div class="q-invoice-title">Tax Invoice</div>';

  html += '<table class="q-table"><thead><tr>';
  html += '<th class="col-sl">SI No.</th>';
  html += '<th class="col-desc">Description</th>';
  html += '<th class="col-qty">Quantity</th>';
  html += '<th class="col-rate">Rate</th>';
  html += '<th class="col-per">per</th>';
  html += '<th class="col-amt">Amount</th>';
  html += '</tr></thead><tbody>';
  html += itemRows;
  html += '</tbody><tfoot>';
  html += '<tr class="totals-row"><td colspan="4" rowspan="4" class="amount-words-cell">';
  html += '<strong>Amount Chargeable (in words)</strong><br>';
  html += escapeHtml(bill.amountInWords || numberToWordsIndian(bill.grandTotal));
  html += '</td><td class="label-cell">Total Amount</td>';
  html += `<td class="amt-cell">${formatCurrency(bill.subtotal)}</td></tr>`;
  html += `<tr class="totals-row"><td class="label-cell">CGST(${cgstPct}%)</td>`;
  html += `<td class="amt-cell">${formatCurrency(bill.cgst)}</td></tr>`;
  html += `<tr class="totals-row"><td class="label-cell">SGST(${sgstPct}%)</td>`;
  html += `<td class="amt-cell">${formatCurrency(bill.sgst)}</td></tr>`;
  html += '<tr class="totals-row grand-row"><td class="label-cell"><strong>Grand Total</strong></td>';
  html += `<td class="amt-cell"><strong>${formatCurrency(bill.grandTotal)}</strong></td></tr>`;
  html += '</tfoot></table>';

  html += '<div class="q-footer-grid">';
  html += '<div class="q-bank"><strong>BANK DETAILS:</strong>';
  html += `<p>${escapeHtml(business.bankName)}</p>`;
  html += `<p>A/C No- ${escapeHtml(business.accountNo)}, IFSC Code- ${escapeHtml(business.ifsc)}</p>`;
  html += '</div>';
  html += '<div class="q-declaration"><strong>Declaration</strong>';
  html += '<p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>';
  html += '<div class="q-signature">';
  html += `<p>For ${escapeHtml(business.name)}</p>`;
  html += '<div class="sig-line"></div>';
  html += '<p>Authorized Signature</p>';
  html += '</div></div></div>';

  if (gstLine) html += `<p class="q-gstin">${gstLine}</p>`;
  html += '<p class="q-generated">This is a Computer Generated Invoice</p>';
  html += '</div>';

  return html;
}
