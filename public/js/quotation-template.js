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
    createdAt: bill.createdAt || new Date(),
    documentType: bill.documentType || 'bill'
  };

  const business = getBusinessFromProfile(profile);
  const logoUrl = (typeof LOGO_DATA_URL !== "undefined" && LOGO_DATA_URL)
    ? LOGO_DATA_URL
    : (typeof getLogoUrl === "function" ? getLogoUrl() : "images/logo.png");

  const signatureUrl = (typeof SIGNATURE_DATA_URL !== "undefined" && SIGNATURE_DATA_URL)
    ? SIGNATURE_DATA_URL
    : (typeof getSignatureUrl === "function" ? getSignatureUrl() : "images/signature.png");
  const invoiceDate = formatDateInvoice(safeBill.createdAt);
  const cgstPct = safeBill.cgstPercent;
  const sgstPct = safeBill.sgstPercent;
  
  // Determine if this is a quotation
  // Check both documentType and if billNumber seems auto-generated (quotations have random numbers)
  let isQuotation = safeBill.documentType === 'quotation';
  
  // Debug logging
  console.log("[QUOTATION] Bill object keys:", Object.keys(bill));
  console.log("[QUOTATION] Bill.documentType from DB:", bill.documentType);
  console.log("[QUOTATION] SafeBill.documentType:", safeBill.documentType);
  console.log("[QUOTATION] isQuotation result:", isQuotation);

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

  // Watermark logo centered in background of invoice & PDF
  html += '<div class="q-watermark" aria-hidden="true">';
  html += `<img src="${logoUrl}" alt="" class="q-watermark-img" width="300" height="300" loading="eager" onerror="this.style.display='none'">`;
  html += '</div>';

  html += '<div class="q-header">';
  html += '<div class="q-company">';
  html += `<h1 class="q-company-name">${escapeHtml(business.name)}</h1>`;
  if (gstLine) html += `<p class="q-company-gstin">${gstLine}</p>`;
  html += `<p class="q-company-address">${escapeHtml(business.address)}</p>`;
  html += `<p class="q-company-contact">Mobile - (+91) ${escapeHtml(business.mobile)}${business.email ? ` | Email - ${escapeHtml(business.email)}` : ""}</p>`;
  if (business.tagline) html += `<p class="q-tagline">${escapeHtml(business.tagline)}</p>`;
  html += '</div>';
  html += '<div class="q-logo-wrap">';
  html += `<img src="${logoUrl}" alt="Company Logo" class="q-logo" loading="eager" onerror="console.warn('Logo failed to load:', this.src); this.style.display='none'">`;
  html += '</div>';
  html += '</div>';

  // Show BILL TO section only for bills, not for quotations
  if (!isQuotation) {
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
  } else {
    // Show QUOTATION heading and details for quotations
    html += '<div class="q-billto">';
    html += '<div class="q-billto-title">QUOTATION DETAILS</div>';
    html += '<div class="q-billto-row">';
    html += `<span><strong>Quotation No:-</strong> ${escapeHtml(bill.billNumber)}</span>`;
    html += `<span><strong>Date:-</strong> ${invoiceDate}</span>`;
    html += '</div>';
    if (bill.customerName) {
      html += `<div class="q-billto-row"><span><strong>Client / Customer:-</strong> ${escapeHtml(bill.customerName)}</span></div>`;
    }
    html += '</div>';
  }

  html += `<div class="q-invoice-title">${isQuotation ? 'Quotation Items' : 'Tax Invoice'}</div>`;

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
  html += `<p>We declare that this ${isQuotation ? 'quotation' : 'invoice'} shows the actual price of the goods described and that all particulars are true and correct.</p>`;
  html += '<div class="q-signature">';
  html += `<p class="q-sig-company">For ${escapeHtml(business.name)}</p>`;
  html += '<div class="q-sig-wrap">';
  html += `<img src="${signatureUrl}" alt="Signature" class="q-signature-img" loading="eager" onerror="this.style.display='none'">`;
  html += '</div>';
  html += '<p class="q-sig-title">Authorized Signature</p>';
  html += '</div></div></div>';

  html += '<p class="q-generated">This is a Computer Generated Invoice</p>';
  html += '</div>';

  return html;
}
