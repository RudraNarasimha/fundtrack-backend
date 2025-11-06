// models/Member.js
const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  memberName: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Member', MemberSchema);
