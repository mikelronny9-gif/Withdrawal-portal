import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, getDocs, doc, updateDoc,
  query, where, serverTimestamp, getDoc,
  limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ═══════════ ADMIN CONFIG ═══════════
const ADMIN_EMAILS = ["yomawisdom55@gmail.com"];

// ═══════════ STATE ═══════════
let currentUser         = null;
let isAdmin             = false;
let currentTab          = "bank";
let adminFilter         = "all";
let declineTarget       = null;
let pendingFormType     = null;
let pendingFormData     = null;
let userRequestsUnsub   = null;  // real-time listener cleanup

// ═══════════ UTILITIES ═══════════
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + id).classList.add("active");
}

function generateRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "REF-";
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function generateOTPCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(status) {
  const map = {
    pending:    ["badge-pending",    "Pending"],
    processing: ["badge-processing", "Processing"],
    approved:   ["badge-approved",   "Approved"],
    declined:   ["badge-declined",   "Declined"],
  };
  const [cls, label] = map[status] || map["pending"];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

async function checkAdmin(email) {
  if (ADMIN_EMAILS.includes(email)) return true;
  try {
    const snap = await getDoc(doc(db, "admins", email));
    return snap.exists();
  } catch {
    return false;
  }
}

function setLoading(show) {
  const overlay = document.getElementById("loading-overlay");
  if (show) overlay.classList.remove("hidden");
  else overlay.classList.add("hidden");
}

// ═══════════ PASSWORD TOGGLE ═══════════
window.togglePw = function(inputId, btn) {
  const inp = document.getElementById(inputId);
  const isHidden = inp.type === "password";
  inp.type = isHidden ? "text" : "password";
  btn.innerHTML = isHidden
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
};

// ═══════════ AUTH TAB SWITCHING ═══════════
window.switchAuthTab = function(tab) {
  document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".auth-panel").forEach(p => p.classList.remove("active"));
  document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add("active");
  document.getElementById("auth-panel-" + tab).classList.add("active");
  clearLoginAlerts();
};

function clearLoginAlerts() {
  document.querySelectorAll(".login-alert, .login-success").forEach(el => el.style.display = "none");
}

function showLoginError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.style.display = "block";
}

function showLoginSuccess(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.style.display = "block";
}

// ═══════════ SIGN IN ═══════════
async function doSignIn() {
  const email    = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  clearLoginAlerts();
  if (!email || !password) { showLoginError("signin-alert", "Please enter your email and password."); return; }

  const btn = document.getElementById("signin-btn");
  const spinner = document.getElementById("signin-spinner");
  const btnText = document.getElementById("signin-btn-text");
  btn.disabled = true; spinner.style.display = "block"; btnText.textContent = "Signing in…";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    spinner.style.display = "none"; btnText.textContent = "Sign In"; btn.disabled = false;
    showLoginError("signin-alert", firebaseErrorMsg(err.code));
  }
}

// ═══════════ CREATE ACCOUNT ═══════════
async function doCreateAccount() {
  const email   = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirm  = document.getElementById("register-confirm").value;
  clearLoginAlerts();
  if (!email || !password || !confirm) { showLoginError("register-alert", "Please fill in all fields."); return; }
  if (password.length < 6) { showLoginError("register-alert", "Password must be at least 6 characters."); return; }
  if (password !== confirm) { showLoginError("register-alert", "Passwords do not match."); return; }

  const btn = document.getElementById("register-btn");
  const spinner = document.getElementById("register-spinner");
  const btnText = document.getElementById("register-btn-text");
  btn.disabled = true; spinner.style.display = "block"; btnText.textContent = "Creating account…";

  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    spinner.style.display = "none"; btnText.textContent = "Create Account"; btn.disabled = false;
    showLoginError("register-alert", firebaseErrorMsg(err.code));
  }
}

// ═══════════ FORGOT PASSWORD ═══════════
async function doForgotPassword() {
  const email = document.getElementById("forgot-email").value.trim();
  clearLoginAlerts();
  if (!email) { showLoginError("forgot-alert", "Please enter your email address."); return; }

  const btn = document.getElementById("forgot-btn");
  const spinner = document.getElementById("forgot-spinner");
  const btnText = document.getElementById("forgot-btn-text");
  btn.disabled = true; spinner.style.display = "block"; btnText.textContent = "Sending…";

  try {
    await sendPasswordResetEmail(auth, email);
    spinner.style.display = "none"; btnText.textContent = "Send Reset Link"; btn.disabled = false;
    showLoginSuccess("forgot-success", "Reset link sent! Check your inbox.");
  } catch (err) {
    spinner.style.display = "none"; btnText.textContent = "Send Reset Link"; btn.disabled = false;
    showLoginError("forgot-alert", firebaseErrorMsg(err.code));
  }
}

// ═══════════ ADMIN LOGIN MODAL ═══════════
window.openAdminModal = function() {
  document.getElementById("modal-admin-login").classList.add("open");
  document.getElementById("admin-modal-alert").style.display = "none";
  document.getElementById("admin-modal-email").value = "";
  document.getElementById("admin-modal-password").value = "";
};
window.closeAdminModal = function() {
  document.getElementById("modal-admin-login").classList.remove("open");
};

async function doAdminLogin() {
  const email    = document.getElementById("admin-modal-email").value.trim();
  const password = document.getElementById("admin-modal-password").value;
  const alertEl  = document.getElementById("admin-modal-alert");
  alertEl.style.display = "none";
  if (!email || !password) { alertEl.textContent = "Please enter your email and password."; alertEl.style.display = "block"; return; }

  const btn = document.getElementById("admin-login-btn");
  const spinner = document.getElementById("admin-login-spinner");
  const btnText = document.getElementById("admin-login-btn-text");
  btn.disabled = true; spinner.style.display = "block"; btnText.textContent = "Signing in…";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const adminOk = await checkAdmin(cred.user.email);
    if (!adminOk) { await signOut(auth); throw { code: "auth/not-admin" }; }
    closeAdminModal();
  } catch (err) {
    spinner.style.display = "none"; btnText.textContent = "Admin Sign In"; btn.disabled = false;
    alertEl.textContent = err.code === "auth/not-admin"
      ? "This account does not have admin privileges."
      : firebaseErrorMsg(err.code);
    alertEl.style.display = "block";
  }
}

// ═══════════ LOGOUT ═══════════
window.doLogout = async function() {
  if (userRequestsUnsub) { userRequestsUnsub(); userRequestsUnsub = null; }
  await signOut(auth);
};

// ═══════════ AUTH STATE ═══════════
onAuthStateChanged(auth, async (user) => {
  setLoading(true);
  if (user) {
    currentUser = user;
    isAdmin = await checkAdmin(user.email);
    if (isAdmin) {
      document.getElementById("admin-email-display").textContent = user.email;
      await renderAdmin();
      showScreen("admin");
    } else {
      document.getElementById("topbar-user").textContent = user.email;
      await loadUserRequests();
      showScreen("withdrawal");
    }
  } else {
    currentUser = null; isAdmin = false;
    resetSignInForm();
    showScreen("login");
  }
  setLoading(false);
});

function resetSignInForm() {
  ["signin-email","signin-password","register-email","register-password","register-confirm","forgot-email"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  clearLoginAlerts();
}

function firebaseErrorMsg(code) {
  const map = {
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password. Please try again.",
    "auth/invalid-credential":     "Invalid email or password.",
    "auth/email-already-in-use":   "An account with this email already exists.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/too-many-requests":      "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
  };
  return map[code] || "An error occurred. Please try again.";
}

// ═══════════ WITHDRAWAL FORM ═══════════
window.switchTab = function(tab) {
  if (currentTab === tab) return;
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-" + tab).classList.add("active");
  clearErrors();
};

function clearErrors() {
  document.querySelectorAll(".field-error").forEach(el => el.classList.remove("visible"));
  document.querySelectorAll(".panel input, .panel select").forEach(el => el.classList.remove("error"));
}

function setError(fieldId, errId) {
  const f = document.getElementById(fieldId); const e = document.getElementById(errId);
  if (f) f.classList.add("error"); if (e) e.classList.add("visible");
}

function clearFieldError(el) {
  el.classList.remove("error");
  const e = document.getElementById("err-" + el.id);
  if (e) e.classList.remove("visible");
}

document.querySelectorAll(".panel input, .panel select").forEach(el => {
  el.addEventListener("input",  () => clearFieldError(el));
  el.addEventListener("change", () => clearFieldError(el));
});

function validateBank() {
  let ok = true;
  [
    ["full-name",      "err-full-name",      v => v.trim().length > 0],
    ["bank-name",      "err-bank-name",      v => v.trim().length > 0],
    ["account-number", "err-account-number", v => v.trim().length > 0],
    ["bank-amount",    "err-bank-amount",    v => parseFloat(v) > 0],
  ].forEach(([f, e, t]) => { if (!t(document.getElementById(f).value)) { setError(f, e); ok = false; } });
  return ok;
}

function validateCrypto() {
  let ok = true;
  [
    ["wallet-address", "err-wallet-address", v => v.trim().length > 0],
    ["cryptocurrency", "err-cryptocurrency", v => v !== ""],
    ["network",        "err-network",        v => v !== ""],
    ["crypto-amount",  "err-crypto-amount",  v => parseFloat(v) > 0],
  ].forEach(([f, e, t]) => { if (!t(document.getElementById(f).value)) { setError(f, e); ok = false; } });
  return ok;
}

// submitForm → collect data → open OTP modal → validate OTP → then actually save
window.submitForm = function(type) {
  const valid = type === "bank" ? validateBank() : validateCrypto();
  if (!valid) return;

  let details = {};
  if (type === "bank") {
    details = {
      fullName:      document.getElementById("full-name").value.trim(),
      bankName:      document.getElementById("bank-name").value.trim(),
      accountNumber: document.getElementById("account-number").value.trim(),
      routingCode:   document.getElementById("routing-code").value.trim() || "—",
      amount:        document.getElementById("bank-amount").value,
    };
  } else {
    details = {
      walletAddress:  document.getElementById("wallet-address").value.trim(),
      cryptocurrency: document.getElementById("cryptocurrency").value,
      network:        document.getElementById("network").value,
      amount:         document.getElementById("crypto-amount").value,
    };
  }

  pendingFormType = type;
  pendingFormData = details;
  openUserOtpModal();
};

// ═══════════ USER OTP VERIFICATION MODAL ═══════════
function openUserOtpModal() {
  document.getElementById("user-otp-input").value = "";
  document.getElementById("user-otp-err").style.display = "none";
  document.getElementById("user-otp-err").textContent = "";
  document.getElementById("modal-user-otp").classList.add("open");
  setTimeout(() => document.getElementById("user-otp-input").focus(), 150);
}

window.closeUserOtpModal = function() {
  document.getElementById("modal-user-otp").classList.remove("open");
  pendingFormType = null;
  pendingFormData = null;
};

window.confirmUserOtp = async function() {
  const code    = document.getElementById("user-otp-input").value.trim();
  const errEl   = document.getElementById("user-otp-err");
  const btn     = document.getElementById("user-otp-confirm-btn");
  const spinner = document.getElementById("user-otp-spinner");
  const btnText = document.getElementById("user-otp-btn-text");

  errEl.style.display = "none";
  if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
    errEl.textContent = "Please enter the 6-digit OTP code.";
    errEl.style.display = "block";
    return;
  }

  btn.disabled = true; spinner.style.display = "block"; btnText.textContent = "Verifying…";

  try {
    // Query for an unused, non-expired OTP with matching code
    const now = new Date();
    const otpQuery = query(
      collection(db, "otps"),
      where("code", "==", code),
      where("used", "==", false),
      limit(1)
    );
    const snap = await getDocs(otpQuery);

    if (snap.empty) {
      throw new Error("Invalid or already-used OTP code.");
    }

    const otpDoc  = snap.docs[0];
    const otpData = otpDoc.data();

    // Check expiry
    const expiresAt = new Date(otpData.expiresAt);
    if (now > expiresAt) {
      throw new Error("This OTP has expired. Ask admin for a new code.");
    }

    // OTP valid — mark it used
    await updateDoc(doc(db, "otps", otpDoc.id), { used: true, usedAt: serverTimestamp(), usedBy: currentUser.email });

    // Now submit the withdrawal
    const ref = generateRef();
    const docRef = await addDoc(collection(db, "withdrawals"), {
      id:          ref,
      type:        pendingFormType,
      details:     pendingFormData,
      status:      "pending",
      reason:      "",
      uid:         currentUser.uid,
      submittedBy: currentUser.email,
      submittedAt: serverTimestamp(),
      otpVerified: true,
    });

    // Save docId to localStorage so "My Requests" can track it
    const lsKey = `wp_reqs_${currentUser.uid}`;
    const savedIds = JSON.parse(localStorage.getItem(lsKey) || "[]");
    if (!savedIds.includes(docRef.id)) {
      savedIds.unshift(docRef.id);
      localStorage.setItem(lsKey, JSON.stringify(savedIds));
    }

    // Close modal and show confirmation
    document.getElementById("modal-user-otp").classList.remove("open");
    document.getElementById("form-area").style.display = "none";
    document.getElementById("confirmation").style.display = "block";
    document.getElementById("confirm-ref").textContent = ref;
    pendingFormType = null;
    pendingFormData = null;

    // Refresh user requests list
    loadUserRequests();

  } catch (err) {
    errEl.textContent = err.message || "Verification failed. Try again.";
    errEl.style.display = "block";
  } finally {
    btn.disabled = false; spinner.style.display = "none"; btnText.textContent = "Verify & Submit";
  }
};

document.getElementById("modal-user-otp").addEventListener("click", function(e) {
  if (e.target === this) closeUserOtpModal();
});

// Enter key in OTP input
document.getElementById("user-otp-input").addEventListener("keydown", e => {
  if (e.key === "Enter") confirmUserOtp();
});

window.resetForm = function() {
  document.getElementById("confirmation").style.display = "none";
  document.getElementById("form-area").style.display = "block";
  document.querySelectorAll("#panel-bank input, #panel-crypto input").forEach(el => el.value = "");
  document.querySelectorAll("#panel-bank select, #panel-crypto select").forEach(el => el.selectedIndex = 0);
  clearErrors();
  switchTab("bank");
};

// ═══════════ CURRENCY CONVERTER ═══════════
let _fxRates     = null;
let _fxFetchedAt = 0;

async function getFxRates() {
  const now = Date.now();
  if (_fxRates && (now - _fxFetchedAt) < 30 * 60 * 1000) return _fxRates;
  try {
    const res  = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json.rates) {
      _fxRates     = json.rates;
      _fxFetchedAt = now;
    }
  } catch (e) {
    console.warn("FX fetch failed:", e.message);
  }
  return _fxRates;
}

window.convertAmount = async function(panel) {
  const amtId    = panel === "bank" ? "bank-amount"          : "crypto-amount";
  const selId    = panel === "bank" ? "bank-currency-select" : "crypto-currency-select";
  const resId    = panel === "bank" ? "bank-conv-result"     : "crypto-conv-result";
  const amountEl = document.getElementById(amtId);
  const selEl    = document.getElementById(selId);
  const resEl    = document.getElementById(resId);
  if (!resEl) return;

  const usd      = parseFloat(amountEl?.value);
  const currency = selEl?.value;
  if (!usd || usd <= 0 || !currency) { resEl.innerHTML = ""; return; }

  resEl.innerHTML = `<span class="conv-loading">Converting…</span>`;
  const rates = await getFxRates();
  if (!rates || !rates[currency]) { resEl.innerHTML = ""; return; }

  const converted = (usd * rates[currency]).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  resEl.innerHTML = `
    <div class="conv-result">
      <span class="conv-equals">≈</span>
      <span class="conv-amount">${converted}</span>
      <span class="conv-code">${currency}</span>
    </div>`;
};

// ═══════════ USER — MY REQUESTS (real-time listener) ═══════════
function renderUserRequests(data) {
  const container = document.getElementById("user-requests-container");
  if (!container) return;

  if (data.length === 0) {
    container.innerHTML = `<div class="ur-empty">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      No requests yet. Submit your first withdrawal above.
    </div>`;
    return;
  }

  const rows = data.map(r => {
    const d      = r.details || {};
    const amount = parseFloat(d.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const typeIcon  = r.type === "bank" ? "🏦" : "₿";
    const typeLabel = r.type === "bank" ? "Bank" : "Crypto";
    const badge     = statusBadge(r.status || "pending");
    const reasonHtml = (r.status === "declined" && r.reason)
      ? `<div class="ur-reason">Reason: ${escHtml(r.reason)}</div>` : "";
    return `
      <div class="ur-item">
        <div class="ur-left">
          <div class="ur-type">${typeIcon} ${typeLabel}</div>
          <div class="ur-ref">${escHtml(r.id || r._docId)}</div>
          <div class="ur-date">${formatDate(r.submittedAt)}</div>
        </div>
        <div class="ur-right">
          <div class="ur-amount">$${amount}</div>
          <div>${badge}</div>
          ${reasonHtml}
        </div>
      </div>`;
  }).join("");

  container.innerHTML = rows;
}

// ── loadUserRequests ──
// Strategy: try collection-level onSnapshot first (picks up ALL requests).
// If Firestore rules deny it, fall back to per-document onSnapshot using
// docIds saved in localStorage. Either way users see live status changes.
window.loadUserRequests = function() {
  if (userRequestsUnsub) { userRequestsUnsub(); userRequestsUnsub = null; }

  const container = document.getElementById("user-requests-container");
  if (!container || !currentUser) return;
  container.innerHTML = `<div class="ur-loading"><div class="loading-spinner" style="width:24px;height:24px;border-width:2px;"></div></div>`;

  const lsKey      = `wp_reqs_${currentUser.uid}`;
  const requestsMap = {};
  const allUnsubs   = [];

  function rerender() {
    const data = Object.values(requestsMap)
      .filter(r => r && r._docId)
      .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0));
    renderUserRequests(data);
  }

  // ── Per-doc listener (always works, uses "get" permission) ──
  function subscribeDoc(docId) {
    if (allUnsubs[docId]) return; // already watching
    const unsub = onSnapshot(
      doc(db, "withdrawals", docId),
      (snap) => {
        if (snap.exists()) {
          requestsMap[docId] = { _docId: docId, ...snap.data() };
          rerender();
        }
      },
      (err) => console.warn("doc listener:", docId, err.code)
    );
    allUnsubs[docId] = unsub;
  }

  // Kick off listeners for any doc IDs already in localStorage
  const savedIds = JSON.parse(localStorage.getItem(lsKey) || "[]");
  savedIds.forEach(id => subscribeDoc(id));
  if (savedIds.length === 0) rerender(); // show empty state immediately

  // ── Collection query (bonus: discovers requests from other devices/browsers) ──
  const q = query(collection(db, "withdrawals"), where("uid", "==", currentUser.uid));
  const collUnsub = onSnapshot(q,
    (snap) => {
      // Save any new docIds to localStorage for future offline fallback
      const existing = JSON.parse(localStorage.getItem(lsKey) || "[]");
      let changed = false;
      snap.docs.forEach(d => {
        if (!existing.includes(d.id)) { existing.unshift(d.id); changed = true; }
        requestsMap[d.id] = { _docId: d.id, ...d.data() };
        subscribeDoc(d.id); // ensure per-doc listener is active too
      });
      if (changed) localStorage.setItem(lsKey, JSON.stringify(existing));
      rerender();
    },
    (err) => {
      // Likely a rules/permission error — per-doc fallback already running
      console.warn("Collection query denied (falling back to localStorage):", err.code);
      if (savedIds.length === 0) rerender(); // show empty if nothing in localStorage
    }
  );
  allUnsubs["__collection__"] = collUnsub;

  userRequestsUnsub = () => Object.values(allUnsubs).forEach(u => typeof u === "function" && u());
};

// ═══════════ ADMIN — GENERATE OTP ═══════════
window.adminGenerateOtp = async function() {
  const code = generateOTPCode();
  const now  = new Date();
  const exp  = new Date(now.getTime() + 10 * 60 * 1000);

  const btn     = document.getElementById("admin-gen-otp-btn");
  const spinner = document.getElementById("admin-gen-otp-spinner");
  const btnText = document.getElementById("admin-gen-otp-text");
  btn.disabled = true; spinner.style.display = "inline-block"; btnText.textContent = "Generating…";

  try {
    const ref = await addDoc(collection(db, "otps"), {
      code,
      generatedAt: serverTimestamp(),
      expiresAt:   exp.toISOString(),
      used:        false,
      generatedBy: currentUser.email,
    });

    // Show in the admin OTP display
    document.getElementById("admin-otp-result").innerHTML = `
      <div class="admin-otp-box">
        <div class="admin-otp-label">Share this code with the user</div>
        <div class="admin-otp-code">${code}</div>
        <div class="admin-otp-meta">Valid for 10 minutes · Expires ${exp.toLocaleTimeString()}</div>
      </div>`;
    document.getElementById("admin-otp-result").style.display = "block";
  } catch (err) {
    console.error(err);
    alert("Failed to generate OTP. Check Firestore rules.");
  } finally {
    btn.disabled = false; spinner.style.display = "none"; btnText.textContent = "Generate OTP";
  }
};

// ═══════════ ADMIN PANEL ═══════════
window.setFilter = function(btn, filter) {
  adminFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderTable(window._adminData || []);
};

window.renderAdmin = async function() {
  renderStats([]);
  document.getElementById("admin-table-wrap").innerHTML =
    `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto;"></div></div>`;

  try {
    const q    = query(collection(db, "withdrawals"), orderBy("submittedAt", "desc"));
    const snap = await getDocs(q);
    const data = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    window._adminData = data;
    renderStats(data);
    renderTable(data);
  } catch (err) {
    console.error(err);
    document.getElementById("admin-table-wrap").innerHTML =
      `<div class="empty-state">Failed to load data.<br/><span style="font-family:monospace;font-size:11px;opacity:0.7;">${escHtml(err.code || "")} — ${escHtml(err.message || "")}</span></div>`;
  }
};

function renderStats(data) {
  const total      = data.length;
  const pending    = data.filter(r => r.status === "pending").length;
  const processing = data.filter(r => r.status === "processing").length;
  const approved   = data.filter(r => r.status === "approved").length;
  const declined   = data.filter(r => r.status === "declined").length;

  document.getElementById("admin-stats").innerHTML = `
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${total}</div></div>
    <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value pending">${pending}</div></div>
    <div class="stat-card"><div class="stat-label">Processing</div><div class="stat-value processing">${processing}</div></div>
    <div class="stat-card"><div class="stat-label">Approved</div><div class="stat-value approved">${approved}</div></div>
    <div class="stat-card"><div class="stat-label">Declined</div><div class="stat-value declined">${declined}</div></div>
  `;
}

function renderTable(allData) {
  const data = adminFilter === "all" ? allData : allData.filter(r => r.status === adminFilter);
  const wrap = document.getElementById("admin-table-wrap");

  if (data.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      No ${adminFilter === "all" ? "" : adminFilter + " "}withdrawal requests found.
    </div>`;
    return;
  }

  const rows = data.map(r => {
    const d = r.details || {};
    const nameOrWallet = r.type === "bank"
      ? escHtml(d.fullName || "")
      : `<span style="font-family:monospace;font-size:12px;">${escHtml((d.walletAddress || "").slice(0, 14))}…</span>`;
    const info = r.type === "bank"
      ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escHtml(d.bankName || "")} · ${escHtml(d.accountNumber || "")}</div>`
      : `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escHtml(d.cryptocurrency || "")} · ${escHtml(d.network || "")}</div>`;
    const typeBadge = r.type === "bank"
      ? `<span class="td-type type-bank">🏦 Bank</span>`
      : `<span class="td-type type-crypto">₿ Crypto</span>`;
    const badge = statusBadge(r.status || "pending");
    const reasonRow = r.status === "declined" && r.reason
      ? `<div class="td-reason">Reason: ${escHtml(r.reason)}</div>` : "";

    const docId       = escHtml(r._docId);
    const approveDis  = r.status === "approved"   ? "disabled" : "";
    const pendDis     = r.status === "pending"    ? "disabled" : "";
    const processDis  = r.status === "processing" ? "disabled" : "";
    const declineDis  = r.status === "declined"   ? "disabled" : "";

    return `<tr>
      <td class="td-ref" data-label="Ref ID">${escHtml(r.id || r._docId)}</td>
      <td data-label="Type">${typeBadge}</td>
      <td data-label="Account">
        <div>
          <div class="td-name">${nameOrWallet}</div>${info}
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escHtml(r.submittedBy || "")}</div>
        </div>
      </td>
      <td class="td-amount" data-label="Amount">$${parseFloat(d.amount || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td data-label="Status"><div>${badge}${reasonRow}</div></td>
      <td data-label="Submitted" style="font-size:12px;color:var(--text-muted);">${formatDate(r.submittedAt)}</td>
      <td class="td-actions-cell" data-label="Actions">
        <div class="action-btns">
          <button class="action-btn btn-approve" ${approveDis} onclick="updateStatus('${docId}','approved')">✓ Approve</button>
          <button class="action-btn btn-process" ${processDis} onclick="updateStatus('${docId}','processing')">⟳ Process</button>
          <button class="action-btn btn-pend"    ${pendDis}    onclick="updateStatus('${docId}','pending')">⏸ Pend</button>
          <button class="action-btn btn-decline" ${declineDis} onclick="openDeclineModal('${docId}')">✕ Decline</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `<table>
    <thead>
      <tr>
        <th>Ref ID</th><th>Type</th><th>Account Details</th>
        <th>Amount</th><th>Status</th><th>Submitted</th><th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ═══════════ STATUS UPDATES ═══════════
window.updateStatus = async function(docId, status) {
  try {
    await updateDoc(doc(db, "withdrawals", docId), { status, reason: "" });
    await renderAdmin();
  } catch (err) {
    console.error(err);
    alert("Failed to update status. Check your permissions.");
  }
};

// ═══════════ DECLINE MODAL ═══════════
window.openDeclineModal = function(docId) {
  declineTarget = docId;
  document.getElementById("decline-reason").value = "";
  document.getElementById("decline-reason").classList.remove("error");
  document.getElementById("decline-err").classList.remove("visible");
  document.getElementById("modal-decline").classList.add("open");
};
window.closeDeclineModal = function() {
  document.getElementById("modal-decline").classList.remove("open");
  declineTarget = null;
};
window.confirmDecline = async function() {
  const reason = document.getElementById("decline-reason").value.trim();
  if (!reason) {
    document.getElementById("decline-reason").classList.add("error");
    document.getElementById("decline-err").classList.add("visible");
    return;
  }
  try {
    await updateDoc(doc(db, "withdrawals", declineTarget), { status: "declined", reason });
    closeDeclineModal();
    await renderAdmin();
  } catch (err) {
    console.error(err);
    alert("Failed to decline. Check your permissions.");
  }
};
document.getElementById("modal-decline").addEventListener("click", function(e) {
  if (e.target === this) closeDeclineModal();
});

// ═══════════ EVENT LISTENERS ═══════════
document.getElementById("signin-btn").addEventListener("click", doSignIn);
document.getElementById("signin-password").addEventListener("keydown", e => { if (e.key === "Enter") doSignIn(); });
document.getElementById("signin-email").addEventListener("keydown", e => { if (e.key === "Enter") doSignIn(); });

document.getElementById("register-btn").addEventListener("click", doCreateAccount);
document.getElementById("register-confirm").addEventListener("keydown", e => { if (e.key === "Enter") doCreateAccount(); });

document.getElementById("forgot-btn").addEventListener("click", doForgotPassword);
document.getElementById("forgot-email").addEventListener("keydown", e => { if (e.key === "Enter") doForgotPassword(); });

document.getElementById("admin-login-btn").addEventListener("click", doAdminLogin);
document.getElementById("admin-modal-password").addEventListener("keydown", e => { if (e.key === "Enter") doAdminLogin(); });
document.getElementById("modal-admin-login").addEventListener("click", function(e) {
  if (e.target === this) closeAdminModal();
});
