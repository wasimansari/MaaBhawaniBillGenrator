const DEFAULT_BUSINESS = {
  name: "Maa Bhawani Enterprises",
  address: "Motipur, Muzaffarpur, Bihar, 843111.",
  mobile: "8789703832",
  email: "yadavwanshigroupofcompany@gmail.com",
  gstin: "10IXRPD8555F1Z9",
  stateCode: "10",
  stateName: "Bihar",
  tagline: "Government Contractor & Order Supplier.",
  bankName: "Uttar Bihar Gramin Bank, Fulwariya",
  accountNo: "1080851130010536",
  ifsc: "CBIN0R10001"
};

const DEFAULT_ADDITIONAL_ITEMS = [
  { description: "MONITOR(24 INCH)", rate: 9500 },
  { description: "KEYBOARD", rate: 550 },
  { description: "WIRELESS MOUSE", rate: 450 },
  { description: "UPS 600VA", rate: 2850 },
  { description: "UPS 1 KVA", rate: 4850 },
  { description: "CCTV CAMERA 4 MP", rate: 1850 },
  { description: "CCTV CAMERA 2 MP", rate: 1250 },
  { description: "SMPS 5 AMP", rate: 450 }
];

function createCatalogRow(item = {}) {
  const row = document.createElement("tr");
  row.className = "catalog-row";
  row.innerHTML = `
    <td><input type="text" class="cat-desc" placeholder="Item name"></td>
    <td><input type="number" class="cat-rate" min="0" step="0.01" value="0"></td>
    <td><button type="button" class="btn-icon remove-catalog" title="Remove">×</button></td>
  `;
  row.querySelector(".cat-desc").value = item.description || "";
  row.querySelector(".cat-rate").value = item.rate || 0;
  row.querySelector(".remove-catalog").addEventListener("click", () => {
    if (document.querySelectorAll(".catalog-row").length > 1) row.remove();
  });
  return row;
}

function getCatalogFromTable() {
  return Array.from(document.querySelectorAll(".catalog-row")).map((row) => ({
    description: row.querySelector(".cat-desc").value.trim(),
    rate: Number(row.querySelector(".cat-rate").value) || 0
  })).filter((item) => item.description);
}

async function loadSettingsForm(userId) {
  const doc = await db.collection("users").doc(userId).get();
  const data = doc.exists ? doc.data() : {};
  const business = { ...DEFAULT_BUSINESS, ...(data.business || {}) };
  const form = document.getElementById("settingsForm");

  form.businessName.value = business.name;
  form.businessAddress.value = business.address;
  form.businessMobile.value = business.mobile;
  form.businessEmail.value = business.email;
  form.gstin.value = business.gstin;
  form.stateCode.value = business.stateCode;
  form.stateName.value = business.stateName;
  form.tagline.value = business.tagline;
  form.bankName.value = business.bankName;
  form.accountNo.value = business.accountNo;
  form.ifsc.value = business.ifsc;

  const catalogBody = document.getElementById("catalogBody");
  catalogBody.innerHTML = "";
  const items = data.additionalItems && data.additionalItems.length
    ? data.additionalItems
    : DEFAULT_ADDITIONAL_ITEMS;
  items.forEach((item) => catalogBody.appendChild(createCatalogRow(item)));
}

async function saveSettings(form, messageEl, submitBtn) {
  setLoading(submitBtn, true, "Saving settings...");
  showMessage(messageEl, "", "error");

  try {
    const user = auth.currentUser;
    await db.collection("users").doc(user.uid).set({
      business: {
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
      },
      additionalItems: getCatalogFromTable()
    }, { merge: true });

    showMessage(messageEl, "Settings saved successfully.", "success");
  } catch (error) {
    showMessage(messageEl, error.message, "error");
  } finally {
    setLoading(submitBtn, false);
  }
}
