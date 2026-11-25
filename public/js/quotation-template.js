function renderQuotationHTML(bill, profile) {
  const safeBill = {
    items: Array.isArray(bill.items) ? bill.items : [],
    billNumber: bill.billNumber || "N/A",
    customerName: bill.customerName || "",
    customerAddress: bill.customerAddress || "",
    customerMobile: bill.customerMobile || "",
    subtotal: Number(bill.subtotal) || 0,
    igst: bill.igst != null ? Number(bill.igst) : (Number(bill.cgst || 0) + Number(bill.sgst || 0)),
    roundOff: bill.roundOff != null ? Number(bill.roundOff) : 0,
    grandTotal: Number(bill.grandTotal) || 0,
    amountInWords: bill.amountInWords || "",
    billDate: bill.billDate || bill.createdAt || bill.date || new Date(),
    createdAt: bill.createdAt || bill.billDate || new Date(),
    documentType: bill.documentType || 'bill'
  };

  // If roundOff is not explicitly stored, derive it automatically
  if (!safeBill.roundOff && safeBill.grandTotal) {
    const raw = safeBill.subtotal + safeBill.igst;
    safeBill.roundOff = Number((safeBill.grandTotal - raw).toFixed(2));
  }

  const business = getBusinessFromProfile(profile);
  const logoUrl = (typeof LOGO_DATA_URL !== "undefined" && LOGO_DATA_URL)
    ? LOGO_DATA_URL
    : (typeof getLogoUrl === "function" ? getLogoUrl() : "images/logo.png");

  const invoiceDate = formatDateInvoice(bill.billDate || bill.createdAt || bill.date || safeBill.billDate);
  let isQuotation = safeBill.documentType === 'quotation';

  const itemRows = safeBill.items.map((item, index) => {
    const amount = calculateLineTotal(item.qty, item.rate);
    const gstRateVal = item.gstRate != null && item.gstRate !== "" ? item.gstRate : (item.gst != null ? item.gst : 5);
    const hsnVal = item.hsn || "";
    const perVal = item.per || "Pcs";
    const qtyVal = formatQty(item.qty);

    return [
      "<tr>",
      `<td class="col-sl">${index + 1}</td>`,
      `<td class="col-desc">${escapeHtml(item.description)}</td>`,
      `<td class="col-hsn">${escapeHtml(hsnVal)}</td>`,
      `<td class="col-gst">${gstRateVal} %</td>`,
      `<td class="col-qty">${qtyVal} ${escapeHtml(perVal)}</td>`,
      `<td class="col-rate">${formatNumberOnly(item.rate)}</td>`,
      `<td class="col-per">${escapeHtml(perVal)}</td>`,
      `<td class="col-amt">${formatNumberOnly(amount)}</td>`,
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

  // BILL TO section
  if (!isQuotation) {
    html += '<div class="q-billto">';
    html += '<div class="q-billto-title">BILL TO</div>';
    html += '<div class="q-billto-row">';
    html += `<span><strong>Name:-</strong> ${escapeHtml(safeBill.customerName || "")}</span>`;
    html += `<span><strong>Date:-</strong> ${invoiceDate}</span>`;
    html += '</div>';
    html += '<div class="q-billto-row">';
    html += `<span><strong>Address:-</strong> ${escapeHtml(safeBill.customerAddress || "")}</span>`;
    html += `<span><strong>Invoice No-</strong> ${escapeHtml(safeBill.billNumber)}</span>`;
    html += '</div>';
    if (safeBill.customerMobile) {
      html += `<div class="q-billto-row q-billto-mobile"><span><strong>Mobile:-</strong> ${escapeHtml(safeBill.customerMobile)}</span></div>`;
    }
    html += '</div>';
  } else {
    html += '<div class="q-billto">';
    html += '<div class="q-billto-title">QUOTATION DETAILS</div>';
    html += '<div class="q-billto-row">';
    html += `<span><strong>Quotation No:-</strong> ${escapeHtml(safeBill.billNumber)}</span>`;
    html += `<span><strong>Date:-</strong> ${invoiceDate}</span>`;
    html += '</div>';
    if (safeBill.customerName) {
      html += `<div class="q-billto-row"><span><strong>Client / Customer:-</strong> ${escapeHtml(safeBill.customerName)}</span></div>`;
    }
    html += '</div>';
  }

  html += `<div class="q-invoice-title">${isQuotation ? 'Quotation Items' : 'Tax Invoice'}</div>`;

  // Main items table with HSN/SAC, GST Rate, Quantity, Rate, per, Amount
  html += '<table class="q-table"><thead><tr>';
  html += '<th class="col-sl">SI<br>No.</th>';
  html += '<th class="col-desc">Description of Goods</th>';
  html += '<th class="col-hsn">HSN/SAC</th>';
  html += '<th class="col-gst">GST<br>Rate</th>';
  html += '<th class="col-qty">Quantity</th>';
  html += '<th class="col-rate">Rate</th>';
  html += '<th class="col-per">per</th>';
  html += '<th class="col-amt">Amount</th>';
  html += '</tr></thead><tbody>';
  html += itemRows;

  // Subtotal, IGST, Round Off, Total
  // Placed inside tbody so that on multi-page print it appears ONCE after the last item, never repeating on earlier pages!
  html += '<tr class="totals-row">';
  html += '<td colspan="7" class="label-cell"></td>';
  html += `<td class="amt-cell">${formatNumberOnly(safeBill.subtotal)}</td>`;
  html += '</tr>';

  html += '<tr class="totals-row">';
  html += '<td colspan="7" class="label-cell" style="font-style: italic;">IGST</td>';
  html += `<td class="amt-cell">${formatNumberOnly(safeBill.igst)}</td>`;
  html += '</tr>';

  html += '<tr class="totals-row">';
  html += '<td colspan="7" class="label-cell" style="font-style: italic;">Round Off</td>';
  html += `<td class="amt-cell">${formatRoundOff(safeBill.roundOff)}</td>`;
  html += '</tr>';

  html += '<tr class="totals-row grand-row">';
  html += '<td colspan="7" class="label-cell"><strong>Total</strong></td>';
  html += `<td class="amt-cell"><strong>₹ ${formatNumberOnly(safeBill.grandTotal)}</strong></td>`;
  html += '</tr>';

  html += '</tbody></table>';

  // Amount Chargeable in words block
  const wordsFormatted = safeBill.amountInWords || formatAmountInWordsINR(safeBill.grandTotal);
  html += '<div class="q-chargeable-box">';
  html += '<div class="q-words-block">';
  html += '<strong>Amount Chargeable (in words)</strong>';
  html += `<p class="q-words-text">${escapeHtml(wordsFormatted)}</p>`;
  html += '</div>';
  html += '<div class="q-eoe">E. &amp; O.E</div>';
  html += '</div>';

  // Bank details & Declaration (Declaration on left, Bank details + Signature on right to match image)
  const holderName = business.accountHolder || business.accountName || business.name;
  html += '<div class="q-footer-grid">';
  html += '<div class="q-declaration"><strong>Declaration</strong>';
  html += `<p>We declare that this ${isQuotation ? 'quotation' : 'invoice'} shows the actual price of the goods described and that all particulars are true and correct.</p>`;
  html += '</div>';

  html += '<div class="q-bank"><strong>Company\'s Bank Details</strong>';
  html += `<p>A/c Holder's Name: <strong>${escapeHtml(holderName)}</strong></p>`;
  html += `<p>Bank Name &nbsp;: <strong>${escapeHtml(business.bankName || "State Bank of India")}</strong></p>`;
  html += `<p>A/c No. &nbsp;&nbsp;&nbsp;&nbsp;: <strong>${escapeHtml(business.accountNo || "")}</strong></p>`;
  html += `<p>Branch &amp; IFS Code: <strong>${escapeHtml(business.ifsc || "")}</strong></p>`;
  html += '<div class="q-signature">';
  html += `<p class="q-sig-company">for <strong>${escapeHtml(business.name)}</strong></p>`;
  html += '<div class="q-sig-wrap"></div>';
  html += '<p class="q-sig-title">Authorised Signatory</p>';
  html += '</div></div></div>';

  const jurisdiction = business.stateName || "DELHI";
  html += `<p class="q-jurisdiction">SUBJECT TO ${escapeHtml(jurisdiction.toUpperCase())} JURISDICTION</p>`;
  html += '<p class="q-generated">This is a Computer Generated Invoice</p>';
  html += '</div>';

  return html;
}
