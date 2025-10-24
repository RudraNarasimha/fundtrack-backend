const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true }
});

// Set password with hashing
AdminSchema.methods.setPassword = async function(password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

// Validate password method
AdminSchema.methods.validatePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('Admin', AdminSchema);
