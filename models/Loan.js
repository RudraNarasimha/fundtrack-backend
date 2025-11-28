const mongoose = require("mongoose");

const InstallmentSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  receiptNumber: { type: String, default: null },
  paymentMethod: { type: String, enum: ["Cash", "Online", "Bank", "Other"], default: "Cash" },
  notes: { type: String, default: "" }
});

const LoanSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    memberName: { type: String, required: true },
    loanAmount: { type: Number, required: true },
    interestRate: { type: Number, required: true }, // % per year
    totalInterest: { type: Number, default: 0 },
    totalRepayment: { type: Number, required: true },
    tenure: { type: Number, required: true },
    loanStartDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["Active", "Completed", "Pending", "Cancelled"], default: "Active" },

    installments: [InstallmentSchema],   // Stores each payment
    amountPaid: { type: Number, default: 0 }, // NEW: Total amount paid
    remainingDue: { type: Number, required: true },

    repaymentMode: { type: String, enum: ["Calculated EMI", "Fixed Payment"], default: "Calculated EMI" },
    monthlyEMI: { type: Number, default: 0 },
    fixedMonthlyPayment: { type: Number, default: 0 },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Loan", LoanSchema);
