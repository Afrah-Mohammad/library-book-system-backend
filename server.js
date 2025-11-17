require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const BookRequest = require('./models/BookRequest');
const { authMiddleware, requireRole } = require('./middleware/auth');

const app = express();

// --- Middleware ---
app.use(express.json());
app.use(
  cors({
    origin: "*",
  })
);


// --- DB connection ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err.message));

// --- Helper: generate token ---
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// --- Routes ---

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Library Book Request API up and running' });
});

// Register (student by default, admin you can create manually or via DB)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: role === 'admin' ? 'admin' : 'student' // be careful in production
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash');
  res.json(user);
});

// Create book request (student)
app.post('/api/requests', authMiddleware, async (req, res) => {
  try {
    const { title, author, isbn, notes } = req.body;
    if (!title || !author) {
      return res.status(400).json({ message: 'Title and author are required' });
    }

    const request = await BookRequest.create({
      title,
      author,
      isbn,
      notes,
      requestedBy: req.user.id
    });

    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get requests (students: only theirs; admin: all)
app.get('/api/requests', authMiddleware, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'student') {
      filter.requestedBy = req.user.id;
    }
    const requests = await BookRequest.find(filter)
      .populate('requestedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update request status (admin only)
app.patch(
  '/api/requests/:id/status',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }

      const request = await BookRequest.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );

      if (!request) {
        return res.status(404).json({ message: 'Request not found' });
      }

      res.json(request);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
