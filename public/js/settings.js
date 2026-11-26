const DEFAULT_BUSINESS = {
  name: "Maa Bhawani Enterprises",
  address: "Motipur, Muzaffarpur, Bihar, 843111.",
  mobile: "8789703832",
  email: "yadavwanshigroupofcompany@gmail.com",
  gstin: "10IXRPD8555F1Z9",
  stateCode: "10",
  stateName: "Bihar",
  tagline: "Government Contractor & Order Supplier.",
  bankName: "Bihar Gramin Bank, Fulwariya",
  accountNo: "1080851130010536",
  ifsc: "PUNB0MBGB06"
};

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

function updateCatalogCount() {
  const badge = document.getElementById("catalogCountBadge");
  if (!badge) return;
  const count = document.querySelectorAll(".catalog-row").length;
  badge.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
}

function createCatalogRow(item = {}) {
  const row = document.createElement("tr");
  row.className = "catalog-row";
  const descVal = escapeHtml(item.description || "");
  const hsnVal = escapeHtml(item.hsn || "");
  const gstRateVal = item.gstRate != null ? item.gstRate : (item.gst != null ? item.gst : 18);
  const perVal = escapeHtml(item.per || "pcs");
  const rateVal = item.rate != null ? item.rate : 0;

  row.innerHTML = `
    <td><input type="text" class="cat-desc" placeholder="Item name / description" value="${descVal}" required style="width: 100%;"></td>
    <td><input type="text" class="cat-hsn" placeholder="HSN/SAC" value="${hsnVal}" style="width: 100px;"></td>
    <td><input type="number" class="cat-gst" placeholder="18" min="0" max="100" step="0.01" value="${gstRateVal}" style="width: 90px;"></td>
    <td><input type="text" class="cat-per" placeholder="pcs" value="${perVal}" style="width: 80px;"></td>
    <td><input type="number" class="cat-rate" min="0" step="0.01" value="${rateVal}" placeholder="0.00" style="width: 110px;"></td>
    <td style="white-space: nowrap; text-align: right;">
      <button type="button" class="btn btn-sm btn-secondary update-catalog-btn" title="Update and save this item">Update</button>
      <button type="button" class="btn-icon remove-catalog" title="Delete item" style="margin-left: 6px;">✕</button>
    </td>
  `;

  const descInput = row.querySelector(".cat-desc");
  const hsnInput = row.querySelector(".cat-hsn");
  const gstInput = row.querySelector(".cat-gst");
  const perInput = row.querySelector(".cat-per");
  const rateInput = row.querySelector(".cat-rate");
  const updateBtn = row.querySelector(".update-catalog-btn");
  const removeBtn = row.querySelector(".remove-catalog");

  // Single Item Update Button Handler
  updateBtn.addEventListener("click", async () => {
    const newDesc = descInput.value.trim();
    const newHsn = hsnInput.value.trim();
    const newGst = Number(gstInput.value) || 0;
    const newPer = perInput.value.trim() || "pcs";
    const newRate = Number(rateInput.value) || 0;

    if (!newDesc) {
      alert("Item description cannot be empty.");
      descInput.focus();
      return;
    }

    setLoading(updateBtn, true, "Saving...");
    try {
      const user = await ensureAuthenticatedUser();
      if (!user) throw new Error("Please log in first.");

      const allItems = getCatalogFromTable();
      await db.collection("users").doc(user.uid).set({
        additionalItems: allItems
      }, { merge: true });

      // Update session cache so dashboard and bills reflect changes immediately
      try {
        const cachedStr = sessionStorage.getItem("seller_profile_" + user.uid);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          cached.additionalItems = allItems;
          sessionStorage.setItem("seller_profile_" + user.uid, JSON.stringify(cached));
        }
      } catch (e) { }

      updateBtn.classList.remove("btn-secondary");
      updateBtn.classList.add("btn-primary");
      updateBtn.textContent = "Saved ✓";
      setTimeout(() => {
        updateBtn.classList.remove("btn-primary");
        updateBtn.classList.add("btn-secondary");
        updateBtn.textContent = "Update";
      }, 1500);
      updateCatalogCount();
    } catch (err) {
      alert("Failed to update item: " + err.message);
    } finally {
      setLoading(updateBtn, false);
    }
  });

  // Single Item Delete Button Handler
  removeBtn.addEventListener("click", async () => {
    const itemDesc = descInput.value.trim() || "this item";
    if (!confirm(`Are you sure you want to delete "${itemDesc}" from catalog?`)) {
      return;
    }

    row.remove();
    updateCatalogCount();

    // Persist removal to Firestore
    try {
      const user = await ensureAuthenticatedUser();
      if (user) {
        const remainingItems = getCatalogFromTable();
        await db.collection("users").doc(user.uid).set({
          additionalItems: remainingItems
        }, { merge: true });

        try {
          const cachedStr = sessionStorage.getItem("seller_profile_" + user.uid);
          if (cachedStr) {
            const cached = JSON.parse(cachedStr);
            cached.additionalItems = remainingItems;
            sessionStorage.setItem("seller_profile_" + user.uid, JSON.stringify(cached));
          }
        } catch (e) { }
      }
    } catch (err) {
      console.error("Failed to delete item from Firestore:", err);
    }
  });

  return row;
}

function getCatalogFromTable() {
  return Array.from(document.querySelectorAll(".catalog-row")).map((row) => ({
    description: (row.querySelector(".cat-desc") ? row.querySelector(".cat-desc").value : "").trim(),
    hsn: (row.querySelector(".cat-hsn") ? row.querySelector(".cat-hsn").value.trim() : ""),
    gstRate: Number(row.querySelector(".cat-gst") ? row.querySelector(".cat-gst").value : 18) || 0,
    per: (row.querySelector(".cat-per") ? row.querySelector(".cat-per").value.trim() : "") || "pcs",
    rate: Number(row.querySelector(".cat-rate") ? row.querySelector(".cat-rate").value : 0) || 0
  })).filter((item) => item.description);
}

function populateSettingsUI(data = {}) {
  const business = { ...DEFAULT_BUSINESS, ...(data.business || {}) };
  const form = document.getElementById("settingsForm");
  if (!form) return;

  if (form.businessName) form.businessName.value = business.name || "";
  if (form.businessAddress) form.businessAddress.value = business.address || "";
  if (form.businessMobile) form.businessMobile.value = business.mobile || "";
  if (form.businessEmail) form.businessEmail.value = business.email || "";
  if (form.gstin) form.gstin.value = business.gstin || "";
  if (form.stateCode) form.stateCode.value = business.stateCode || "";
  if (form.stateName) form.stateName.value = business.stateName || "";
  if (form.tagline) form.tagline.value = business.tagline || "";
  if (form.bankName) form.bankName.value = business.bankName || "";
  if (form.accountNo) form.accountNo.value = business.accountNo || "";
  if (form.ifsc) form.ifsc.value = business.ifsc || "";

  const catalogBody = document.getElementById("catalogBody");
  if (catalogBody) {
    catalogBody.innerHTML = "";
    const items = (data && Array.isArray(data.additionalItems)) ? data.additionalItems : [];
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(createCatalogRow(item)));
    catalogBody.appendChild(fragment);
    updateCatalogCount();
  }

  // Search filter
  const searchInput = document.getElementById("catalogSearchInput");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", () => {
      const term = searchInput.value.toLowerCase().trim();
      document.querySelectorAll(".catalog-row").forEach((row) => {
        const desc = (row.querySelector(".cat-desc") ? row.querySelector(".cat-desc").value : "").toLowerCase();
        const hsn = (row.querySelector(".cat-hsn") ? row.querySelector(".cat-hsn").value : "").toLowerCase();
        row.style.display = (desc.includes(term) || hsn.includes(term)) ? "" : "none";
      });
    });
  }
}

async function loadSettingsForm(userId) {
  // 1. Instant 0ms render from sessionStorage
  try {
    const cachedStr = sessionStorage.getItem("seller_profile_" + userId);
    if (cachedStr) {
      populateSettingsUI(JSON.parse(cachedStr));
    }
  } catch (e) { }

  // 2. Fetch fresh profile from Firestore
  try {
    const doc = await db.collection("users").doc(userId).get();
    const data = doc.exists ? doc.data() : {};
    try {
      sessionStorage.setItem("seller_profile_" + userId, JSON.stringify(data));
    } catch (e) { }
    populateSettingsUI(data);
  } catch (err) {
    console.error("[SETTINGS] Error loading profile from Firestore:", err);
  }
}

async function saveSettings(form, messageEl, submitBtn) {
  setLoading(submitBtn, true, "Saving settings...");
  showMessage(messageEl, "", "error");

  try {
    const user = await ensureAuthenticatedUser();
    const businessData = {
      name: form.businessName.value.trim(),
      address: form.businessAddress.value.trim(),
      mobile: Validators.normalizeMobile(form.businessMobile.value) || form.businessMobile.value.trim(),
      email: form.businessEmail.value.trim(),
      gstin: form.gstin.value.trim(),
      stateCode: form.stateCode.value.trim(),
      stateName: form.stateName.value.trim(),
      tagline: form.tagline.value.trim(),
      bankName: form.bankName.value.trim(),
      accountNo: form.accountNo.value.trim(),
      ifsc: form.ifsc.value.trim()
    };
    const catalogData = getCatalogFromTable();

    await db.collection("users").doc(user.uid).set({
      business: businessData,
      additionalItems: catalogData
    }, { merge: true });

    // Update session cache immediately so dashboard and bills reflect changes with 0ms delay
    try {
      sessionStorage.setItem("seller_profile_" + user.uid, JSON.stringify({
        business: businessData,
        additionalItems: catalogData
      }));
    } catch (e) { }

    showMessage(messageEl, "Settings saved successfully.", "success");
  } catch (error) {
    showMessage(messageEl, error.message, "error");
  } finally {
    setLoading(submitBtn, false);
  }
}
