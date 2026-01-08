require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const moment = require('moment');
const expressLayouts = require('express-ejs-layouts');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Logging
app.use(morgan('dev'));
app.use(compression()); // Added compression middleware here as per instruction

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
}));
// app.use(compression()); // Original compression middleware removed as per instruction to move it

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Database connection
const sequelize = require('./config/database');

// Test DB Connection
sequelize.authenticate()
    .then(() => console.log('✅ Database connected'))
    .catch(err => console.error('❌ Database error:', err));

// Sync models
const { sequelize: db } = require('./models/associations');
db.sync({ alter: process.env.NODE_ENV === 'development' })
    .then(() => console.log('✅ Models synced'))
    .catch(err => console.error('❌ Sync error:', err));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key_here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Flash messages
app.use(flash());

// Global variables middleware
app.use((req, res, next) => {
    res.locals.moment = moment;
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    res.locals.currentUrl = req.url;
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
});

// Pass moment to app locals for use in controllers (e.g. UserController)
app.locals.moment = moment;

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout'); // Use layout.ejs as the default layout

// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));
app.use('/products', require('./routes/products'));
app.use('/orders', require('./routes/orders'));
app.use('/auth', require('./routes/auth'));

// 404 handler
app.use((req, res) => {
    res.status(404).render('error/404', {
        title: 'Page Not Found',
        user: req.session.user
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error/500', {
        title: 'Server Error',
        user: req.session.user,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
