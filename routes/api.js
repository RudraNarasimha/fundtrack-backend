const express = require('express');
const router = express.Router();
const Contribution = require('../models/Contribution');
const { stringify } = require('csv-stringify');
const Admin = require('../models/admin');
const bcrypt = require('bcrypt');


router.get('/', (req, res) => {
  res.json({ message: 'Fund Tracker API is working' });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const isMatch = await admin.validatePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    res.json({ success: true, message: 'Login successful', token: 'dummy-token' });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// GET /api/contributions?month=10&year=2025&method=All&status=All&search=Ajay
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
      .skip((page-1)*limit).limit(Number(limit))
      .lean();

    const total = await Contribution.countDocuments(query);
    res.json({ data: contributions, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/summary?month=10&year=2025
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

// GET /api/charts?year=2025&month=10
router.get('/charts', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = Number(year) || (new Date()).getFullYear();

    const match = { year: y };
    if (month) match.month = Number(month);

    // monthly totals for bar chart (group by month regardless)
    // But if month is passed, monthly data is only for that month (or empty array)
    const monthly = await Contribution.aggregate([
      { $match: { year: y } },
      { $group: { _id: "$month", total: { $sum: "$amountPaid" }, target: { $sum: "$target" }, extra: { $sum: "$extra" } } },
      { $sort: { _id: 1 } }
    ]);

    // payment method breakdown for selected year & month (if month provided)
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contributions_${month || 'all'}_${year || 'all'}.csv"`
    );

    // CSV stringify
    stringify(rows, { header: true }).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add new member
router.post('/members', async (req, res) => {
  try {
    const { memberName, email, phone, active } = req.body;

    if (!memberName) return res.status(400).json({ message: 'Member name is required' });

    // You can create a default contribution for current month/year if needed
    const contribution = new Contribution({
      memberName,
      email: email || '',
      phone: phone || '',
      active: active !== undefined ? active : true,
      target: 300,
      amountPaid: 0,
      balance: 0,
      extra: 0,
      status: 'Pending',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    });

    await contribution.save();
    res.status(201).json({ message: 'Member added successfully', data: contribution });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit member by memberName
router.put('/members/:memberName', async (req, res) => {
  try {
    const { memberName } = req.params;
    const { email, phone, active } = req.body;

    const contributions = await Contribution.updateMany(
      { memberName },
      { $set: { email, phone, active } }
    );

    res.json({ message: 'Member updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete member by memberName
router.delete('/members/:memberName', async (req, res) => {
  try {
    const { memberName } = req.params;
    await Contribution.deleteMany({ memberName });
    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a contribution
router.post('/contributions', async (req, res) => {
  try {
    const contribution = new Contribution(req.body);
    await contribution.save();
    res.json({ success: true, message: 'Contribution added successfully', data: contribution });
  } catch (err) {
    console.error(err);
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

module.exports = router;
