const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { isNotAuthenticated, isAuthenticated } = require('../middleware/auth');
const { body } = require('express-validator');

// Validation
const loginValidation = [
    body('email').isEmail().withMessage('Enter a valid email'),
    body('password').notEmpty().withMessage('Password is required')
];

// Login Page
router.get('/login', isNotAuthenticated, AuthController.loginForm);

// Handle Login
router.post('/login', isNotAuthenticated, loginValidation, AuthController.login);

// Handle Logout
router.get('/logout', isAuthenticated, AuthController.logout);

module.exports = router;
