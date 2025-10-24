const mongoose = require('mongoose');

const ContributionSchema = new mongoose.Schema({
  memberName: { type: String, required: true },
  email: { type: String, default: '' },    // added email
  phone: { type: String, default: '' },    // added phone
  active: { type: Boolean, default: true },
  target: { type: Number, default: 300 },
  amountPaid: { type: Number, default: 0 },
  method: { type: String, enum: ['Cash','UPI','Banking'], default: 'Cash' },
  status: { type: String, enum: ['Paid','Partial','Pending'], default: 'Pending' },
  balance: { type: Number, default: 0 },
  extra: { type: Number, default: 0 },
  month: { type: Number, required: true }, // 1-12
  year: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Contribution', ContributionSchema);
