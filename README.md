# Withdrawal Portal

A single-page Firebase-powered withdrawal management portal with user and admin dashboards.

## Project Structure

```
withdrawal-portal/
├── index.html              ← Single HTML file (all screens/views)
├── style.css               ← All styles
├── script.js               ← All JavaScript (Firebase Auth + Firestore logic)
├── firebase.js             ← Firebase SDK init and exports
├── firestore.rules         ← Firestore security rules (paste into Firebase Console)
├── firebase.json           ← Firebase Hosting + Firestore config
├── firestore.indexes.json  ← Firestore composite indexes
└── README.md
```

---

## ⚠️ CRITICAL SETUP — Firestore Rules (Must Do This First)

The "My Requests" section will NOT work until you paste the correct rules into Firebase Console.

### How to update Firestore Rules:

1. Go to [Firebase Console](https://console.firebase.google.com/) → project `withdrawal-app-46485`
2. Click **Firestore Database** in the left sidebar
3. Click the **Rules** tab at the top
4. **Delete everything** in the editor and paste exactly this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /admins/{email} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /withdrawals/{docId} {
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;

      allow get: if request.auth != null
                 && (resource.data.uid == request.auth.uid
                     || exists(/databases/$(database)/documents/admins/$(request.auth.token.email)));

      allow list: if request.auth != null;

      allow update: if request.auth != null
                    && exists(/databases/$(database)/documents/admins/$(request.auth.token.email));

      allow delete: if false;
    }

    match /otps/{docId} {
      allow get, list: if request.auth != null;

      allow create, update: if request.auth != null
                             && exists(/databases/$(database)/documents/admins/$(request.auth.token.email));

      allow delete: if false;
    }
  }
}
```

5. Click **Publish**

Once published, "My Requests" will show live statuses and OTP verification will work.

---

## Firebase Setup (One-Time)

### Step 1 — Enable Email/Password Authentication
1. Go to [Firebase Console](https://console.firebase.google.com/) → project `withdrawal-app-46485`
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

> ⚠️ The password is only stored in Firebase Authentication — it is never written in any code file.

### Step 3 — Register Admin Email in Firestore
1. Go to **Firestore Database** in the Firebase Console
2. Click **Start collection** → Collection ID: `admins`
3. Add a document:
   - **Document ID:** `yomawisdom55@gmail.com`
   - No fields needed — just the document ID
4. Click **Save**

### Step 4 — Update Firestore Rules (REQUIRED for "My Requests" to work)
Follow the **⚠️ CRITICAL SETUP** section above.

### Step 5 — Deploy Hosting
```bash
firebase deploy --only hosting
```

Or just upload the files directly to your hosting (GitHub Pages, etc.).

---

## Features

### User Side
- Sign In / Create Account / Forgot Password via Firebase Auth
- Bank or Crypto withdrawal form
- **OTP gate** — admin must generate a code before user can submit
- **My Requests** — live real-time status tracker (updates instantly when admin changes status)

### Admin Side
- Admin Login modal on the login page
- Dashboard: Total / Pending / Processing / Approved / Declined stats
- Filter requests by status
- Actions per request: Approve, Process, Pend, Decline (with reason)
- **Generate OTP** — produces a 6-digit code valid for 10 minutes to share with user

---

## Withdrawal Statuses

| Status     | Meaning                          |
|------------|----------------------------------|
| Pending    | Awaiting admin review            |
| Processing | Admin is actively processing     |
| Approved   | Request approved                 |
| Declined   | Request declined (with reason)   |

---

## OTP Flow

1. User fills in the withdrawal form and clicks **Submit Withdrawal**
2. An OTP modal appears asking for the 6-digit code
3. Admin goes to their dashboard → clicks **Generate OTP** → shares the code with the user
4. User enters the code → system validates against Firestore → submits the withdrawal
5. OTP is marked as used (each code works only once, expires in 10 minutes)

---

## Security Notes

- Firestore `allow list: if request.auth != null` permits collection queries for authenticated users only — query filters ensure users only receive their own documents
- Admins verified via `admins` Firestore collection
- OTPs are single-use and expire after 10 minutes
