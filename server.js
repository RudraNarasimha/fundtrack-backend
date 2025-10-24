require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const router = express.Router();
const apiRouter = require('./routes/api');

const apiRoutes = require('./routes/api');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/api', apiRouter);

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(()=> {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('Mongo connection error', err);
});

app.use('/api', apiRoutes);

app.get('/', (req,res) => res.send('Fund Tracker backend running'));

app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
