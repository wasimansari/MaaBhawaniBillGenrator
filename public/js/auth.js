function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  el.hidden = !text;
}

function setLoading(button, loading) {
  button.disabled = loading;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = loading ? "Please wait..." : button.dataset.originalText;
}

async function requireAuth(redirectTo = "login.html") {
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  if (auth.currentUser) {
    return auth.currentUser;
  }
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        window.location.href = redirectTo;
      }
    });
  });
}

async function registerUser(form, messageEl, submitBtn) {
  const name = form.name.value.trim();
  const email = form.email.value.trim();
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

  setLoading(submitBtn, true);
  showMessage(messageEl, "", "error");

  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
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
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.location.href = "dashboard.html";
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
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!Validators.email(email)) {
    showMessage(messageEl, "Please enter a valid email address.", "error");
    return;
  }
  if (!Validators.password(password)) {
    showMessage(messageEl, "Please enter your password.", "error");
    return;
  }

  setLoading(submitBtn, true);
  showMessage(messageEl, "", "error");

  try {
    await auth.signInWithEmailAndPassword(email, password);
    window.location.href = "dashboard.html";
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
  await auth.signOut();
  window.location.href = "login.html";
}
