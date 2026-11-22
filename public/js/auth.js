const ADMIN_EMAILS = [
  "akram0031@gmail.com",
  "yadavwanshigroupofcompany@gmail.com"
];

function isAdminEmail(email) {
  if (!email || typeof email !== "string") return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function showMessage(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`;
  el.hidden = !text;
}

function setLoading(button, loading, loadingText = "Please wait...") {
  if (!button) return;
  button.disabled = loading;
  if (loading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.innerHTML = `<span class="spinner-icon"></span> <span>${loadingText}</span>`;
  } else {
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    }
  }
}

const AUTH_STORAGE_KEY = "billgen_auth_user";

function getCachedAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCachedAuthUser(user, extra = {}) {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      const email = (user.email || "").toLowerCase();
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          uid: user.uid,
          email: email,
          displayName: user.displayName || "",
          isAdmin: isAdminEmail(email),
          ...extra
        })
      );
    }
  } catch (e) {}
}

async function requireAuth(redirectTo = "login.html") {
  // 1. Resolve Firebase user session
  let user = auth.currentUser;
  if (!user && typeof auth.authStateReady === "function") {
    await auth.authStateReady();
    user = auth.currentUser;
  }

  if (!user) {
    user = await new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((u) => {
        unsubscribe();
        resolve(u);
      });
    });
  }

  if (!user) {
    setCachedAuthUser(null);
    window.location.href = redirectTo;
    return null;
  }

  // 2. Admin is unconditionally authorized
  if (isAdminEmail(user.email)) {
    setCachedAuthUser(user, { isAdmin: true, status: "approved" });
    return user;
  }

  // 3. Check approval status in Firestore for non-admin accounts
  try {
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData && userData.status === "approved") {
        setCachedAuthUser(user, { isAdmin: false, status: "approved" });
        return user;
      }
    }
  } catch (err) {
    console.error("Authorization check error:", err);
  }

  // If not approved, sign out and redirect to login with pending notice
  try {
    await auth.signOut();
  } catch (e) {}
  setCachedAuthUser(null);
  window.location.href = `${redirectTo}?status=pending`;
  return null;
}

async function registerUser(form, messageEl, submitBtn, successView) {
  const name = form.name.value.trim();
  const email = form.email.value.trim().toLowerCase();
  const mobile = Validators.normalizeMobile(form.mobile.value);
  const address = form.address.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (!Validators.required(name, 2)) {
    showMessage(messageEl, "Please enter your full name.", "error");
    return;
  }
  if (!Validators.email(email)) {
    showMessage(messageEl, "Please enter a valid email address.", "error");
    return;
  }
  if (!Validators.mobile(mobile)) {
    showMessage(messageEl, "Please enter a valid 10-digit Indian mobile number.", "error");
    return;
  }
  if (!Validators.required(address, 10)) {
    showMessage(messageEl, "Please enter your full address (at least 10 characters).", "error");
    return;
  }
  if (!Validators.password(password)) {
    showMessage(messageEl, "Password must be at least 6 characters.", "error");
    return;
  }
  if (password !== confirmPassword) {
    showMessage(messageEl, "Passwords do not match.", "error");
    return;
  }

  setLoading(submitBtn, true, "Creating account...");
  showMessage(messageEl, "", "error");

  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const isUserAdmin = isAdminEmail(email);
    const initialStatus = isUserAdmin ? "approved" : "pending";

    await credential.user.updateProfile({ displayName: name });
    await db.collection("users").doc(credential.user.uid).set({
      name,
      email,
      mobile,
      address,
      business: {
        name: name,
        address,
        mobile,
        email
      },
      status: initialStatus,
      role: isUserAdmin ? "admin" : "user",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (isUserAdmin) {
      setCachedAuthUser(credential.user, { isAdmin: true, status: "approved" });
      window.location.href = "dashboard.html";
    } else {
      // Normal user: Sign out immediately so account remains locked until admin approves
      await auth.signOut();
      setCachedAuthUser(null);

      if (successView) {
        form.style.display = "none";
        successView.hidden = false;
        const msg = successView.querySelector(".pending-message");
        if (msg) {
          msg.textContent = `Hello ${name}, your registration has been submitted! An approval request has been sent to the admins (akram0031@gmail.com and yadavwanshigroupofcompany@gmail.com). You will be able to log in once either admin approves your account.`;
        }
      } else {
        form.reset();
        showMessage(
          messageEl,
          "Registration successful! Your account is pending admin approval (Admins: akram0031@gmail.com, yadavwanshigroupofcompany@gmail.com). You can log in once approved.",
          "success"
        );
      }
    }
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "This email is already registered. Try logging in.",
      "auth/invalid-email": "Invalid email address.",
      "auth/weak-password": "Password is too weak. Use at least 6 characters."
    };
    showMessage(messageEl, messages[error.code] || error.message, "error");
  } finally {
    setLoading(submitBtn, false);
  }
}

async function loginUser(form, messageEl, submitBtn) {
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;

  if (!Validators.email(email)) {
    showMessage(messageEl, "Please enter a valid email address.", "error");
    return;
  }
  if (!Validators.password(password)) {
    showMessage(messageEl, "Please enter your password.", "error");
    return;
  }

  setLoading(submitBtn, true, "Signing in...");
  showMessage(messageEl, "", "error");

  try {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    const user = credential.user;

    // Admin email check: Always grant immediate access
    if (isAdminEmail(user.email)) {
      setCachedAuthUser(user, { isAdmin: true, status: "approved" });
      try {
        await db.collection("users").doc(user.uid).set(
          {
            email: user.email.toLowerCase(),
            status: "approved",
            role: "admin"
          },
          { merge: true }
        );
      } catch (e) {}
      window.location.href = "dashboard.html";
      return;
    }

    // Check approval status in Firestore for normal users
    setLoading(submitBtn, true, "Verifying approval...");
    const userDoc = await db.collection("users").doc(user.uid).get();

    if (userDoc.exists) {
      const data = userDoc.data();
      if (data && data.status === "approved") {
        setCachedAuthUser(user, { isAdmin: false, status: "approved" });
        window.location.href = "dashboard.html";
        return;
      } else if (data && data.status === "rejected") {
        await auth.signOut();
        setCachedAuthUser(null);
        showMessage(
          messageEl,
          "Your registration request was rejected by the administrator. Contact support or admin for assistance.",
          "error"
        );
        return;
      }
    }

    // Account is pending approval
    await auth.signOut();
    setCachedAuthUser(null);
    showMessage(
      messageEl,
      "Your account is pending admin approval. Both admins (akram0031@gmail.com and yadavwanshigroupofcompany@gmail.com) have been sent your request. You can log in once approved.",
      "warning"
    );
  } catch (error) {
    const messages = {
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Invalid email or password."
    };
    showMessage(messageEl, messages[error.code] || "Login failed. Check your credentials.", "error");
  } finally {
    setLoading(submitBtn, false);
  }
}

async function logoutUser() {
  setCachedAuthUser(null);
  try {
    sessionStorage.clear();
  } catch (e) {}
  await auth.signOut();
  window.location.href = "login.html";
}
