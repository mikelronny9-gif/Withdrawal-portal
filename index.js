const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp }    = require("firebase-admin/app");
const { getFirestore }     = require("firebase-admin/firestore");

initializeApp();

/**
 * When a withdrawal status changes to "approved" or "declined",
 * you could trigger email notifications here via SendGrid / Nodemailer.
 * Stub left intentionally — wire up your email provider as needed.
 */
exports.onWithdrawalStatusChange = onDocumentUpdated(
  "withdrawals/{docId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (before.status === after.status) return null;

    console.log(
      `Withdrawal ${event.params.docId} status changed: ${before.status} → ${after.status}`
    );

    // TODO: send email to after.submittedBy with the new status
    return null;
  }
);
