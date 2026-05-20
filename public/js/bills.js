function generateRandomBillNumber() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function createItemRow() {
  const row = document.createElement("tr");
  row.className = "item-row";
  row.innerHTML = `
    <td><input type="text" class="item-desc" placeholder="Description" required></td>
    <td><input type="number" class="item-qty" min="0.01" step="0.01" value="1" required></td>
    <td><input type="number" class="item-rate" min="0" step="0.01" value="0" required></td>
    <td><input type="text" class="item-per" value="pcs" style="width:60px"></td>
    <td class="item-amount">₹ 0.00</td>
    <td><button type="button" class="btn-icon remove-item" title="Remove">×</button></td>
  `;
  return row;
}

function bindBillForm() {
  const itemsBody = document.getElementById("itemsBody");
  const cgstInput = document.getElementById("cgstPercent");
  const sgstInput = document.getElementById("sgstPercent");

  function refreshTotals() {
    const items = getItemsFromTable();
    const totals = calculateQuotationTotals(items, cgstInput.value, sgstInput.value);
    document.getElementById("subtotalDisplay").textContent = formatCurrency(totals.subtotal);
    document.getElementById("cgstDisplay").textContent = formatCurrency(totals.cgst);
    document.getElementById("sgstDisplay").textContent = formatCurrency(totals.sgst);
    document.getElementById("grandTotalDisplay").textContent = formatCurrency(totals.grandTotal);
    document.getElementById("amountWordsPreview").textContent = totals.amountInWords;
  }

  function refreshRowAmount(row) {
    const qty = row.querySelector(".item-qty").value;
    const rate = row.querySelector(".item-rate").value;
    row.querySelector(".item-amount").textContent = formatCurrency(calculateLineTotal(qty, rate));
    refreshTotals();
  }

  function getItemsFromTable() {
    return Array.from(itemsBody.querySelectorAll(".item-row")).map((row) => ({
      description: row.querySelector(".item-desc").value.trim(),
      qty: Number(row.querySelector(".item-qty").value),
      rate: Number(row.querySelector(".item-rate").value),
      per: row.querySelector(".item-per").value.trim() || "pcs"
    }));
  }

  document.getElementById("addItemRow").addEventListener("click", () => {
    const row = createItemRow();
    itemsBody.appendChild(row);
    bindRowEvents(row);
  });

  function bindRowEvents(row) {
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => refreshRowAmount(row));
    });
    row.querySelector(".remove-item").addEventListener("click", () => {
      if (itemsBody.querySelectorAll(".item-row").length > 1) {
        row.remove();
        refreshTotals();
      }
    });
  }

  itemsBody.querySelectorAll(".item-row").forEach(bindRowEvents);
  cgstInput.addEventListener("input", refreshTotals);
  sgstInput.addEventListener("input", refreshTotals);
  refreshTotals();

  return { getItemsFromTable, refreshTotals, bindRowEvents };
}

async function loadCatalogQuickAdd(selectEl, helpers) {
  const profile = await loadSellerProfile(auth.currentUser.uid);
  const items = profile.additionalItems || [];
  const itemsBody = document.getElementById("itemsBody");

  selectEl.innerHTML = '<option value="">— Add from catalog —</option>';
  items.forEach((item, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${item.description} (${formatCurrency(item.rate)})`;
    selectEl.appendChild(opt);
  });

  selectEl.addEventListener("change", () => {
    if (selectEl.value === "") return;
    const item = items[Number(selectEl.value)];
    const row = createItemRow();
    row.querySelector(".item-desc").value = item.description;
    row.querySelector(".item-rate").value = item.rate;
    itemsBody.appendChild(row);
    helpers.bindRowEvents(row);
    row.querySelector(".item-rate").dispatchEvent(new Event("input"));
    selectEl.value = "";
  });
}

async function saveBill(form, helpers, messageEl, submitBtn) {
  const customerName = form.customerName.value.trim();
  const customerAddress = form.customerAddress.value.trim();
  const customerMobile = Validators.normalizeMobile(form.customerMobile.value);
  const cgstPercent = Number(form.cgstPercent.value) || 9;
  const sgstPercent = Number(form.sgstPercent.value) || 9;
  const items = helpers.getItemsFromTable().filter((item) => item.description);
  
  // Get date from form or use current date
  let billDate = new Date();
  if (form.billDate && form.billDate.value) {
    billDate = new Date(form.billDate.value);
  }

  if (!Validators.required(customerName, 2)) {
    showMessage(messageEl, "Please enter customer name.", "error");
    return;
  }
  if (customerMobile && !Validators.mobile(customerMobile)) {
    showMessage(messageEl, "Please enter a valid customer mobile number.", "error");
    return;
  }
  if (!items.length) {
    showMessage(messageEl, "Add at least one item.", "error");
    return;
  }

  const totals = calculateQuotationTotals(items, cgstPercent, sgstPercent);
  const user = auth.currentUser;

  setLoading(submitBtn, true);
  showMessage(messageEl, "", "error");

  try {
    const billNumber = generateRandomBillNumber();
    const docRef = await db.collection("bills").add({
      userId: user.uid,
      billNumber,
      customerName,
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
      billDate: billDate,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.location.href = `/view-bill.html?id=${encodeURIComponent(docRef.id)}`;
  } catch (error) {
    showMessage(messageEl, error.message, "error");
  } finally {
    setLoading(submitBtn, false);
  }
}

async function loadBillsList(container, emptyEl) {
  const user = auth.currentUser;
  const snapshot = await db.collection("bills")
    .where("userId", "==", user.uid)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  container.innerHTML = "";

  if (snapshot.empty) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  snapshot.forEach((doc) => {
    const bill = doc.data();
    const card = document.createElement("article");
    card.className = "bill-card";

    const details = document.createElement("div");
    details.innerHTML = `
      <h3>Bill #${escapeHtml(bill.billNumber)}</h3>
      <p>${escapeHtml(bill.customerName)}</p>
      <p class="muted">${formatDate(bill.createdAt)}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "bill-card-actions";

    const total = document.createElement("strong");
    total.textContent = formatCurrency(bill.grandTotal);

    const actionButtons = document.createElement("div");
    actionButtons.style.display = "flex";
    actionButtons.style.gap = "0.5rem";

    const viewLink = document.createElement("button");
    viewLink.className = "btn btn-secondary";
    viewLink.type = "button";
    viewLink.textContent = "View";
    viewLink.addEventListener("click", () => {
      window.location.href = `/view-bill.html?id=${encodeURIComponent(doc.id)}`;
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      editBill(doc.id, bill);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-secondary";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this bill?")) {
        deleteBill(doc.id);
      }
    });

    actionButtons.appendChild(viewLink);
    actionButtons.appendChild(editBtn);
    actionButtons.appendChild(deleteBtn);

    actions.appendChild(total);
    actions.appendChild(actionButtons);

    card.appendChild(details);
    card.appendChild(actions);
    container.appendChild(card);
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
  const doc = await db.collection("users").doc(uid).get();
  return doc.exists ? doc.data() : {};
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.hasAttribute("data-loaded")) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)));
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener("load", () => {
      script.setAttribute("data-loaded", "true");
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)));
    document.head.appendChild(script);
  });
}

async function downloadQuotationPdf(billNumber) {
  console.log("[PDF] Starting download for bill:", billNumber);
  
  const element = document.getElementById("quotationDocument");
  if (!element) {
    console.error("[PDF] ERROR: quotationDocument element not found!");
    alert("Invoice not found. Please refresh the page.");
    return;
  }
  console.log("[PDF] Found invoice element");

  const btn = document.getElementById("downloadPdfBtn");
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating PDF...";
    }

    // Check if html2canvas and jsPDF are loaded
    if (typeof html2canvas === "undefined") {
      throw new Error("html2canvas library is not available. Please refresh the page.");
    }
    if (typeof window.jspdf === "undefined") {
      throw new Error("jsPDF library is not available. Please refresh the page.");
    }

    console.log("[PDF] Required libraries loaded");

    // Small delay to ensure images are rendered
    await new Promise((r) => setTimeout(r, 300));

    // Generate canvas from the invoice element
    console.log("[PDF] Converting HTML to canvas...");
    const canvas = await html2canvas(element, {
      scale: 2,           // Higher quality
      useCORS: true,      // Fix image CORS issues
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false
    });

    console.log("[PDF] Canvas generated, size:", canvas.width, "x", canvas.height);

    // Create PDF
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Add image to PDF, handling page breaks for long invoices
    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
    heightLeft -= pdf.internal.pageSize.getHeight();

    while (heightLeft > 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
    }

    // Save the PDF
    const filename = `Invoice-${billNumber || "Bill"}.pdf`;
    console.log("[PDF] Saving file:", filename);
    pdf.save(filename);

    console.log("[PDF] PDF download initiated");

  } catch (error) {
    console.error("[PDF] ERROR:", error.message || error);
    alert("PDF generation failed: " + (error.message || "Unknown error"));
  } finally {
    if (btn) {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Download PDF";
      }, 1000);
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
    alert("Bill deleted successfully.");
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

  // Redirect to create page with edit mode (you can implement full edit UI later)
  // For now, we'll store the bill data in sessionStorage and open create page
  sessionStorage.setItem("editBillId", billId);
  sessionStorage.setItem("editBillData", JSON.stringify(billData));
  window.location.href = "/create-bill.html?edit=true";
}
