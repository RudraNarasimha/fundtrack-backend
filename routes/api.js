const express = require('express');
const router = express.Router();
const Contribution = require('../models/Contribution');
const Member = require('../models/Member'); 
const { stringify } = require('csv-stringify');
const Admin = require('../models/admin');
const bcrypt = require('bcrypt');
const Loan = require('../models/Loan');

// Simple API health check
router.get('/', (req, res) => {
  res.json({ message: 'Fund Tracker API is working' });
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid username or password' });

    const isMatch = await admin.validatePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid username or password' });

    res.json({ success: true, message: 'Login successful', token: 'dummy-token' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all contributions
router.get('/contributions', async (req, res) => {
  try {
    const { month, year, method, status, search, page = 1, limit = 100 } = req.query;
    const query = {};
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);
    if (method && method !== 'All') query.method = method;
    if (status && status !== 'All') query.status = status;
    if (search) query.memberName = { $regex: search, $options: 'i' };

    const contributions = await Contribution.find(query)
      .sort({ memberName: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Contribution.countDocuments(query);
    res.json({ data: contributions, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get summary
router.get('/summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    const match = {};
    if (month) match.month = Number(month);
    if (year) match.year = Number(year);

    const agg = await Contribution.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalTarget: { $sum: "$target" },
          totalCollected: { $sum: "$amountPaid" },
          totalPending: { $sum: "$balance" },
          totalExtra: { $sum: "$extra" },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = agg[0] || { totalTarget: 0, totalCollected: 0, totalPending: 0, totalExtra: 0, count: 0 };
    res.json({
      targetPerHead: result.count > 0 ? Math.round(result.totalTarget / result.count) : 0,
      monthlyTarget: result.totalTarget,
      totalCollected: result.totalCollected,
      pendingBalance: result.totalPending,
      extraContributions: result.totalExtra
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Charts
router.get('/charts', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = Number(year) || (new Date()).getFullYear();

    const match = { year: y };
    if (month) match.month = Number(month);

    const monthly = await Contribution.aggregate([
      { $match: { year: y } },
      { $group: { _id: "$month", total: { $sum: "$amountPaid" }, target: { $sum: "$target" }, extra: { $sum: "$extra" } } },
      { $sort: { _id: 1 } }
    ]);

    const methods = await Contribution.aggregate([
      { $match: match },
      { $group: { _id: "$method", total: { $sum: "$amountPaid" } } }
    ]);

    res.json({ monthly, methods });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export contributions CSV
router.get('/export', async (req, res) => {
  try {
    const { month, year } = req.query;
    const query = {};
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const docs = await Contribution.find(query).lean();
    const rows = docs.map(d => ({
      memberName: d.memberName,
      target: d.target,
      amountPaid: d.amountPaid,
      method: d.method,
      status: d.status,
      balance: d.balance || (d.target - d.amountPaid),
      extra: d.extra,
      month: d.month,
      year: d.year
    }));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contributions_${month || 'all'}_${year || 'all'}.csv"`);

    stringify(rows, { header: true }).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- MEMBERS ROUTES ----------------

// Get all members
router.get('/members', async (req, res) => {
  try {
    const members = await Member.find().sort({ memberName: 1 }).lean();
    res.json({ data: members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch members' });
  }
});

// Add a new member
router.post('/members', async (req, res) => {
  try {
    const { memberName, email, phone, active } = req.body;
    if (!memberName) return res.status(400).json({ message: 'Member name is required' });

    // Check if member exists
    const exists = await Member.findOne({ memberName });
    if (exists) return res.status(400).json({ message: 'Member already exists' });

    const member = new Member({
      memberName,
      email: email || '',
      phone: phone || '',
      active: active !== undefined ? active : true
    });

    await member.save();
    res.status(201).json({ message: 'Member added successfully', data: member });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit member by _id
router.put('/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { memberName, email, phone, active } = req.body;

    const member = await Member.findByIdAndUpdate(
      id,
      { memberName, email, phone, active },
      { new: true }
    );

    if (!member) return res.status(404).json({ message: 'Member not found' });
    res.json({ message: 'Member updated successfully', data: member });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete member by _id
router.delete('/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findByIdAndDelete(id);
    if (!member) return res.status(404).json({ message: 'Member not found' });

    await Contribution.deleteMany({ memberName: member.memberName }); // delete contributions too
    res.json({ message: 'Member and contributions deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ---------------- CONTRIBUTIONS ROUTES ----------------

// Add a contribution
router.post('/contributions', async (req, res) => {
  try {
    const { memberName, month, year } = req.body;

    // Check if member exists
    const memberData = await Member.findOne({ memberName });
    if (!memberData) return res.status(400).json({ message: `Member "${memberName}" not found. Please add in Members first.` });

    // Check if contribution already exists
    const existing = await Contribution.findOne({ memberName, month, year });
    if (existing) return res.status(400).json({ message: `Contribution for ${memberName} in ${month}/${year} already exists.` });

    const contribution = new Contribution({
      ...req.body,
      email: memberData.email,
      phone: memberData.phone,
      active: memberData.active
    });

    await contribution.save();
    res.json({ success: true, message: 'Contribution added successfully', data: contribution });
  } catch (err) {
    console.error('Error adding contribution:', err);
    res.status(500).json({ success: false, message: 'Failed to add contribution' });
  }
});

// Edit a contribution
router.put('/contributions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contribution = await Contribution.findByIdAndUpdate(id, req.body, { new: true });
    if (!contribution) return res.status(404).json({ success: false, message: 'Contribution not found' });
    res.json({ success: true, message: 'Contribution updated successfully', data: contribution });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update contribution' });
  }
});

// Delete a contribution
router.delete('/contributions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contribution = await Contribution.findByIdAndDelete(id);
    if (!contribution) return res.status(404).json({ success: false, message: 'Contribution not found' });
    res.json({ success: true, message: 'Contribution deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete contribution' });
  }
});

// ---------------- LOAN ROUTES ----------------

// Create loan
router.post("/loan/create", async (req, res) => {
  try {
    const loan = new Loan({
      ...req.body,
      amountPaid: req.body.amountPaid || 0,
      remainingDue: req.body.remainingDue || req.body.totalRepayment
    });
    await loan.save();
    res.status(201).json({ message: "Loan created successfully", data: loan });
  } catch (err) {
    console.error("Loan create error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all loans
router.get("/loan", async (req, res) => {
  try {
    const loans = await Loan.find().sort({ createdAt: -1 }).lean();
    res.json({ data: loans });
  } catch (err) {
    console.error("Fetch loans error:", err);
    res.status(500).json({ message: "Failed to fetch loans" });
  }
});

// Get single loan
router.get("/loan/:id", async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id).lean();
    res.json({ data: loan });
  } catch (err) {
    console.error("Get loan error:", err);
    res.status(500).json({ message: "Failed to get loan" });
  }
});

// Update loan (general updates)
router.put("/loan/:id", async (req, res) => {
  try {
    const updated = await Loan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: "Loan updated", data: updated });
  } catch (err) {
    console.error("Update loan error:", err);
    res.status(500).json({ message: "Error updating loan" });
  }
});

// Delete loan
router.delete("/loan/:id", async (req, res) => {
  try {
    await Loan.findByIdAndDelete(req.params.id);
    res.json({ message: "Loan deleted" });
  } catch (err) {
    console.error("Delete loan error:", err);
    res.status(500).json({ message: "Error deleting loan" });
  }
});

// Add installment / payment
router.post("/loan/installment/:id", async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const { amount, date, receiptNumber, paymentMethod, notes } = req.body;

    // Add installment
    loan.installments.push({ amount, date: date || new Date(), receiptNumber, paymentMethod, notes });

    // Update total amount paid
    loan.amountPaid += Number(amount);

    // Update remaining due
    loan.remainingDue = loan.totalRepayment - loan.amountPaid;

    // Update status if fully paid
    if (loan.remainingDue <= 0) {
      loan.remainingDue = 0;
      loan.status = "Completed";
    } else {
      loan.status = "Active";
    }

    await loan.save();
    res.json({ message: "Installment added", data: loan });
  } catch (err) {
    console.error("Add installment error:", err);
    res.status(500).json({ message: "Error adding installment" });
  }
});

module.exports = router;

