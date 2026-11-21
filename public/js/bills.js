const DEFAULT_CATALOG_ITEMS = [
  { description: "MONITOR(24 INCH)", per: "pcs", rate: 9500 },
  { description: "KEYBOARD", per: "pcs", rate: 550 },
  { description: "WIRELESS MOUSE", per: "pcs", rate: 450 },
  { description: "UPS 600VA", per: "pcs", rate: 2850 },
  { description: "UPS 1 KVA", per: "pcs", rate: 4850 },
  { description: "CCTV CAMERA 4 MP", per: "pcs", rate: 1850 },
  { description: "CCTV CAMERA 2 MP", per: "pcs", rate: 1250 },
  { description: "SMPS 5 AMP", per: "pcs", rate: 450 }
];

let catalogItems = [];
let pendingRowForNewItem = null;

async function ensureAuthenticatedUser() {
  if (auth.currentUser) return auth.currentUser;
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser;
  }
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
}

function formatSerialNumber(prefix, num, padLength = 4) {
  return `${prefix}-${String(num).padStart(padLength, "0")}`;
}

async function getNextSerialNumber(userId, documentType = "bill") {
  const isQuotation = documentType === "quotation";
  const prefix = isQuotation ? "QTN" : "INV";
  const field = isQuotation ? "quotationCounter" : "invoiceCounter";

  if (!userId) {
    return formatSerialNumber(prefix, 1);
  }

  try {
    const counterDoc = await db.collection("counters").doc(userId).get();
    if (counterDoc.exists) {
      const current = Number(counterDoc.data()[field]);
      if (!isNaN(current) && current > 0) {
        return formatSerialNumber(prefix, current + 1);
      }
    }

    // If counter document does not exist yet, check existing bills count
    const existingSnap = await db.collection("bills")
      .where("userId", "==", userId)
      .where("documentType", "==", documentType)
      .get();

    let maxNum = 0;
    existingSnap.forEach((doc) => {
      const bNum = doc.data().billNumber || "";
      const match = bNum.match(/(\d+)$/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > maxNum) maxNum = val;
      }
    });

    const nextNum = (maxNum > 0 ? maxNum : existingSnap.size) + 1;
    return formatSerialNumber(prefix, nextNum);
  } catch (error) {
    console.warn("[COUNTER] Could not query next serial number:", error);
    return formatSerialNumber(prefix, 1);
  }
}

async function allocateSerialNumber(userId, documentType, requestedValue) {
  const isQuotation = documentType === "quotation";
  const prefix = isQuotation ? "QTN" : "INV";
  const field = isQuotation ? "quotationCounter" : "invoiceCounter";
  const counterRef = db.collection("counters").doc(userId);

  // If user typed a custom alphanumeric invoice number, preserve it and update counter if needed
  if (requestedValue && requestedValue.trim() && !requestedValue.trim().startsWith("Auto-")) {
    const trimmed = requestedValue.trim();
    const match = trimmed.match(new RegExp(`^${prefix}-(\\d+)`, "i"));
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        try {
          const doc = await counterRef.get();
          const current = (doc.exists && Number(doc.data()[field])) || 0;
          if (num > current) {
            await counterRef.set({
              [field]: num,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
        } catch (e) {
          console.warn("[COUNTER] Error updating counter for custom number:", e);
        }
      }
    }
    return trimmed;
  }

  // Atomically allocate the next serial-wise number
  let allocated = "";
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);
      let current = 0;
      if (doc.exists) {
        current = Number(doc.data()[field]) || 0;
      } else {
        const snap = await db.collection("bills")
          .where("userId", "==", userId)
          .where("documentType", "==", documentType)
          .get();
        current = snap.size;
      }

      const next = current + 1;
      transaction.set(counterRef, {
        [field]: next,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      allocated = formatSerialNumber(prefix, next);
    });
  } catch (err) {
    console.warn("[COUNTER] Transaction error, using direct set fallback:", err);
    const doc = await counterRef.get();
    let current = (doc.exists && Number(doc.data()[field])) || 0;
    const next = current + 1;
    await counterRef.set({
      [field]: next,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    allocated = formatSerialNumber(prefix, next);
  }

  return allocated;
}

function getCustomerNameField() {
  const checkedRadio = document.querySelector('input[name="documentType"]:checked');
  if (checkedRadio && checkedRadio.value === "quotation") {
    return document.getElementById("quotationCustomer") || document.getElementById("customerName");
  }
  return document.getElementById("customerName");
}

function getCustomerMobileField() {
  return document.getElementById("customerMobile");
}

function getCustomerAddressField() {
  return document.getElementById("customerAddress");
}

function getDateField() {
  const checkedRadio = document.querySelector('input[name="documentType"]:checked');
  if (checkedRadio && checkedRadio.value === "quotation") {
    return document.getElementById("quotationDate") || document.getElementById("billDate");
  }
  return document.getElementById("billDate");
}

function getInvoiceNumberField() {
  const checkedRadio = document.querySelector('input[name="documentType"]:checked');
  if (checkedRadio && checkedRadio.value === "quotation") {
    return document.getElementById("quotationNumber") || document.getElementById("invoiceNumber");
  }
  return document.getElementById("invoiceNumber");
}

function initDocumentTypeToggle() {
  const billToSection = document.getElementById("billToSection");
  const quotationSection = document.getElementById("quotationSection");
  const documentTypeRadios = document.querySelectorAll('input[name="documentType"]');

  async function updateSections() {
    const checkedRadio = document.querySelector('input[name="documentType"]:checked');
    const documentType = checkedRadio ? checkedRadio.value : "bill";
    const user = await ensureAuthenticatedUser();

    if (documentType === "quotation") {
      if (billToSection) billToSection.style.display = "none";
      if (quotationSection) quotationSection.style.display = "block";
      const h2 = document.querySelector("h2");
      if (h2) h2.textContent = "Create Quotation";
      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.textContent = "Save & Download Quotation";

      const qtnField = document.getElementById("quotationNumber");
      if (qtnField && !qtnField.value && user) {
        qtnField.value = await getNextSerialNumber(user.uid, "quotation");
      }
    } else {
      if (billToSection) billToSection.style.display = "block";
      if (quotationSection) quotationSection.style.display = "none";
      const h2 = document.querySelector("h2");
      if (h2) h2.textContent = "Create Tax Invoice";
      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.textContent = "Save & Download Invoice";

      const invField = document.getElementById("invoiceNumber");
      if (invField && !invField.value && user) {
        invField.value = await getNextSerialNumber(user.uid, "bill");
      }
    }
  }

  documentTypeRadios.forEach((radio) => {
    radio.removeEventListener("change", updateSections);
    radio.addEventListener("change", updateSections);
  });

  updateSections();
}

async function loadCatalogItems(userId) {
  try {
    const profile = await loadSellerProfile(userId);
    let items = profile.additionalItems || [];

    if (!Array.isArray(items) || items.length === 0) {
      items = [...DEFAULT_CATALOG_ITEMS];
      // Save default catalog to user profile in Firestore
      await db.collection("users").doc(userId).set({
        additionalItems: items
      }, { merge: true });
    }

    catalogItems = items.map((it) => {
      if (typeof it === "string") return { description: it, per: "pcs", rate: 0 };
      return {
        description: it.description || "",
        per: it.per || "pcs",
        rate: Number(it.rate) || 0
      };
    }).filter((it) => it.description.trim() !== "");

    return catalogItems;
  } catch (error) {
    console.error("[CATALOG] Error loading catalog:", error);
    catalogItems = [...DEFAULT_CATALOG_ITEMS];
    return catalogItems;
  }
}

function populateItemSelect(selectEl, selectedValue = "") {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "-- Select Item --";
  selectEl.appendChild(defaultOpt);

  let matchFound = false;

  catalogItems.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.description;
    // Show ONLY item name in dropdown, not with amount
    opt.textContent = item.description;
    if (item.description === selectedValue) {
      opt.selected = true;
      matchFound = true;
    }
    selectEl.appendChild(opt);
  });

  // If a previously saved item is not currently in catalog, keep it as an option
  if (selectedValue && !matchFound && selectedValue !== "__ADD_NEW__") {
    const customOpt = document.createElement("option");
    customOpt.value = selectedValue;
    customOpt.textContent = selectedValue;
    customOpt.selected = true;
    selectEl.appendChild(customOpt);
  }

  const addNewOpt = document.createElement("option");
  addNewOpt.value = "__ADD_NEW__";
  addNewOpt.textContent = "+ Add New Item to Dropdown...";
  addNewOpt.style.fontWeight = "bold";
  selectEl.appendChild(addNewOpt);
}

function updateAllItemDropdowns() {
  const selects = document.querySelectorAll(".item-row .item-desc");
  selects.forEach((select) => {
    const currentVal = select.value;
    populateItemSelect(select, currentVal);
  });
}

async function addNewCatalogItem(itemName, unit = "pcs", rate = 0) {
  const trimmed = String(itemName || "").trim();
  if (!trimmed) {
    throw new Error("Item name cannot be empty.");
  }

  const numRate = Number(rate) || 0;
  const strUnit = String(unit || "pcs").trim() || "pcs";

  // Check if item already exists (case-insensitive)
  const existing = catalogItems.find(
    (it) => it.description.toLowerCase() === trimmed.toLowerCase()
  );

  let resultItem = existing;

  if (!existing) {
    resultItem = { description: trimmed, per: strUnit, rate: numRate };
    catalogItems.push(resultItem);
  } else {
    existing.per = strUnit;
    if (numRate > 0) existing.rate = numRate;
    resultItem = existing;
  }

  const user = await ensureAuthenticatedUser();
  if (user) {
    await db.collection("users").doc(user.uid).set({
      additionalItems: catalogItems
    }, { merge: true });
  }

  updateAllItemDropdowns();
  return resultItem;
}

async function updateCatalogItem(oldDescription, updatedItem = {}) {
  const trimmedOld = String(oldDescription || "").trim();
  if (!trimmedOld) return;

  const item = catalogItems.find((it) => it.description.toLowerCase() === trimmedOld.toLowerCase());
  if (item) {
    if (updatedItem.description != null && updatedItem.description.trim()) {
      item.description = updatedItem.description.trim();
    }
    if (updatedItem.per != null) {
      item.per = updatedItem.per.trim() || "pcs";
    }
    if (updatedItem.rate != null) {
      item.rate = Number(updatedItem.rate) || 0;
    }

    const user = await ensureAuthenticatedUser();
    if (user) {
      await db.collection("users").doc(user.uid).set({
        additionalItems: catalogItems
      }, { merge: true });
    }
    updateAllItemDropdowns();
  }
}

async function deleteCatalogItem(description) {
  const trimmed = String(description || "").trim();
  if (!trimmed) return;

  const idx = catalogItems.findIndex((it) => it.description.toLowerCase() === trimmed.toLowerCase());
  if (idx !== -1) {
    catalogItems.splice(idx, 1);
    const user = await ensureAuthenticatedUser();
    if (user) {
      await db.collection("users").doc(user.uid).set({
        additionalItems: catalogItems
      }, { merge: true });
    }
    updateAllItemDropdowns();
  }
}

function openAddItemModal(targetRow = null) {
  pendingRowForNewItem = targetRow;
  const modal = document.getElementById("addItemModal");
  const input = document.getElementById("newItemDescription");
  const rateInput = document.getElementById("newItemDefaultRate");
  const msg = document.getElementById("addItemModalMessage");
  if (msg) msg.hidden = true;
  if (input) input.value = "";
  if (rateInput) rateInput.value = "";
  if (modal) modal.hidden = false;
  if (input) setTimeout(() => input.focus(), 50);
}

function closeAddItemModal() {
  const modal = document.getElementById("addItemModal");
  if (modal) modal.hidden = true;
  pendingRowForNewItem = null;
}

function createItemRow(initialData = {}, onRowChange = null) {
  // If description is provided but rate is not, look up default rate and unit from catalog
  let initialRate = initialData.rate;
  let initialPer = initialData.per;
  if (initialData.description) {
    const matched = catalogItems.find((it) => it.description === initialData.description);
    if (matched) {
      if ((initialRate == null || initialRate === "" || initialRate === 0) && matched.rate > 0) {
        initialRate = matched.rate;
      }
      if (!initialPer && matched.per) {
        initialPer = matched.per;
      }
    }
  }

  const row = document.createElement("tr");
  row.className = "item-row";
  row.innerHTML = `
    <td>
      <select class="item-desc" required></select>
    </td>
    <td><input type="number" class="item-qty" min="0.01" step="0.01" value="${initialData.qty != null ? initialData.qty : 1}" required></td>
    <td><input type="number" class="item-rate" min="0" step="0.01" value="${initialRate != null && initialRate !== '' ? initialRate : ''}" placeholder="0.00" required></td>
    <td><input type="text" class="item-per" value="${initialPer || 'pcs'}" style="width:60px"></td>
    <td class="item-amount">₹ 0.00</td>
    <td><button type="button" class="btn-icon remove-item" title="Remove">×</button></td>
  `;

  const select = row.querySelector(".item-desc");
  populateItemSelect(select, initialData.description || "");

  select.addEventListener("change", () => {
    if (select.value === "__ADD_NEW__") {
      select.value = "";
      openAddItemModal(row);
      return;
    }

    // Automatically fill unit and price when item is selected
    const chosen = catalogItems.find((it) => it.description === select.value);
    if (chosen) {
      if (chosen.per) {
        row.querySelector(".item-per").value = chosen.per;
      }
      const rateInput = row.querySelector(".item-rate");
      if (rateInput) {
        // Automatically populate price in text box if set in catalog
        if (chosen.rate != null && chosen.rate > 0) {
          rateInput.value = chosen.rate;
        } else if (!rateInput.value) {
          rateInput.value = "";
        }
      }
    }

    // Recalculate row amount and form totals immediately
    if (onRowChange) onRowChange(row);
  });

  return row;
}

function bindBillForm() {
  const itemsBody = document.getElementById("itemsBody");
  const cgstInput = document.getElementById("cgstPercent");
  const sgstInput = document.getElementById("sgstPercent");

  function refreshTotals() {
    const items = getItemsFromTable();
    const totals = calculateQuotationTotals(items, cgstInput.value, sgstInput.value);
    const subtotalEl = document.getElementById("subtotalDisplay");
    const cgstEl = document.getElementById("cgstDisplay");
    const sgstEl = document.getElementById("sgstDisplay");
    const grandEl = document.getElementById("grandTotalDisplay");
    const wordsEl = document.getElementById("amountWordsPreview");

    if (subtotalEl) subtotalEl.textContent = formatCurrency(totals.subtotal);
    if (cgstEl) cgstEl.textContent = formatCurrency(totals.cgst);
    if (sgstEl) sgstEl.textContent = formatCurrency(totals.sgst);
    if (grandEl) grandEl.textContent = formatCurrency(totals.grandTotal);
    if (wordsEl) wordsEl.textContent = totals.amountInWords;
  }

  function refreshRowAmount(row) {
    const qty = row.querySelector(".item-qty").value;
    const rate = row.querySelector(".item-rate").value;
    row.querySelector(".item-amount").textContent = formatCurrency(calculateLineTotal(qty, rate));
    refreshTotals();
  }

  function getItemsFromTable() {
    return Array.from(itemsBody.querySelectorAll(".item-row")).map((row) => ({
      description: (row.querySelector(".item-desc").value || "").trim(),
      qty: Number(row.querySelector(".item-qty").value) || 0,
      rate: Number(row.querySelector(".item-rate").value) || 0,
      per: (row.querySelector(".item-per").value || "pcs").trim()
    }));
  }

  function bindRowEvents(row) {
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => refreshRowAmount(row));
    });
    row.querySelector(".remove-item").addEventListener("click", () => {
      if (itemsBody.querySelectorAll(".item-row").length > 1) {
        row.remove();
        refreshTotals();
      } else {
        alert("Invoice must have at least one item row.");
      }
    });
  }

  function addRow(initialData = {}) {
    const row = createItemRow(initialData, (r) => refreshRowAmount(r));
    itemsBody.appendChild(row);
    bindRowEvents(row);
    refreshRowAmount(row);
    return row;
  }

  const addItemRowBtn = document.getElementById("addItemRow");
  if (addItemRowBtn) {
    addItemRowBtn.addEventListener("click", () => {
      addRow();
    });
  }

  cgstInput.addEventListener("input", refreshTotals);
  sgstInput.addEventListener("input", refreshTotals);

  return { getItemsFromTable, refreshTotals, bindRowEvents, addRow, refreshRowAmount };
}

function getCurrentFormData(helpers) {
  const customerName = (getCustomerNameField() ? getCustomerNameField().value : "").trim();
  const customerAddress = (getCustomerAddressField() ? getCustomerAddressField().value : "").trim();
  const customerMobile = Validators.normalizeMobile(getCustomerMobileField() ? getCustomerMobileField().value : "");
  const cgstPercent = Number(document.getElementById("cgstPercent").value) || 0;
  const sgstPercent = Number(document.getElementById("sgstPercent").value) || 0;
  const items = helpers.getItemsFromTable().filter((item) => item.description);
  const checkedRadio = document.querySelector('input[name="documentType"]:checked');
  const documentType = checkedRadio ? checkedRadio.value : "bill";

  let billDate = new Date();
  const dateField = getDateField();
  if (dateField && dateField.value) {
    billDate = new Date(dateField.value);
  }

  const numField = getInvoiceNumberField();
  const billNumber = (numField && numField.value.trim()) || (documentType === "quotation" ? "QTN-0001" : "INV-0001");

  const totals = calculateQuotationTotals(items, cgstPercent, sgstPercent);

  return {
    customerName,
    customerAddress,
    customerMobile,
    cgstPercent,
    sgstPercent,
    items,
    documentType,
    billDate,
    billNumber,
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    grandTotal: totals.grandTotal,
    amountInWords: totals.amountInWords,
    createdAt: billDate
  };
}

async function showInvoicePreview(helpers) {
  const data = getCurrentFormData(helpers);

  if (data.documentType === "bill" && !Validators.required(data.customerName, 2)) {
    alert("Please enter customer name before preview.");
    if (getCustomerNameField()) getCustomerNameField().focus();
    return;
  }

  if (!data.items.length) {
    alert("Please select at least one item and enter its rate.");
    return;
  }

  const user = await ensureAuthenticatedUser();
  const profile = user ? await loadSellerProfile(user.uid) : {};
  const previewModal = document.getElementById("previewModal");
  const previewContent = document.getElementById("previewModalContent");

  if (previewContent) {
    previewContent.innerHTML = renderQuotationHTML(data, profile);
  }
  if (previewModal) {
    previewModal.hidden = false;
  }
}

function showActionLoading(text = "Please wait...", subtext = "Processing your request...") {
  let overlay = document.getElementById("loadingStatusOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "loadingStatusOverlay";
    overlay.className = "loading-overlay";
    overlay.innerHTML = `
      <div class="loading-card">
        <div class="spinner-large"></div>
        <p class="loading-text">${escapeHtml(text)}</p>
        <p class="loading-subtext">${escapeHtml(subtext)}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    const textEl = overlay.querySelector(".loading-text");
    const subtextEl = overlay.querySelector(".loading-subtext");
    if (textEl) textEl.textContent = text;
    if (subtextEl) subtextEl.textContent = subtext;
    overlay.hidden = false;
  }
}

function hideActionLoading() {
  const overlay = document.getElementById("loadingStatusOverlay");
  if (overlay) overlay.hidden = true;
}

async function saveBill(form, helpers, messageEl, submitBtn) {
  const customerName = (getCustomerNameField() ? getCustomerNameField().value : "").trim();
  const customerAddress = (getCustomerAddressField() ? getCustomerAddressField().value : "").trim();
  const customerMobile = Validators.normalizeMobile(getCustomerMobileField() ? getCustomerMobileField().value : "");
  const cgstPercent = Number(form.cgstPercent.value) || 0;
  const sgstPercent = Number(form.sgstPercent.value) || 0;
  const items = helpers.getItemsFromTable().filter((item) => item.description);
  const checkedRadio = document.querySelector('input[name="documentType"]:checked');
  const documentType = checkedRadio ? checkedRadio.value : "bill";

  let billDate = new Date();
  const dateField = getDateField();
  if (dateField && dateField.value) {
    billDate = new Date(dateField.value);
  }

  // Validation: customer name required for bills
  if (documentType === "bill") {
    if (!Validators.required(customerName, 2)) {
      showMessage(messageEl, "Please enter customer name.", "error");
      if (getCustomerNameField()) getCustomerNameField().focus();
      return;
    }
  }

  if (customerMobile && !Validators.mobile(customerMobile)) {
    showMessage(messageEl, "Please enter a valid 10-digit customer mobile number.", "error");
    if (getCustomerMobileField()) getCustomerMobileField().focus();
    return;
  }

  if (!items.length) {
    showMessage(messageEl, "Please select at least one item from the dropdown and enter an amount.", "error");
    return;
  }

  // Validate that items have positive qty and non-negative rate
  const invalidItem = items.find((it) => it.qty <= 0 || it.rate < 0);
  if (invalidItem) {
    showMessage(messageEl, "Please enter valid quantity and rate for all items.", "error");
    return;
  }

  const totals = calculateQuotationTotals(items, cgstPercent, sgstPercent);
  const user = await ensureAuthenticatedUser();
  if (!user || !user.uid) {
    showMessage(messageEl, "Please log in before saving an invoice.", "error");
    hideActionLoading();
    setLoading(submitBtn, false);
    return;
  }

  setLoading(submitBtn, true, "Saving invoice...");
  showActionLoading("Saving invoice & preparing PDF...", "Storing securely in Firestore database");
  showMessage(messageEl, "", "error");

  try {
    const isEdit = Boolean(sessionStorage.getItem("editBillId"));
    let billNumber = "";

    if (isEdit) {
      const numField = getInvoiceNumberField();
      billNumber = (numField && numField.value.trim()) || (documentType === "quotation" ? "QTN-0001" : "INV-0001");
    } else {
      const numField = getInvoiceNumberField();
      const requestedVal = numField ? numField.value.trim() : "";
      billNumber = await allocateSerialNumber(user.uid, documentType, requestedVal);
      if (numField) numField.value = billNumber;
    }

    const billPayload = {
      userId: user.uid,
      billNumber,
      documentType,
      customerName: customerName || "",
      customerAddress: customerAddress || "",
      customerMobile: customerMobile || "",
      items,
      cgstPercent,
      sgstPercent,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      grandTotal: totals.grandTotal,
      amountInWords: totals.amountInWords,
      billDate
    };

    const editBillId = sessionStorage.getItem("editBillId");
    let targetBillId = editBillId;

    const now = new Date();
    billPayload.createdAt = now;
    billPayload.serverCreatedAt = firebase.firestore.FieldValue.serverTimestamp();

    if (editBillId) {
      billPayload.updatedAt = now;
      await db.collection("bills").doc(editBillId).set(billPayload, { merge: true });
      sessionStorage.removeItem("editBillId");
      sessionStorage.removeItem("editBillData");
    } else {
      const docRef = await db.collection("bills").add(billPayload);
      targetBillId = docRef.id;
    }

    // Immediately update caches so returning to the dashboard shows the new invoice instantly
    try {
      const savedDoc = {
        id: targetBillId,
        ...billPayload,
        createdAt: now.toISOString(),
        billDate: billPayload.billDate instanceof Date ? billPayload.billDate.toISOString() : billPayload.billDate
      };
      sessionStorage.setItem("view_bill_" + targetBillId, JSON.stringify(savedDoc));

      const cacheKey = "dashboard_bills_" + user.uid;
      let cachedList = [];
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        try { cachedList = JSON.parse(cachedRaw); } catch (e) {}
      }
      cachedList = cachedList.filter((b) => b.id !== targetBillId);
      cachedList.unshift(savedDoc);
      sessionStorage.setItem(cacheKey, JSON.stringify(cachedList));
      dashboardBillsCache = cachedList;
    } catch (e) {}

    // Redirect to view-bill with download=true so user sees the preview AND gets automatic PDF download!
    window.location.href = `view-bill.html?id=${encodeURIComponent(targetBillId)}&download=true`;
  } catch (error) {
    console.error("[SAVE] Error saving bill:", error);
    showMessage(messageEl, error.message || "Failed to save invoice.", "error");
    hideActionLoading();
    setLoading(submitBtn, false);
  }
}

function renderBillCardElement(bill) {
  const card = document.createElement("article");
  card.className = "bill-card";

  const isQuote = bill.documentType === "quotation";
  const label = isQuote ? "Quotation" : "Bill";

  const details = document.createElement("div");
  details.innerHTML = `
    <h3>${label} #${escapeHtml(bill.billNumber)}</h3>
    <p>${escapeHtml(bill.customerName || (isQuote ? "General Quotation" : "Customer"))}</p>
    <p class="muted">${formatDate(bill.createdAt || bill.billDate)}</p>
  `;

  const actions = document.createElement("div");
  actions.className = "bill-card-actions";

  const total = document.createElement("strong");
  total.textContent = formatCurrency(bill.grandTotal);

  const actionButtons = document.createElement("div");
  actionButtons.style.display = "flex";
  actionButtons.style.gap = "0.5rem";

  const viewLink = document.createElement("button");
  viewLink.className = "btn btn-secondary btn-sm";
  viewLink.type = "button";
  viewLink.textContent = "View";
  viewLink.addEventListener("click", () => {
    try {
      sessionStorage.setItem("view_bill_" + bill.id, JSON.stringify(bill));
    } catch (e) {}
    window.location.href = `view-bill.html?id=${encodeURIComponent(bill.id)}`;
  });

  const pdfBtn = document.createElement("button");
  pdfBtn.className = "btn btn-secondary btn-sm";
  pdfBtn.type = "button";
  pdfBtn.textContent = "PDF";
  pdfBtn.addEventListener("click", () => {
    try {
      sessionStorage.setItem("view_bill_" + bill.id, JSON.stringify(bill));
    } catch (e) {}
    window.location.href = `view-bill.html?id=${encodeURIComponent(bill.id)}&download=true`;
  });

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-secondary btn-sm";
  editBtn.type = "button";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => {
    editBill(bill.id, bill);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-danger btn-sm";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    if (confirm(`Are you sure you want to delete ${label} #${bill.billNumber}?`)) {
      deleteBill(bill.id);
    }
  });

  actionButtons.appendChild(viewLink);
  actionButtons.appendChild(pdfBtn);
  actionButtons.appendChild(editBtn);
  actionButtons.appendChild(deleteBtn);

  actions.appendChild(total);
  actions.appendChild(actionButtons);

  card.appendChild(details);
  card.appendChild(actions);
  return card;
}

let dashboardBillsCache = [];
let dashboardFilteredBills = [];
let dashboardCurrentPage = 1;
const DASHBOARD_PAGE_SIZE = 25;

async function loadBillsDashboard({
  container,
  emptyEl,
  paginationEl,
  searchInput,
  typeFilter,
  statsInvoicesEl,
  statsQuotationsEl,
  statsRevenueEl
}) {
  const user = await ensureAuthenticatedUser();
  if (!user || !user.uid) return;

  function updateStatsAndRender() {
    let countInvoices = 0;
    let countQuotations = 0;
    let totalRevenue = 0;

    dashboardBillsCache.forEach((bill) => {
      if (bill.documentType === "quotation") {
        countQuotations++;
      } else {
        countInvoices++;
        totalRevenue += Number(bill.grandTotal) || 0;
      }
    });

    if (statsInvoicesEl) statsInvoicesEl.textContent = countInvoices.toLocaleString("en-IN");
    if (statsQuotationsEl) statsQuotationsEl.textContent = countQuotations.toLocaleString("en-IN");
    if (statsRevenueEl) statsRevenueEl.textContent = formatCurrency(totalRevenue);

    applyFiltersAndRender();
  }

  // 1. Instant render from cache (0ms) for instant page display
  const cacheKey = "dashboard_bills_" + user.uid;
  try {
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr && (!dashboardBillsCache || dashboardBillsCache.length === 0)) {
      dashboardBillsCache = JSON.parse(cachedStr);
      updateStatsAndRender();
    }
  } catch (e) {}

  // 2. Fetch fresh snapshot from Firestore (fast local cache via IndexedDB)
  try {
    const snapshot = await db.collection("bills")
      .where("userId", "==", user.uid)
      .get();

    const freshBills = [];
    snapshot.forEach((doc) => {
      freshBills.push({ id: doc.id, ...doc.data() });
    });

    // Client-side sort guarantees newest documents always appear at the top
    freshBills.sort((a, b) => {
      const getMs = (item) => {
        if (!item) return 0;
        if (item.createdAt) {
          if (typeof item.createdAt.toMillis === "function") return item.createdAt.toMillis();
          if (item.createdAt.seconds) return item.createdAt.seconds * 1000;
          const d = new Date(item.createdAt);
          if (!isNaN(d.getTime())) return d.getTime();
        }
        if (item.billDate) {
          if (typeof item.billDate.toMillis === "function") return item.billDate.toMillis();
          if (item.billDate.seconds) return item.billDate.seconds * 1000;
          const d = new Date(item.billDate);
          if (!isNaN(d.getTime())) return d.getTime();
        }
        return 0;
      };
      return getMs(b) - getMs(a);
    });

    dashboardBillsCache = freshBills;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(freshBills));
    } catch (e) {}

    updateStatsAndRender();
  } catch (err) {
    console.error("[BILLS] Error loading bills dashboard:", err);
    if (!dashboardBillsCache || dashboardBillsCache.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
    }
  }

  function applyFiltersAndRender() {
    const term = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const type = typeFilter ? typeFilter.value : "all";

    dashboardFilteredBills = dashboardBillsCache.filter((bill) => {
      if (type !== "all" && (bill.documentType || "bill") !== type) {
        return false;
      }
      if (term) {
        const bNum = String(bill.billNumber || "").toLowerCase();
        const cName = String(bill.customerName || "").toLowerCase();
        const cMobile = String(bill.customerMobile || "").toLowerCase();
        return bNum.includes(term) || cName.includes(term) || cMobile.includes(term);
      }
      return true;
    });

    renderCurrentPage();
  }

  function renderCurrentPage() {
    container.innerHTML = "";

    if (dashboardFilteredBills.length === 0) {
      emptyEl.hidden = false;
      if (paginationEl) paginationEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    if (paginationEl) paginationEl.hidden = false;

    const totalBills = dashboardFilteredBills.length;
    const totalPages = Math.ceil(totalBills / DASHBOARD_PAGE_SIZE) || 1;
    if (dashboardCurrentPage > totalPages) dashboardCurrentPage = totalPages;
    if (dashboardCurrentPage < 1) dashboardCurrentPage = 1;

    const startIndex = (dashboardCurrentPage - 1) * DASHBOARD_PAGE_SIZE;
    const endIndex = Math.min(startIndex + DASHBOARD_PAGE_SIZE, totalBills);
    const pageItems = dashboardFilteredBills.slice(startIndex, endIndex);

    const frag = document.createDocumentFragment();
    pageItems.forEach((bill) => {
      frag.appendChild(renderBillCardElement(bill));
    });
    container.appendChild(frag);

    if (paginationEl) {
      paginationEl.innerHTML = `
        <div class="pagination-info">
          Showing <strong>${startIndex + 1}</strong> to <strong>${endIndex}</strong> of <strong>${totalBills}</strong> documents
        </div>
        <div class="pagination-controls">
          <button type="button" class="btn btn-secondary btn-sm" id="prevPageBtn" ${dashboardCurrentPage === 1 ? "disabled" : ""}>← Previous</button>
          <span style="font-size: 0.9rem; font-weight: 600; padding: 0 0.5rem;">Page ${dashboardCurrentPage} of ${totalPages}</span>
          <button type="button" class="btn btn-secondary btn-sm" id="nextPageBtn" ${dashboardCurrentPage >= totalPages ? "disabled" : ""}>Next →</button>
        </div>
      `;

      const prevBtn = paginationEl.querySelector("#prevPageBtn");
      const nextBtn = paginationEl.querySelector("#nextPageBtn");

      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          if (dashboardCurrentPage > 1) {
            dashboardCurrentPage--;
            renderCurrentPage();
            window.scrollTo({ top: container.offsetTop - 100, behavior: "smooth" });
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          if (dashboardCurrentPage < totalPages) {
            dashboardCurrentPage++;
            renderCurrentPage();
            window.scrollTo({ top: container.offsetTop - 100, behavior: "smooth" });
          }
        });
      }
    }
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", () => {
      dashboardCurrentPage = 1;
      applyFiltersAndRender();
    });
  }

  if (typeFilter && !typeFilter.dataset.bound) {
    typeFilter.dataset.bound = "true";
    typeFilter.addEventListener("change", () => {
      dashboardCurrentPage = 1;
      applyFiltersAndRender();
    });
  }

  applyFiltersAndRender();
}

async function loadBillsList(container, emptyEl) {
  return loadBillsDashboard({
    container,
    emptyEl,
    paginationEl: document.getElementById("paginationBar"),
    searchInput: document.getElementById("billSearchInput"),
    typeFilter: document.getElementById("billTypeFilter"),
    statsInvoicesEl: document.getElementById("statInvoicesCount"),
    statsQuotationsEl: document.getElementById("statQuotationsCount"),
    statsRevenueEl: document.getElementById("statTotalRevenue")
  });
}

async function loadBillById(billId, uid) {
  const ownerId = uid || (auth.currentUser && auth.currentUser.uid);
  if (!billId || !ownerId) {
    return { error: "missing-auth" };
  }

  // 1. Instant cache check (0ms response when opened from dashboard)
  try {
    const cachedStr = sessionStorage.getItem("view_bill_" + billId);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (cached && cached.userId === ownerId) {
        // Revalidate in background without blocking UI
        db.collection("bills").doc(billId).get().then((doc) => {
          if (doc.exists) {
            sessionStorage.setItem("view_bill_" + billId, JSON.stringify({ id: doc.id, ...doc.data() }));
          }
        }).catch(() => {});
        return cached;
      }
    }
  } catch (e) {}

  try {
    const doc = await db.collection("bills").doc(billId).get();
    if (!doc.exists) {
      return { error: "not-found" };
    }
    const data = doc.data();
    if (data.userId !== ownerId) {
      return { error: "forbidden" };
    }
    const billObj = { id: doc.id, ...data };
    try {
      sessionStorage.setItem("view_bill_" + billId, JSON.stringify(billObj));
    } catch (e) {}
    return billObj;
  } catch (error) {
    if (error.code === "permission-denied") {
      return { error: "permission-denied" };
    }
    throw error;
  }
}

let _cachedProfile = null;
let _cachedProfileUid = null;

async function loadSellerProfile(uid, forceRefresh = false) {
  if (!uid) return {};

  // 1. In-memory cache
  if (!forceRefresh && _cachedProfile && _cachedProfileUid === uid) {
    return _cachedProfile;
  }

  // 2. SessionStorage cache (instant 0ms response)
  if (!forceRefresh) {
    try {
      const stored = sessionStorage.getItem("seller_profile_" + uid);
      if (stored) {
        _cachedProfile = JSON.parse(stored);
        _cachedProfileUid = uid;
        // Background revalidate without blocking UI
        db.collection("users").doc(uid).get().then((doc) => {
          if (doc.exists) {
            _cachedProfile = doc.data();
            sessionStorage.setItem("seller_profile_" + uid, JSON.stringify(_cachedProfile));
          }
        }).catch(() => {});
        return _cachedProfile;
      }
    } catch (e) {}
  }

  // 3. Fetch from Firestore
  try {
    const doc = await db.collection("users").doc(uid).get();
    const data = doc.exists ? doc.data() : {};
    _cachedProfile = data;
    _cachedProfileUid = uid;
    try {
      sessionStorage.setItem("seller_profile_" + uid, JSON.stringify(data));
    } catch (e) {}
    return data;
  } catch (error) {
    console.error("[PROFILE] Error loading seller profile:", error);
    return _cachedProfile || {};
  }
}

function invalidateSellerProfileCache(uid) {
  _cachedProfile = null;
  _cachedProfileUid = null;
  try {
    if (uid) sessionStorage.removeItem("seller_profile_" + uid);
  } catch (e) {}
}

async function downloadQuotationPdf(billNumber) {
  const element = document.getElementById("quotationDocument");
  if (!element) {
    console.error("[PDF] quotationDocument element not found!");
    alert("Invoice document not found. Please refresh the page.");
    return;
  }

  const btn = document.getElementById("downloadPdfBtn");
  if (btn) {
    setLoading(btn, true, "Generating PDF...");
  }
  showActionLoading("Generating PDF document...", `Preparing Invoice #${billNumber || ""}`);

  try {
    // Ensure all internal images are using Data URLs to avoid browser canvas tainting in file:/// environments
    const images = Array.from(element.querySelectorAll("img"));
    images.forEach((img) => {
      const src = img.getAttribute("src") || img.src || "";
      if (src.includes("logo.png") && typeof LOGO_DATA_URL !== "undefined") {
        img.src = LOGO_DATA_URL;
      } else if (src.includes("signature.png") && typeof SIGNATURE_DATA_URL !== "undefined") {
        img.src = SIGNATURE_DATA_URL;
      }
    });

    // Wait for all images in the document to fully load
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      })
    );

    // Give browser a moment to ensure fonts and layout are settled
    await new Promise((r) => setTimeout(r, 200));

    // Preferred approach: html2canvas + jsPDF (exact A4 format)
    const hasJsPdf = (typeof window.jspdf !== "undefined" && window.jspdf.jsPDF) || typeof window.jsPDF !== "undefined";
    if (typeof html2canvas !== "undefined" && hasJsPdf) {
      let canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false
      });

      const JsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      const pdf = new JsPDFClass("p", "mm", "a4");

      const a4Width = 210; // Exact A4 width in mm
      const a4Height = 297; // Exact A4 height in mm
      let renderedHeight = (canvas.height * a4Width) / canvas.width;
      let imgData = null;

      try {
        imgData = canvas.toDataURL("image/png", 1.0);
      } catch (taintErr) {
        console.warn("[PDF] Canvas tainted by external image, re-capturing with external images hidden:", taintErr);
        // Re-capture skipping any non-data images to prevent tainted canvas error
        try {
          const cleanCanvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff",
            logging: false,
            ignoreElements: (el) => el.tagName === "IMG" && el.src && !el.src.startsWith("data:")
          });
          renderedHeight = (cleanCanvas.height * a4Width) / cleanCanvas.width;
          imgData = cleanCanvas.toDataURL("image/png", 1.0);
        } catch (innerTaintErr) {
          console.warn("[PDF] Re-capture also blocked by canvas security, opening Print dialog directly:", innerTaintErr);
          hideActionLoading();
          if (btn) setLoading(btn, false);
          window.print();
          return;
        }
      }

      // If the invoice fits within standard 1 page (or slight overflow up to ~330mm due to padding/margins),
      // scale it to fit precisely onto 1 standard A4 page so it NEVER spills onto an unwanted page 2.
      if (renderedHeight <= a4Height) {
        // Fits perfectly on single A4 page
        pdf.addImage(imgData, "PNG", 0, 0, a4Width, renderedHeight);
      } else if (renderedHeight <= 330) {
        // Fits within single page with slight proportional scale-down (preserves A4 single-page format)
        const scaleFactor = a4Height / renderedHeight;
        const scaledWidth = a4Width * scaleFactor;
        const offsetX = (a4Width - scaledWidth) / 2;
        pdf.addImage(imgData, "PNG", offsetX, 0, scaledWidth, a4Height);
      } else {
        // Truly long invoice (15+ items) requiring multiple pages
        let heightLeft = renderedHeight;
        let position = 0;

        pdf.addImage(imgData, "PNG", 0, position, a4Width, renderedHeight);
        heightLeft -= a4Height;

        while (heightLeft > 15) { // ignore trailing margin artifacts (<15mm)
          position -= a4Height;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, a4Width, renderedHeight);
          heightLeft -= a4Height;
        }
      }

      const filename = `Invoice-${billNumber || "Bill"}.pdf`;
      pdf.save(filename);
      return;
    }

    // Fallback: html2pdf bundle if available
    if (typeof html2pdf !== "undefined") {
      const opt = {
        margin: 0,
        filename: `Invoice-${billNumber || "Bill"}.pdf`,
        image: { type: "png", quality: 1.0 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
      };
      await html2pdf().set(opt).from(element).save();
      return;
    }

    throw new Error("No PDF library available. Please use browser Print → Save as PDF.");
  } catch (error) {
    console.error("[PDF] PDF generation error:", error);
    alert("PDF download failed: " + (error.message || "Unknown error") + "\nYou can also use the Print button to Save as PDF.");
  } finally {
    hideActionLoading();
    if (btn) {
      setTimeout(() => {
        setLoading(btn, false);
      }, 500);
    }
  }
}

async function deleteBill(billId) {
  const user = await ensureAuthenticatedUser();
  if (!user) {
    alert("Please log in to delete a bill.");
    return;
  }

  try {
    const billRef = db.collection("bills").doc(billId);
    const billSnap = await billRef.get();

    if (!billSnap.exists) {
      alert("Bill not found.");
      return;
    }

    const billData = billSnap.data();
    if (billData.userId !== user.uid) {
      alert("You do not have permission to delete this bill.");
      return;
    }

    await billRef.delete();
    try {
      sessionStorage.removeItem("dashboard_bills_" + user.uid);
      dashboardBillsCache = [];
    } catch (e) {}
    location.reload();
  } catch (error) {
    console.error("[DELETE] Error:", error);
    alert("Failed to delete bill: " + error.message);
  }
}

async function editBill(billId, billData) {
  const user = await ensureAuthenticatedUser();
  if (!user) {
    alert("Please log in to edit a bill.");
    return;
  }

  if (billData.userId !== user.uid) {
    alert("You do not have permission to edit this bill.");
    return;
  }

  sessionStorage.setItem("editBillId", billId);
  sessionStorage.setItem("editBillData", JSON.stringify(billData));
  window.location.href = "create-bill.html?edit=true";
}

async function bulkGenerateInvoices(options = {}, legacyProgress = null) {
  const user = await ensureAuthenticatedUser();
  if (!user) throw new Error("User must be logged in to generate bills.");

  let count = 500;
  let customItems = null;
  let cgstPct = 5;
  let sgstPct = 5;
  let onProgress = null;
  let customerName = "";
  let customerAddress = "";
  let customerMobile = "";
  let baseBillDate = new Date().toISOString().split("T")[0];

  if (typeof options === "number" || typeof options === "string") {
    count = parseInt(options, 10) || 500;
    onProgress = legacyProgress;
  } else if (typeof options === "object" && options !== null) {
    count = parseInt(options.count, 10) || 500;
    customItems = Array.isArray(options.customItems) && options.customItems.length > 0 ? options.customItems : null;
    cgstPct = options.cgstPercent != null ? Number(options.cgstPercent) : 5;
    sgstPct = options.sgstPercent != null ? Number(options.sgstPercent) : 5;
    customerName = options.customerName != null ? String(options.customerName).trim() : "";
    customerAddress = options.customerAddress != null ? String(options.customerAddress).trim() : "";
    customerMobile = options.customerMobile != null ? String(options.customerMobile).trim() : "";
    if (options.billDate) baseBillDate = String(options.billDate).trim();
    onProgress = options.onProgress || legacyProgress;
  }

  const targetCount = Math.max(1, Math.min(1000, count));
  const counterRef = db.collection("counters").doc(user.uid);

  // 1. Atomically get current counter
  const counterDoc = await counterRef.get();
  let currentCounter = 0;
  if (counterDoc.exists) {
    currentCounter = Number(counterDoc.data().invoiceCounter) || 0;
  } else {
    const existingSnap = await db.collection("bills")
      .where("userId", "==", user.uid)
      .where("documentType", "==", "bill")
      .get();
    currentCounter = existingSnap.size;
  }

  const startNum = currentCounter + 1;
  const endNum = currentCounter + targetCount;

  // 2. Reserve counter range in one atomic write (prevents rate-limit contention)
  await counterRef.set({
    invoiceCounter: endNum,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const BATCH_SIZE = 100;
  const itemsCatalog = (catalogItems && catalogItems.length > 0) ? catalogItems : DEFAULT_CATALOG_ITEMS;
  let completed = 0;

  // Pre-calculate fixed items & totals if user configured custom items (e.g. 5 items with 5% CGST/SGST)
  let fixedBillItems = null;
  let fixedSubtotal = 0;
  let fixedCgst = 0;
  let fixedSgst = 0;
  let fixedGrandTotal = 0;
  let fixedWords = "";

  if (customItems) {
    fixedBillItems = customItems.map((it) => {
      const q = Number(it.qty) || 1;
      const r = Number(it.rate) || 0;
      return {
        description: String(it.description || "").trim(),
        qty: q,
        rate: r,
        per: String(it.per || "pcs").trim(),
        amount: Math.round(q * r * 100) / 100
      };
    });

    const totals = calculateQuotationTotals(fixedBillItems, cgstPct, sgstPct);
    fixedSubtotal = totals.subtotal;
    fixedCgst = totals.cgst;
    fixedSgst = totals.sgst;
    fixedGrandTotal = totals.grandTotal;
    fixedWords = totals.amountInWords;
  }

  // 3. Commit in chunks of 100 documents per batch (safe within Firestore 500-batch limit)
  for (let batchStart = 0; batchStart < targetCount; batchStart += BATCH_SIZE) {
    const batch = db.batch();
    const batchEnd = Math.min(batchStart + BATCH_SIZE, targetCount);

    for (let i = batchStart; i < batchEnd; i++) {
      const serialNum = startNum + i;

      let items = [];
      let subtotal = 0;
      let cgst = 0;
      let sgst = 0;
      let grandTotal = 0;
      let amountInWords = "";

      if (fixedBillItems) {
        // Apply identical items & amounts configured by user
        items = fixedBillItems.map((it) => ({ ...it }));
        subtotal = fixedSubtotal;
        cgst = fixedCgst;
        sgst = fixedSgst;
        grandTotal = fixedGrandTotal;
        amountInWords = fixedWords;
      } else {
        // Fallback: items from catalog
        const numItems = (i % 3) + 1;
        for (let j = 0; j < numItems; j++) {
          const catItem = itemsCatalog[(i + j) % itemsCatalog.length];
          const qty = ((i + j) % 4) + 1;
          const baseRate = 350 + (((i * 47 + j * 29) % 35) * 200);
          const amount = qty * baseRate;
          items.push({
            description: catItem.description,
            qty: qty,
            per: catItem.per || "pcs",
            rate: baseRate,
            amount: amount
          });
        }
        subtotal = items.reduce((sum, it) => sum + it.amount, 0);
        cgst = Math.round(subtotal * (cgstPct / 100) * 100) / 100;
        sgst = Math.round(subtotal * (sgstPct / 100) * 100) / 100;
        grandTotal = Math.round((subtotal + cgst + sgst) * 100) / 100;
        amountInWords = numberToWordsIndian(grandTotal);
      }

      const billDocRef = db.collection("bills").doc();
      const billData = {
        userId: user.uid,
        documentType: "bill",
        billNumber: formatSerialNumber("INV", serialNum),
        customerName: customerName,
        customerAddress: customerAddress,
        customerMobile: customerMobile,
        billDate: baseBillDate,
        createdAt: new Date(),
        items: items,
        subtotal: subtotal,
        cgst: cgst,
        sgst: sgst,
        grandTotal: grandTotal,
        amountInWords: amountInWords,
        cgstPercent: cgstPct,
        sgstPercent: sgstPct
      };

      batch.set(billDocRef, billData);
    }

    await batch.commit();
    completed = batchEnd;
    if (typeof onProgress === "function") {
      onProgress(completed, targetCount, Math.round((completed / targetCount) * 100));
    }

    // Brief yield to allow browser UI thread to update progress bar smoothly
    await new Promise((r) => setTimeout(r, 60));
  }

  try {
    sessionStorage.removeItem("dashboard_bills_" + user.uid);
    dashboardBillsCache = [];
  } catch (e) {}

  return {
    success: true,
    count: targetCount,
    startSerial: formatSerialNumber("INV", startNum),
    endSerial: formatSerialNumber("INV", endNum),
    grandTotal: fixedBillItems ? fixedGrandTotal : null
  };
}
