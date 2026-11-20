const DEFAULT_CATALOG_ITEMS = [
  { description: "MONITOR(24 INCH)", per: "pcs" },
  { description: "KEYBOARD", per: "pcs" },
  { description: "WIRELESS MOUSE", per: "pcs" },
  { description: "UPS 600VA", per: "pcs" },
  { description: "UPS 1 KVA", per: "pcs" },
  { description: "CCTV CAMERA 4 MP", per: "pcs" },
  { description: "CCTV CAMERA 2 MP", per: "pcs" },
  { description: "SMPS 5 AMP", per: "pcs" }
];

let catalogItems = [];
let pendingRowForNewItem = null;

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
    const user = auth.currentUser;

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
      if (typeof it === "string") return { description: it, per: "pcs" };
      return {
        description: it.description || "",
        per: it.per || "pcs"
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

async function addNewCatalogItem(itemName, unit = "pcs") {
  const trimmed = String(itemName || "").trim();
  if (!trimmed) {
    throw new Error("Item name cannot be empty.");
  }

  // Check if item already exists (case-insensitive)
  const existing = catalogItems.find(
    (it) => it.description.toLowerCase() === trimmed.toLowerCase()
  );

  let resultItem = existing;

  if (!existing) {
    resultItem = { description: trimmed, per: unit || "pcs" };
    catalogItems.push(resultItem);

    const user = auth.currentUser;
    if (user) {
      await db.collection("users").doc(user.uid).set({
        additionalItems: catalogItems
      }, { merge: true });
    }
  }

  updateAllItemDropdowns();
  return resultItem;
}

function openAddItemModal(targetRow = null) {
  pendingRowForNewItem = targetRow;
  const modal = document.getElementById("addItemModal");
  const input = document.getElementById("newItemDescription");
  const msg = document.getElementById("addItemModalMessage");
  if (msg) msg.hidden = true;
  if (input) input.value = "";
  if (modal) modal.hidden = false;
  if (input) setTimeout(() => input.focus(), 50);
}

function closeAddItemModal() {
  const modal = document.getElementById("addItemModal");
  if (modal) modal.hidden = true;
  pendingRowForNewItem = null;
}

function createItemRow(initialData = {}, onRowChange = null) {
  const row = document.createElement("tr");
  row.className = "item-row";
  row.innerHTML = `
    <td>
      <select class="item-desc" required></select>
    </td>
    <td><input type="number" class="item-qty" min="0.01" step="0.01" value="${initialData.qty != null ? initialData.qty : 1}" required></td>
    <td><input type="number" class="item-rate" min="0" step="0.01" value="${initialData.rate != null && initialData.rate !== 0 ? initialData.rate : ''}" placeholder="0.00" required></td>
    <td><input type="text" class="item-per" value="${initialData.per || 'pcs'}" style="width:60px"></td>
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

    // If item selected, look up default unit and focus the rate box for manual amount entry
    const chosen = catalogItems.find((it) => it.description === select.value);
    if (chosen && chosen.per) {
      row.querySelector(".item-per").value = chosen.per;
    }

    const rateInput = row.querySelector(".item-rate");
    if (rateInput && !rateInput.value) {
      rateInput.focus();
    }

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

  const user = auth.currentUser;
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
  const user = auth.currentUser;

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

    if (editBillId) {
      billPayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("bills").doc(editBillId).set(billPayload, { merge: true });
      sessionStorage.removeItem("editBillId");
      sessionStorage.removeItem("editBillData");
    } else {
      billPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const docRef = await db.collection("bills").add(billPayload);
      targetBillId = docRef.id;
    }

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
    window.location.href = `view-bill.html?id=${encodeURIComponent(bill.id)}`;
  });

  const pdfBtn = document.createElement("button");
  pdfBtn.className = "btn btn-secondary btn-sm";
  pdfBtn.type = "button";
  pdfBtn.textContent = "PDF";
  pdfBtn.addEventListener("click", () => {
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
  const user = auth.currentUser;
  if (!user) return;

  const snapshot = await db.collection("bills")
    .where("userId", "==", user.uid)
    .orderBy("createdAt", "desc")
    .get();

  dashboardBillsCache = [];
  snapshot.forEach((doc) => {
    dashboardBillsCache.push({ id: doc.id, ...doc.data() });
  });

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

    pageItems.forEach((bill) => {
      const card = renderBillCardElement(bill);
      container.appendChild(card);
    });

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

  try {
    const doc = await db.collection("bills").doc(billId).get();
    if (!doc.exists) {
      return { error: "not-found" };
    }
    const data = doc.data();
    if (data.userId !== ownerId) {
      return { error: "forbidden" };
    }
    return { id: doc.id, ...data };
  } catch (error) {
    if (error.code === "permission-denied") {
      return { error: "permission-denied" };
    }
    throw error;
  }
}

async function loadSellerProfile(uid) {
  try {
    const doc = await db.collection("users").doc(uid).get();
    return doc.exists ? doc.data() : {};
  } catch (error) {
    console.error("[PROFILE] Error loading seller profile:", error);
    return {};
  }
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
  const user = auth.currentUser;
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
    location.reload();
  } catch (error) {
    console.error("[DELETE] Error:", error);
    alert("Failed to delete bill: " + error.message);
  }
}

async function editBill(billId, billData) {
  const user = auth.currentUser;
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

const BULK_SAMPLE_CUSTOMERS = [
  { name: "Rahul Sharma", city: "New Delhi", state: "Delhi", mobile: "9810123456" },
  { name: "Pooja Verma", city: "Noida", state: "Uttar Pradesh", mobile: "9820234567" },
  { name: "NPS Hakim Miya Tola", city: "Siwan", state: "Bihar", mobile: "9830345678" },
  { name: "Techtronics Solutions", city: "Gurugram", state: "Haryana", mobile: "9840456789" },
  { name: "Galaxy Infotech", city: "Patna", state: "Bihar", mobile: "9850567890" },
  { name: "Ramesh Trading Co", city: "Jaipur", state: "Rajasthan", mobile: "9860678901" },
  { name: "Global Computers", city: "Lucknow", state: "Uttar Pradesh", mobile: "9870789012" },
  { name: "Kavita Electronics", city: "Kanpur", state: "Uttar Pradesh", mobile: "9880890123" },
  { name: "Aman Hardware & Tools", city: "Varanasi", state: "Uttar Pradesh", mobile: "9890901234" },
  { name: "Sunil Stationery & Supplies", city: "Gaya", state: "Bihar", mobile: "9812345678" },
  { name: "Apex Technologies", city: "Chandigarh", state: "Punjab", mobile: "9823456789" },
  { name: "Shree Ganesh Enterprises", city: "Bhopal", state: "Madhya Pradesh", mobile: "9834567890" }
];

async function bulkGenerateInvoices(count = 500, onProgress = null) {
  const user = auth.currentUser;
  if (!user) throw new Error("User must be logged in to generate bills.");

  const targetCount = Math.max(1, Math.min(1000, parseInt(count, 10) || 500));
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

  // 3. Commit in chunks of 100 documents per batch (safe within Firestore 500-batch limit)
  for (let batchStart = 0; batchStart < targetCount; batchStart += BATCH_SIZE) {
    const batch = db.batch();
    const batchEnd = Math.min(batchStart + BATCH_SIZE, targetCount);

    for (let i = batchStart; i < batchEnd; i++) {
      const serialNum = startNum + i;
      const cust = BULK_SAMPLE_CUSTOMERS[i % BULK_SAMPLE_CUSTOMERS.length];
      const numItems = (i % 3) + 1;
      const items = [];

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

      const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
      const cgst = Math.round(subtotal * 0.09 * 100) / 100;
      const sgst = Math.round(subtotal * 0.09 * 100) / 100;
      const grandTotal = Math.round((subtotal + cgst + sgst) * 100) / 100;

      // Distribute dates realistically across the past 90 days
      const dayOffset = (targetCount - i) * (90 / targetCount);
      const billDateObj = new Date(Date.now() - dayOffset * 86400000);
      const billDateStr = billDateObj.toISOString().split("T")[0];

      const billDocRef = db.collection("bills").doc();
      const billData = {
        userId: user.uid,
        documentType: "bill",
        billNumber: formatSerialNumber("INV", serialNum),
        customerName: cust.name,
        customerAddress: `${cust.city}, ${cust.state}`,
        customerMobile: cust.mobile,
        billDate: billDateStr,
        createdAt: billDateObj,
        items: items,
        subtotal: subtotal,
        cgst: cgst,
        sgst: sgst,
        grandTotal: grandTotal,
        amountInWords: numberToWordsIndian(grandTotal),
        cgstPercent: 9,
        sgstPercent: 9
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

  return {
    success: true,
    count: targetCount,
    startSerial: formatSerialNumber("INV", startNum),
    endSerial: formatSerialNumber("INV", endNum)
  };
}
