# Withdrawal Portal

A single-page Firebase-powered withdrawal management portal with user and admin dashboards.

## Project Structure

```
withdrawal-portal/
├── index.html              ← Single HTML file (all screens/views)
├── style.css               ← All styles
├── script.js               ← All JavaScript (Firebase Auth + Firestore logic)
├── firebase.js             ← Firebase SDK init and exports
├── firestore.rules         ← Firestore security rules
├── firebase.json           ← Firebase Hosting + Firestore config
├── firestore.indexes.json  ← Firestore composite indexes
├── functions/
│   ├── index.js            ← Cloud Functions (status change hooks)
│   └── package.json
└── README.md
```

## Features

### User Side
- **Sign In** via Firebase Authentication
- **Create Account** (email + password)
- **Forgot Password** (sends reset email via Firebase)
- **Bank Withdrawal** form (name, bank, account, routing, amount)
- **Crypto Withdrawal** form (wallet, coin, network, amount)
- Submissions stored in **Firestore** (`withdrawals` collection)
- Unique reference ID generated per request

### Admin Side
- **Admin Login modal** — accessible via "Admin Login" link at the bottom of the login page
- Admin access verified by checking the `admins` Firestore collection or the `ADMIN_EMAILS` list in `script.js`
- **Dashboard statistics** — Total, Pending, Processing, Approved, Declined
- **Filter** by status
- **Actions per request**: Approve, Process, Pend, Decline (with reason), Generate OTP
- **OTP generation** — 6-digit code saved to Firestore `otps` collection, valid 10 minutes

## Firebase Setup (One-Time)

### Step 1 — Enable Email/Password Authentication
1. Go to [Firebase Console](https://console.firebase.google.com/) → your project `withdrawal-app-46485`
2. Click **Authentication** in the left sidebar
3. Click the **Sign-in method** tab
4. Click **Email/Password** → toggle **Enable** → Save

### Step 2 — Create the Admin Account
1. Still in **Authentication**, click the **Users** tab
2. Click **Add user**
3. Enter:
   - **Email:** `yomawisdom55@gmail.com`
   - **Password:** `mamaboy12`
4. Click **Add user**

> ⚠️ The password is only stored in Firebase Authentication — it is never written in any code file. This is intentional and secure.

### Step 3 — Register Admin Email in Firestore
1. Go to **Firestore Database** in the Firebase Console
2. Click **Start collection** → Collection ID: `admins`
3. Add a document:
   - **Document ID:** `yomawisdom55@gmail.com`
   - No fields needed — just the document ID
4. Click **Save**

> This is what grants admin privileges. Any user whose email exists in this collection gets admin access after login.

### Step 4 — Deploy Firestore Rules & Indexes
```bash
firebase deploy --only firestore
```

### Step 5 — Deploy Hosting
```bash
firebase deploy --only hosting
```

### Step 6 — Deploy Everything at Once
```bash
firebase deploy
```

## Local Development

Since the app uses ES modules (`type="module"`), open it through a local server — not `file://`:

```bash
# Using Node.js serve
npx serve .

# Using Python
python3 -m http.server 8080

# Using Firebase CLI (recommended)
firebase serve
```

Then open: `http://localhost:5000` (or the port shown)

## Withdrawal Statuses

| Status     | Meaning                        |
|------------|--------------------------------|
| Pending    | Awaiting admin review          |
| Processing | Admin is actively processing   |
| Approved   | Request approved               |
| Declined   | Request declined (with reason) |

## Security Notes

- Firestore rules restrict users to reading/writing only their own withdrawals
- Admins (verified by `admins` collection) can read and update all withdrawals
- OTP records are admin-only in Firestore
- Never expose admin credentials in client-side code in production — use Firebase custom claims for robust admin verification
