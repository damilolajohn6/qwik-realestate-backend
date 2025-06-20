const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const setupSwagger = require('./swagger/swagger');

dotenv.config();
const app = express();


// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
});
app.use(limiter);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Routes
const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/property');
const adminRoutes = require('./routes/admin');

app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Welcome to the Real Estate API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/admin', adminRoutes);

// Swagger documentation
setupSwagger(app);

// Centralized error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

module.exports = app;