const { User } = require('../models/associations');
const { validationResult } = require('express-validator');

const AuthController = {
    // Show login form
    loginForm: (req, res) => {
        res.render('login', {
            title: 'Login - CRUD Dashboard'
        });
    },

    // Handle login
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            // Find user
            const user = await User.findOne({ where: { email } });

            if (!user) {
                req.flash('error_msg', 'Invalid email or password');
                return res.redirect('/auth/login');
            }

            // Check password
            const isMatch = await user.comparePassword(password);

            if (!isMatch) {
                req.flash('error_msg', 'Invalid email or password');
                return res.redirect('/auth/login');
            }

            // Check status
            if (user.status !== 'active') {
                req.flash('error_msg', 'Your account is ' + user.status);
                return res.redirect('/auth/login');
            }

            // Update last login
            await user.update({ last_login: new Date() });

            // Set session
            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                avatar: user.avatar
            };

            req.flash('success_msg', 'Successfully logged in');
            res.redirect('/');
        } catch (error) {
            console.error('Login error:', error);
            req.flash('error_msg', 'An error occurred during login');
            res.redirect('/auth/login');
        }
    },

    // Handle logout
    logout: (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout error:', err);
            }
            res.redirect('/auth/login');
        });
    }
};

module.exports = AuthController;
