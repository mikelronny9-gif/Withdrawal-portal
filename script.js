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
  query, orderBy, where, serverTimestamp, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ═══════════ ADMIN CONFIG ═══════════
// Add admin emails to the Firestore `admins` collection OR list them here as fallback
const ADMIN_EMAILS = ["yomawisdom55@gmail.com"];

// ═══════════ STATE ═══════════
let currentUser   = null;
let isAdmin       = false;
let currentTab    = "bank";
let adminFilter   = "all";
let declineTarget = null;
let otpTarget     = null;

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

function generateOTP() {
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

  if (!email || !password) {
    showLoginError("signin-alert", "Please enter your email and password.");
    return;
  }

  const btn     = document.getElementById("signin-btn");
  const spinner = document.getElementById("signin-spinner");
  const btnText = document.getElementById("signin-btn-text");
  btn.disabled = true;
  spinner.style.display = "block";
  btnText.textContent = "Signing in…";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles redirect
  } catch (err) {
    spinner.style.display = "none";
    btnText.textContent = "Sign In";
    btn.disabled = false;
    showLoginError("signin-alert", firebaseErrorMsg(err.code));
  }
}

// ═══════════ CREATE ACCOUNT ═══════════
async function doCreateAccount() {
  const email    = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirm  = document.getElementById("register-confirm").value;
  clearLoginAlerts();

  if (!email || !password || !confirm) {
    showLoginError("register-alert", "Please fill in all fields.");
    return;
  }
  if (password.length < 6) {
    showLoginError("register-alert", "Password must be at least 6 characters.");
    return;
  }
  if (password !== confirm) {
    showLoginError("register-alert", "Passwords do not match.");
    return;
  }

  const btn     = document.getElementById("register-btn");
  const spinner = document.getElementById("register-spinner");
  const btnText = document.getElementById("register-btn-text");
  btn.disabled = true;
  spinner.style.display = "block";
  btnText.textContent = "Creating account…";

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles redirect
  } catch (err) {
    spinner.style.display = "none";
    btnText.textContent = "Create Account";
    btn.disabled = false;
    showLoginError("register-alert", firebaseErrorMsg(err.code));
  }
}

// ═══════════ FORGOT PASSWORD ═══════════
async function doForgotPassword() {
  const email = document.getElementById("forgot-email").value.trim();
  clearLoginAlerts();

  if (!email) {
    showLoginError("forgot-alert", "Please enter your email address.");
    return;
  }

  const btn     = document.getElementById("forgot-btn");
  const spinner = document.getElementById("forgot-spinner");
  const btnText = document.getElementById("forgot-btn-text");
  btn.disabled = true;
  spinner.style.display = "block";
  btnText.textContent = "Sending…";

  try {
    await sendPasswordResetEmail(auth, email);
    spinner.style.display = "none";
    btnText.textContent = "Send Reset Link";
    btn.disabled = false;
    showLoginSuccess("forgot-success", "Reset link sent! Check your inbox.");
  } catch (err) {
    spinner.style.display = "none";
    btnText.textContent = "Send Reset Link";
    btn.disabled = false;
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

  if (!email || !password) {
    alertEl.textContent = "Please enter your email and password.";
    alertEl.style.display = "block";
    return;
  }

  const btn     = document.getElementById("admin-login-btn");
  const spinner = document.getElementById("admin-login-spinner");
  const btnText = document.getElementById("admin-login-btn-text");
  btn.disabled = true;
  spinner.style.display = "block";
  btnText.textContent = "Signing in…";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const adminOk = await checkAdmin(cred.user.email);
    if (!adminOk) {
      await signOut(auth);
      throw { code: "auth/not-admin" };
    }
    closeAdminModal();
    // onAuthStateChanged will route to admin screen
  } catch (err) {
    spinner.style.display = "none";
    btnText.textContent = "Admin Sign In";
    btn.disabled = false;
    alertEl.textContent = err.code === "auth/not-admin"
      ? "This account does not have admin privileges."
      : firebaseErrorMsg(err.code);
    alertEl.style.display = "block";
  }
}

// ═══════════ LOGOUT ═══════════
window.doLogout = async function() {
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
      showScreen("withdrawal");
    }
  } else {
    currentUser = null;
    isAdmin = false;
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
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password. Please try again.",
    "auth/invalid-credential":   "Invalid email or password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/too-many-requests":    "Too many attempts. Please wait and try again.",
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
  const f = document.getElementById(fieldId);
  const e = document.getElementById(errId);
  if (f) f.classList.add("error");
  if (e) e.classList.add("visible");
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
  ].forEach(([f, e, t]) => {
    if (!t(document.getElementById(f).value)) { setError(f, e); ok = false; }
  });
  return ok;
}

function validateCrypto() {
  let ok = true;
  [
    ["wallet-address", "err-wallet-address", v => v.trim().length > 0],
    ["cryptocurrency", "err-cryptocurrency", v => v !== ""],
    ["network",        "err-network",        v => v !== ""],
    ["crypto-amount",  "err-crypto-amount",  v => parseFloat(v) > 0],
  ].forEach(([f, e, t]) => {
    if (!t(document.getElementById(f).value)) { setError(f, e); ok = false; }
  });
  return ok;
}

window.submitForm = async function(type) {
  const valid = type === "bank" ? validateBank() : validateCrypto();
  if (!valid) return;

  const spinner = document.getElementById("spinner-" + type);
  const btnText = document.getElementById("btn-" + type + "-text");
  const btn     = spinner.closest(".btn");
  spinner.style.display = "block";
  btnText.textContent = "Processing…";
  btn.disabled = true;

  try {
    const ref = generateRef();
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
        walletAddress: document.getElementById("wallet-address").value.trim(),
        cryptocurrency: document.getElementById("cryptocurrency").value,
        network:       document.getElementById("network").value,
        amount:        document.getElementById("crypto-amount").value,
      };
    }

    await addDoc(collection(db, "withdrawals"), {
      id:          ref,
      type,
      details,
      status:      "pending",
      reason:      "",
      uid:         currentUser.uid,
      submittedBy: currentUser.email,
      submittedAt: serverTimestamp(),
    });

    spinner.style.display = "none";
    btnText.textContent = "Submit Withdrawal";
    btn.disabled = false;

    document.getElementById("form-area").style.display = "none";
    document.getElementById("confirmation").style.display = "block";
    document.getElementById("confirm-ref").textContent = ref;
  } catch (err) {
    console.error(err);
    spinner.style.display = "none";
    btnText.textContent = "Submit Withdrawal";
    btn.disabled = false;
    alert("Failed to submit. Please try again.");
  }
};

window.resetForm = function() {
  document.getElementById("confirmation").style.display = "none";
  document.getElementById("form-area").style.display = "block";
  document.querySelectorAll("#panel-bank input, #panel-crypto input").forEach(el => el.value = "");
  document.querySelectorAll("#panel-bank select, #panel-crypto select").forEach(el => el.selectedIndex = 0);
  clearErrors();
  switchTab("bank");
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
    const q = query(collection(db, "withdrawals"), orderBy("submittedAt", "desc"));
    const snap = await getDocs(q);
    const data = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    window._adminData = data;
    renderStats(data);
    renderTable(data);
  } catch (err) {
    console.error(err);
    document.getElementById("admin-table-wrap").innerHTML =
      `<div class="empty-state">Failed to load data. Check Firestore rules.</div>`;
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
  const data = adminFilter === "all"
    ? allData
    : allData.filter(r => r.status === adminFilter);
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
      ? `<div class="td-reason">Reason: ${escHtml(r.reason)}</div>`
      : "";

    const approveDis  = r.status === "approved"   ? "disabled" : "";
    const pendDis     = r.status === "pending"    ? "disabled" : "";
    const processDis  = r.status === "processing" ? "disabled" : "";
    const declineDis  = r.status === "declined"   ? "disabled" : "";

    const docId = escHtml(r._docId);
    return `<tr>
      <td class="td-ref">${escHtml(r.id || r._docId)}</td>
      <td>${typeBadge}</td>
      <td><div class="td-name">${nameOrWallet}</div>${info}
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escHtml(r.submittedBy || "")}</div></td>
      <td class="td-amount">$${parseFloat(d.amount || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td><div>${badge}</div>${reasonRow}</td>
      <td style="font-size:12px;color:var(--text-muted);">${formatDate(r.submittedAt)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn btn-approve"  ${approveDis}  onclick="updateStatus('${docId}','approved')">✓ Approve</button>
          <button class="action-btn btn-process"  ${processDis}  onclick="updateStatus('${docId}','processing')">⟳ Process</button>
          <button class="action-btn btn-pend"     ${pendDis}     onclick="updateStatus('${docId}','pending')">⏸ Pend</button>
          <button class="action-btn btn-decline"  ${declineDis}  onclick="openDeclineModal('${docId}')">✕ Decline</button>
          <button class="action-btn btn-otp"                     onclick="openOtpModal('${docId}')">🔑 OTP</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `<table>
    <thead>
      <tr>
        <th>Ref ID</th>
        <th>Type</th>
        <th>Account Details</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Submitted</th>
        <th>Actions</th>
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

// ═══════════ OTP MODAL ═══════════
window.openOtpModal = function(docId) {
  otpTarget = docId;
  document.getElementById("otp-display-area").innerHTML = "";
  document.getElementById("modal-otp").classList.add("open");
};

window.closeOtpModal = function() {
  document.getElementById("modal-otp").classList.remove("open");
  otpTarget = null;
};

window.generateAndShowOtp = async function() {
  const code = generateOTP();
  const now  = new Date();
  const exp  = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

  try {
    await setDoc(doc(db, "otps", otpTarget), {
      code,
      withdrawalId: otpTarget,
      generatedAt: serverTimestamp(),
      expiresAt: exp.toISOString(),
      generatedBy: currentUser.email,
    });

    document.getElementById("otp-display-area").innerHTML = `
      <div class="otp-display">
        <div class="otp-code">${code}</div>
        <div class="otp-meta">Valid for 10 minutes · Expires at ${exp.toLocaleTimeString()}</div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    document.getElementById("otp-display-area").innerHTML =
      `<p style="color:var(--error);font-size:13px;margin-top:12px;">Failed to save OTP. Check Firestore rules.</p>`;
  }
};

document.getElementById("modal-otp").addEventListener("click", function(e) {
  if (e.target === this) closeOtpModal();
});

// ═══════════ EVENT LISTENERS ═══════════
// Sign in
document.getElementById("signin-btn").addEventListener("click", doSignIn);
document.getElementById("signin-password").addEventListener("keydown", e => { if (e.key === "Enter") doSignIn(); });
document.getElementById("signin-email").addEventListener("keydown", e => { if (e.key === "Enter") doSignIn(); });

// Create account
document.getElementById("register-btn").addEventListener("click", doCreateAccount);
document.getElementById("register-confirm").addEventListener("keydown", e => { if (e.key === "Enter") doCreateAccount(); });

// Forgot password
document.getElementById("forgot-btn").addEventListener("click", doForgotPassword);
document.getElementById("forgot-email").addEventListener("keydown", e => { if (e.key === "Enter") doForgotPassword(); });

// Admin login modal
document.getElementById("admin-login-btn").addEventListener("click", doAdminLogin);
document.getElementById("admin-modal-password").addEventListener("keydown", e => { if (e.key === "Enter") doAdminLogin(); });
document.getElementById("modal-admin-login").addEventListener("click", function(e) {
  if (e.target === this) closeAdminModal();
});
