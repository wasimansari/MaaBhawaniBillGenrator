/**
 * admin.js — Admin Authorization and User Approval Management
 * Dedicated User Management & Approvals Center
 * Authorized Admins:
 *  - akram0031@gmail.com
 *  - yadavwanshigroupofcompany@gmail.com
 */

let adminUnsubscribers = [];
let allUsersData = [];
let currentAdminTab = "pending";
let userSearchQuery = "";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp) return "Just now";
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return "Recently";
  }
}

function showAdminAlert(message, type = "success") {
  const alertEl = document.getElementById("adminActionAlert");
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.className = `admin-alert alert-${type}`;
  alertEl.style.display = "block";
  setTimeout(() => {
    alertEl.style.display = "none";
  }, 5000);
}

/**
 * Approve a pending or rejected user registration
 */
async function adminApproveUser(userId, userName) {
  const admin = auth.currentUser;
  if (!admin || !isAdminEmail(admin.email)) {
    alert("Only authorized administrators can perform this action.");
    return;
  }

  try {
    await db.collection("users").doc(userId).update({
      status: "approved",
      approvedBy: admin.email,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showAdminAlert(`✓ Account for "${userName}" has been APPROVED. The user can now log in immediately.`, "success");
  } catch (err) {
    console.error("Approve error:", err);
    showAdminAlert(`Failed to approve user: ${err.message}`, "error");
  }
}

/**
 * Reject a user registration request
 */
async function adminRejectUser(userId, userName) {
  const admin = auth.currentUser;
  if (!admin || !isAdminEmail(admin.email)) {
    alert("Only authorized administrators can perform this action.");
    return;
  }

  if (!confirm(`Are you sure you want to reject the registration request for "${userName}"?`)) {
    return;
  }

  try {
    await db.collection("users").doc(userId).update({
      status: "rejected",
      rejectedBy: admin.email,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showAdminAlert(`User "${userName}" registration has been rejected.`, "info");
  } catch (err) {
    console.error("Reject error:", err);
    showAdminAlert(`Failed to reject user: ${err.message}`, "error");
  }
}

/**
 * Revoke approval for an existing approved user
 */
async function adminRevokeUser(userId, userName) {
  const admin = auth.currentUser;
  if (!admin || !isAdminEmail(admin.email)) {
    alert("Only authorized administrators can perform this action.");
    return;
  }

  if (!confirm(`Revoke approval for "${userName}"? This user will be blocked from logging in until approved again.`)) {
    return;
  }

  try {
    await db.collection("users").doc(userId).update({
      status: "pending",
      revokedBy: admin.email,
      revokedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showAdminAlert(`Approval revoked for "${userName}". Status reset to Pending.`, "warning");
  } catch (err) {
    console.error("Revoke error:", err);
    showAdminAlert(`Failed to revoke access: ${err.message}`, "error");
  }
}

/**
 * Render a single user card for the grid
 */
function renderUserCard(user) {
  const name = escapeHtml(user.name || "Unnamed User");
  const email = escapeHtml(user.email || "");
  const mobile = escapeHtml(user.mobile || "");
  const address = escapeHtml(user.address || "");
  const status = user.status || "pending";
  const dateStr = formatDate(user.createdAt);
  const initials = (name.slice(0, 2) || "U").toUpperCase();

  let actionsHtml = "";
  if (status === "pending") {
    actionsHtml = `
      <div class="admin-card-actions">
        <button type="button" class="btn btn-success btn-sm" onclick="adminApproveUser('${user.id}', '${name.replace(/'/g, "\\'")}')">
          ✓ Approve Account
        </button>
        <button type="button" class="btn btn-danger-outline btn-sm" onclick="adminRejectUser('${user.id}', '${name.replace(/'/g, "\\'")}')">
          ✕ Reject
        </button>
      </div>
    `;
  } else if (status === "approved") {
    const approvedInfo = user.approvedBy ? `<div class="admin-meta-info">Approved by: <strong>${escapeHtml(user.approvedBy)}</strong></div>` : "";
    actionsHtml = `
      ${approvedInfo}
      <div class="admin-card-actions">
        <button type="button" class="btn btn-warning-outline btn-sm" onclick="adminRevokeUser('${user.id}', '${name.replace(/'/g, "\\'")}')">
          ⚠️ Revoke Approval
        </button>
      </div>
    `;
  } else {
    // Rejected
    const rejectedInfo = user.rejectedBy ? `<div class="admin-meta-info">Rejected by: <strong>${escapeHtml(user.rejectedBy)}</strong></div>` : "";
    actionsHtml = `
      ${rejectedInfo}
      <div class="admin-card-actions">
        <button type="button" class="btn btn-success btn-sm" onclick="adminApproveUser('${user.id}', '${name.replace(/'/g, "\\'")}')">
          ✓ Re-Approve Account
        </button>
      </div>
    `;
  }

  const badgeClass = status === "approved" ? "badge-approved" : status === "rejected" ? "badge-rejected" : "badge-pending";
  const statusLabel = status === "approved" ? "✓ Approved" : status === "rejected" ? "✕ Rejected" : "⏳ Pending Approval";

  return `
    <div class="admin-user-card" id="user-card-${user.id}">
      <div class="admin-card-top">
        <div class="admin-avatar">${initials}</div>
        <div class="admin-user-heading">
          <h4 class="admin-user-name">${name}</h4>
          <span class="admin-user-email">${email}</span>
        </div>
        <span class="admin-status-badge ${badgeClass}">${statusLabel}</span>
      </div>

      <div class="admin-card-details">
        <div class="admin-card-row">
          <span class="label">Mobile:</span>
          <span class="val">${mobile ? `<a href="tel:${mobile}">${mobile}</a>` : '<span class="text-muted">None</span>'}</span>
        </div>
        <div class="admin-card-row">
          <span class="label">Address:</span>
          <span class="val">${address || '<span class="text-muted">Not specified</span>'}</span>
        </div>
        <div class="admin-card-row">
          <span class="label">Registered:</span>
          <span class="val">${dateStr}</span>
        </div>
      </div>

      ${actionsHtml}
    </div>
  `;
}

/**
 * Filter users based on tab and search text
 */
function getFilteredUsers() {
  const nonAdminUsers = allUsersData.filter((u) => !isAdminEmail(u.email));

  return nonAdminUsers.filter((u) => {
    const status = u.status || "pending";

    // Tab filter
    if (currentAdminTab === "pending" && status !== "pending") return false;
    if (currentAdminTab === "approved" && status !== "approved") return false;
    if (currentAdminTab === "rejected" && status !== "rejected") return false;

    // Search query filter
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase().trim();
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const mobile = (u.mobile || "").toLowerCase();
      const address = (u.address || "").toLowerCase();
      return name.includes(q) || email.includes(q) || mobile.includes(q) || address.includes(q);
    }

    return true;
  });
}

/**
 * Re-render the Users page UI based on latest state
 */
function updateAdminUserPageUI() {
  const nonAdminUsers = allUsersData.filter((u) => !isAdminEmail(u.email));
  const pendingUsers = nonAdminUsers.filter((u) => (u.status || "pending") === "pending");
  const approvedUsers = nonAdminUsers.filter((u) => u.status === "approved");
  const rejectedUsers = nonAdminUsers.filter((u) => u.status === "rejected");

  // Update Statistics Cards
  const statTotalEl = document.getElementById("statTotalUsers");
  const statPendingEl = document.getElementById("statPendingUsers");
  const statApprovedEl = document.getElementById("statApprovedUsers");
  const statRejectedEl = document.getElementById("statRejectedUsers");

  if (statTotalEl) statTotalEl.textContent = nonAdminUsers.length;
  if (statPendingEl) statPendingEl.textContent = pendingUsers.length;
  if (statApprovedEl) statApprovedEl.textContent = approvedUsers.length;
  if (statRejectedEl) statRejectedEl.textContent = rejectedUsers.length;

  // Update Tab Badges
  const pendingCountEl = document.getElementById("adminPendingCount");
  const approvedCountEl = document.getElementById("adminApprovedCount");
  const rejectedCountEl = document.getElementById("adminRejectedCount");
  const allCountEl = document.getElementById("adminAllCount");

  if (pendingCountEl) pendingCountEl.textContent = pendingUsers.length;
  if (approvedCountEl) approvedCountEl.textContent = approvedUsers.length;
  if (rejectedCountEl) rejectedCountEl.textContent = rejectedUsers.length;
  if (allCountEl) allCountEl.textContent = nonAdminUsers.length;

  // Update Navbar Badge if present
  const navBadgeEl = document.getElementById("adminNavBadge");
  if (navBadgeEl) {
    navBadgeEl.textContent = pendingUsers.length;
    navBadgeEl.style.display = pendingUsers.length > 0 ? "inline-block" : "none";
  }

  // Render Grid
  const gridEl = document.getElementById("usersGrid");
  const emptyEl = document.getElementById("usersEmptyState");
  const emptyTitleEl = document.getElementById("emptyStateTitle");
  const emptyTextEl = document.getElementById("emptyStateText");

  if (!gridEl) return;

  const filtered = getFilteredUsers();

  if (filtered.length === 0) {
    gridEl.innerHTML = "";
    if (emptyEl) {
      emptyEl.style.display = "block";
      if (userSearchQuery.trim()) {
        if (emptyTitleEl) emptyTitleEl.textContent = "No matching users found";
        if (emptyTextEl) emptyTextEl.textContent = `No users match "${escapeHtml(userSearchQuery)}". Try adjusting your search.`;
      } else if (currentAdminTab === "pending") {
        if (emptyTitleEl) emptyTitleEl.textContent = "All caught up!";
        if (emptyTextEl) emptyTextEl.textContent = "There are no pending user registration requests waiting for authorization.";
      } else if (currentAdminTab === "approved") {
        if (emptyTitleEl) emptyTitleEl.textContent = "No approved users yet";
        if (emptyTextEl) emptyTextEl.textContent = "Approve pending accounts to allow them to access the portal.";
      } else if (currentAdminTab === "rejected") {
        if (emptyTitleEl) emptyTitleEl.textContent = "No rejected accounts";
        if (emptyTextEl) emptyTextEl.textContent = "No registration requests have been rejected.";
      } else {
        if (emptyTitleEl) emptyTitleEl.textContent = "No regular users registered";
        if (emptyTextEl) emptyTextEl.textContent = "Newly registered users will appear here for review and authorization.";
      }
    }
  } else {
    if (emptyEl) emptyEl.style.display = "none";
    gridEl.innerHTML = filtered.map(renderUserCard).join("");
  }
}

/**
 * Initialize Admin Badge on Dashboard Navigation
 */
function initAdminNavBadge(currentUser) {
  if (!currentUser || !isAdminEmail(currentUser.email)) return;

  const adminNavBtn = document.getElementById("adminNavBtn");
  const navBadgeEl = document.getElementById("adminNavBadge");
  if (adminNavBtn) {
    adminNavBtn.style.display = "inline-flex";
  }

  // Listen to pending users for live badge counter
  db.collection("users")
    .where("status", "==", "pending")
    .onSnapshot(
      (snapshot) => {
        let pendingCount = 0;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (!isAdminEmail(data.email)) {
            pendingCount++;
          }
        });
        if (navBadgeEl) {
          navBadgeEl.textContent = pendingCount;
          navBadgeEl.style.display = pendingCount > 0 ? "inline-block" : "none";
        }
      },
      (err) => {
        console.warn("[ADMIN] Could not query pending users for badge:", err);
      }
    );
}

/**
 * Initialize the full Users Management & Approvals Page (users.html)
 */
function initAdminUserPage(currentUser) {
  const unauthorizedEl = document.getElementById("unauthorizedScreen");
  const mainContentEl = document.getElementById("adminPageContent");
  const currentEmailEl = document.getElementById("adminCurrentEmail");

  // Check authorization
  if (!currentUser || !isAdminEmail(currentUser.email)) {
    if (unauthorizedEl) unauthorizedEl.style.display = "block";
    if (mainContentEl) mainContentEl.style.display = "none";
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 3000);
    return;
  }

  if (unauthorizedEl) unauthorizedEl.style.display = "none";
  if (mainContentEl) mainContentEl.style.display = "block";
  if (currentEmailEl) currentEmailEl.textContent = currentUser.email;

  // Search input binding
  const searchInput = document.getElementById("userSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      userSearchQuery = e.target.value;
      updateAdminUserPageUI();
    });
  }

  // Tab switching binding
  const tabs = document.querySelectorAll(".admin-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentAdminTab = tab.dataset.tab || "pending";
      updateAdminUserPageUI();
    });
  });

  // Refresh button binding
  const refreshBtn = document.getElementById("refreshUsersBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      updateAdminUserPageUI();
      showAdminAlert("User list refreshed.", "info");
    });
  }

  // Clean up any existing listeners
  adminUnsubscribers.forEach((u) => u && u());
  adminUnsubscribers = [];

  // Real-time Firestore listener on all users
  const unsubUsers = db.collection("users").onSnapshot(
    (snapshot) => {
      const users = [];
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });

      // Sort: newest first
      users.sort((a, b) => {
        const tA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA;
      });

      allUsersData = users;
      updateAdminUserPageUI();
    },
    (err) => {
      console.error("[ADMIN] Firestore users listener error:", err);
      if (err.code === "permission-denied") {
        const gridEl = document.getElementById("usersGrid");
        if (gridEl) {
          gridEl.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 1.5rem; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px;">
              <h4 style="color: #fca5a5; margin-bottom: 0.5rem; font-size: 1.1rem;">🔒 Firestore Rules Update Required</h4>
              <p style="font-size: 0.95rem; color: #fecaca; margin-bottom: 0.75rem;">
                Firebase Cloud Security Rules have not been published yet in Firebase Console to authorize admin accounts (<strong>akram0031@gmail.com</strong> &amp; <strong>yadavwanshigroupofcompany@gmail.com</strong>).
              </p>
              <ol style="font-size: 0.88rem; color: #f3f4f6; padding-left: 1.25rem; line-height: 1.8;">
                <li>Go to <a href="https://console.firebase.google.com/" target="_blank" style="color: #93c5fd; text-decoration: underline;">Firebase Console</a> &rarr; Select project <strong>practice-b23d7</strong></li>
                <li>Navigate to <strong>Firestore Database</strong> &rarr; Click <strong>Rules</strong></li>
                <li>Paste the updated rules from <code>firestore.rules</code> and click <strong>Publish</strong></li>
              </ol>
              <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 1rem;" onclick="location.reload()">🔄 Retry / Reload</button>
            </div>
          `;
        }
        showAdminAlert("Firebase permission denied: Please publish the updated firestore.rules in Firebase Console.", "error");
      } else {
        showAdminAlert("Could not load users list: " + err.message, "error");
      }
    }
  );

  adminUnsubscribers.push(unsubUsers);
}
