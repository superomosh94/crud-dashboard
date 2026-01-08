const { User } = require('../models/associations');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

const UserController = {
    // List all users
    list: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const role = req.query.role || '';
            const status = req.query.status || '';

            let where = {};
            if (search) {
                where = {
                    [Sequelize.Op.or]: [
                        { username: { [Sequelize.Op.like]: `%${search}%` } },
                        { email: { [Sequelize.Op.like]: `%${search}%` } },
                        { full_name: { [Sequelize.Op.like]: `%${search}%` } }
                    ]
                };
            }
            if (role) where.role = role;
            if (status) where.status = status;

            const { count, rows: users } = await User.findAndCountAll({
                where,
                limit,
                offset,
                order: [['created_at', 'DESC']],
                attributes: { exclude: ['password'] }
            });

            const totalPages = Math.ceil(count / limit);

            res.render('users/list', {
                title: 'User Management',
                users,
                currentPage: page,
                totalPages,
                totalUsers: count,
                search,
                role,
                status,
                moment: req.app.locals.moment
            });
        } catch (error) {
            console.error('Error fetching users:', error);
            req.flash('error_msg', 'Error fetching users');
            res.redirect('/dashboard');
        }
    },

    // Show create user form
    createForm: (req, res) => {
        res.render('users/create', {
            title: 'Create New User'
        });
    },

    // Create new user
    create: async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('users/create', {
                title: 'Create New User',
                errors: errors.array(),
                formData: req.body
            });
        }

        try {
            const { username, email, password, full_name, phone, role } = req.body;

            // Check if user exists
            const existingUser = await User.findOne({
                where: {
                    [Sequelize.Op.or]: [{ email }, { username }]
                }
            });

            if (existingUser) {
                req.flash('error_msg', 'User with this email or username already exists');
                return res.redirect('/users/create');
            }

            // Handle avatar upload
            let avatar = null;
            if (req.file) {
                avatar = `/uploads/avatars/${req.file.filename}`;
            }

            // Create user
            const user = await User.create({
                username,
                email,
                password,
                full_name,
                phone,
                role,
                avatar,
                status: 'active'
            });

            req.flash('success_msg', 'User created successfully');
            res.redirect('/users');
        } catch (error) {
            console.error('Error creating user:', error);
            req.flash('error_msg', 'Error creating user');
            res.redirect('/users/create');
        }
    },

    // Show user details
    show: async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id, {
                attributes: { exclude: ['password'] }
            });

            if (!user) {
                req.flash('error_msg', 'User not found');
                return res.redirect('/users');
            }

            res.render('users/view', {
                title: 'User Details',
                user
            });
        } catch (error) {
            console.error('Error fetching user:', error);
            req.flash('error_msg', 'Error fetching user details');
            res.redirect('/users');
        }
    },

    // Show edit form
    editForm: async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id, {
                attributes: { exclude: ['password'] }
            });

            if (!user) {
                req.flash('error_msg', 'User not found');
                return res.redirect('/users');
            }

            res.render('users/edit', {
                title: 'Edit User',
                userDetail: user,
                roles: ['admin', 'manager', 'user'],
                statuses: ['active', 'inactive', 'suspended']
            });
        } catch (error) {
            console.error('Error fetching user:', error);
            req.flash('error_msg', 'Error fetching user');
            res.redirect('/users');
        }
    },

    // Update user
    update: async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const user = await User.findByPk(req.params.id, {
                attributes: { exclude: ['password'] }
            });
            return res.render('users/edit', {
                title: 'Edit User',
                errors: errors.array(),
                userDetail: { ...user.toJSON(), ...req.body },
                roles: ['admin', 'manager', 'user'],
                statuses: ['active', 'inactive', 'suspended']
            });
        }

        try {
            const { full_name, phone, role, status } = req.body;
            const user = await User.findByPk(req.params.id);

            if (!user) {
                req.flash('error_msg', 'User not found');
                return res.redirect('/users');
            }

            // Handle avatar upload
            if (req.file) {
                // Delete old avatar if exists
                if (user.avatar) {
                    const oldAvatarPath = path.join(__dirname, '..', 'public', user.avatar);
                    if (fs.existsSync(oldAvatarPath)) {
                        fs.unlinkSync(oldAvatarPath);
                    }
                }
                user.avatar = `/uploads/avatars/${req.file.filename}`;
            }

            // Update user
            await user.update({
                full_name,
                phone,
                role,
                status
            });

            req.flash('success_msg', 'User updated successfully');
            res.redirect('/users');
        } catch (error) {
            console.error('Error updating user:', error);
            req.flash('error_msg', 'Error updating user');
            res.redirect(`/users/${req.params.id}/edit`);
        }
    },

    // Delete user
    delete: async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id);

            if (!user) {
                req.flash('error_msg', 'User not found');
                return res.redirect('/users');
            }

            // Prevent deleting yourself
            if (user.id === req.session.user.id) {
                req.flash('error_msg', 'You cannot delete your own account');
                return res.redirect('/users');
            }

            // Delete avatar if exists
            if (user.avatar) {
                const avatarPath = path.join(__dirname, '..', 'public', user.avatar);
                if (fs.existsSync(avatarPath)) {
                    fs.unlinkSync(avatarPath);
                }
            }

            await user.destroy();

            req.flash('success_msg', 'User deleted successfully');
            res.redirect('/users');
        } catch (error) {
            console.error('Error deleting user:', error);
            req.flash('error_msg', 'Error deleting user');
            res.redirect('/users');
        }
    },

    // Change password
    changePassword: async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', errors.array()[0].msg);
            return res.redirect(`/users/${req.params.id}/edit`);
        }

        try {
            const { new_password } = req.body;
            const user = await User.findByPk(req.params.id);

            if (!user) {
                req.flash('error_msg', 'User not found');
                return res.redirect('/users');
            }

            user.password = new_password;
            await user.save();

            req.flash('success_msg', 'Password changed successfully');
            res.redirect(`/users/${req.params.id}/edit`);
        } catch (error) {
            console.error('Error changing password:', error);
            req.flash('error_msg', 'Error changing password');
            res.redirect(`/users/${req.params.id}/edit`);
        }
    },

    // Export users to CSV
    exportCSV: async (req, res) => {
        try {
            const users = await User.findAll({
                attributes: ['id', 'username', 'email', 'full_name', 'phone', 'role', 'status', 'created_at'],
                order: [['created_at', 'DESC']]
            });

            // Create CSV content
            let csv = 'ID,Username,Email,Full Name,Phone,Role,Status,Created At\n';
            users.forEach(user => {
                csv += `${user.id},${user.username},${user.email},${user.full_name},${user.phone || ''},${user.role},${user.status},${req.app.locals.moment(user.created_at).format('YYYY-MM-DD HH:mm:ss')}\n`;
            });

            res.header('Content-Type', 'text/csv');
            res.attachment('users.csv');
            res.send(csv);
        } catch (error) {
            console.error('Error exporting users:', error);
            req.flash('error_msg', 'Error exporting users');
            res.redirect('/users');
        }
    }
};

module.exports = UserController;
