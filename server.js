require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const connectDB = require('./backend/config/db');
const seedInitialDatabase = require('./backend/services/seedService');

// Route Imports
const authRoutes = require('./backend/routes/authRoutes');
const userRoutes = require('./backend/routes/userRoutes');
const teamRoutes = require('./backend/routes/teamRoutes');
const leadRoutes = require('./backend/routes/leadRoutes');
const admissionRoutes = require('./backend/routes/admissionRoutes');
const commissionRoutes = require('./backend/routes/commissionRoutes');
const schoolRoutes = require('./backend/routes/schoolRoutes');
const followUpRoutes = require('./backend/routes/followUpRoutes');
const reportRoutes = require('./backend/routes/reportRoutes');
const communicationRoutes = require('./backend/routes/communicationRoutes');
const aiRoutes = require('./backend/routes/aiRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB().then(async () => {
  await seedInitialDatabase();
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/followups', followUpRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/communications', communicationRoutes);
app.use('/api/ai', aiRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    system: 'Uttarakhand Boarding Schools – Enterprise Student CRM',
    database: 'MongoDB Connected',
    timestamp: new Date()
  });
});

// SPA Fallback Middleware
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error occurred.'
  });
});

app.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(`🏔️ UTTARAKHAND BOARDING SCHOOLS – ENTERPRISE STUDENT CRM`);
  console.log(`📡 Server Live at: http://localhost:${PORT}`);
  console.log(`🔐 MongoDB Database: Connected & Seeded`);
  console.log(`👥 Roles: Admin | Manager | Counsellor with Server-Enforced RBAC`);
  console.log(`============================================================\n`);
});
