const express = require('express');
const router = express.Router();
const { isAuthenticated, requireRole } = require('../middleware/auth');
const { User, Product, Order, Category, OrderItem, sequelize } = require('../models/associations');
const { Op } = require('sequelize');

// Dashboard
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        if (userRole === 'admin' || userRole === 'manager') {
            // Admin/Manager View - Full business statistics
            const [
                totalUsers,
                totalProducts,
                totalOrders,
                totalRevenue,
                recentOrders,
                lowStockProducts,
                recentUsers,
                monthlySales,
                topProducts
            ] = await Promise.all([
                User.count(),
                Product.count(),
                Order.count(),
                Order.sum('grand_total', {
                    where: { status: 'completed', payment_status: 'paid' }
                }),
                Order.findAll({
                    include: [{
                        model: User,
                        as: 'customer',
                        attributes: ['full_name', 'email', 'avatar']
                    }],
                    limit: 5,
                    order: [['created_at', 'DESC']]
                }),
                Product.findAll({
                    where: {
                        quantity: { [Op.lte]: 10 },
                        status: 'active'
                    },
                    include: [{
                        model: Category,
                        as: 'category',
                        attributes: ['name']
                    }],
                    limit: 5,
                    order: [['quantity', 'ASC']]
                }),
                User.findAll({
                    attributes: ['id', 'username', 'full_name', 'email', 'role', 'created_at'],
                    limit: 5,
                    order: [['created_at', 'DESC']]
                }),
                Order.findAll({
                    attributes: [
                        [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
                        [sequelize.fn('SUM', sequelize.col('grand_total')), 'total']
                    ],
                    where: {
                        status: 'completed',
                        payment_status: 'paid',
                        created_at: {
                            [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 6))
                        }
                    },
                    group: [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m')],
                    order: [[sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'ASC']]
                }),
                Product.findAll({
                    attributes: [
                        'id', 'name', 'sku', 'price', 'quantity',
                        [sequelize.fn('SUM', sequelize.col('orderItems.quantity')), 'totalSold']
                    ],
                    include: [{
                        model: OrderItem,
                        as: 'orderItems',
                        attributes: []
                    }],
                    group: ['Product.id'],
                    order: [[sequelize.fn('SUM', sequelize.col('orderItems.quantity')), 'DESC']],
                    limit: 5,
                    subQuery: false
                })
            ]);

            return res.render('dashboard', {
                title: 'Business Dashboard',
                user: req.session.user,
                stats: {
                    totalUsers,
                    totalProducts,
                    totalOrders,
                    totalRevenue: totalRevenue || 0,
                    avgOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0
                },
                recentOrders,
                lowStockProducts,
                recentUsers,
                monthlySales: monthlySales.map(item => ({
                    month: item.get('month'),
                    total: parseFloat(item.get('total') || 0)
                })),
                topProducts
            });
        } else {
            // Normal User View - Personal statistics
            const [
                myTotalOrders,
                myTotalSpent,
                myRecentOrders
            ] = await Promise.all([
                Order.count({ where: { customer_id: userId } }),
                Order.sum('grand_total', {
                    where: {
                        customer_id: userId,
                        payment_status: 'paid'
                    }
                }),
                Order.findAll({
                    where: { customer_id: userId },
                    limit: 5,
                    order: [['created_at', 'DESC']]
                })
            ]);

            return res.render('user-dashboard', {
                title: 'My Dashboard',
                user: req.session.user,
                stats: {
                    totalOrders: myTotalOrders,
                    totalSpent: myTotalSpent || 0
                },
                recentOrders: myRecentOrders
            });
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        req.flash('error_msg', 'Error loading dashboard');
        res.redirect('/');
    }
});

// Home page
router.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('index', {
        title: 'CRUD Dashboard - Home',
        user: req.session.user
    });
});

// Profile page
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findByPk(req.session.user.id, {
            attributes: { exclude: ['password'] }
        });

        res.render('profile', {
            title: 'My Profile',
            user
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        req.flash('error_msg', 'Error loading profile');
        res.redirect('/dashboard');
    }
});

// Update profile
router.post('/profile', isAuthenticated, async (req, res) => {
    try {
        const { full_name, phone } = req.body;
        const user = await User.findByPk(req.session.user.id);

        await user.update({
            full_name,
            phone
        });

        // Update session
        req.session.user.full_name = full_name;

        req.flash('success_msg', 'Profile updated successfully');
        res.redirect('/profile');
    } catch (error) {
        console.error('Error updating profile:', error);
        req.flash('error_msg', 'Error updating profile');
        res.redirect('/profile');
    }
});

// Settings page (admin only)
router.get('/settings', isAuthenticated, requireRole(['admin']), (req, res) => {
    res.render('settings', {
        title: 'System Settings',
        user: req.session.user
    });
});

// API for dashboard stats
router.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // Today's stats
        const todayOrders = await Order.count({
            where: { created_at: { [Op.gte]: startOfDay } }
        });

        const todayRevenue = await Order.sum('grand_total', {
            where: {
                created_at: { [Op.gte]: startOfDay },
                status: 'completed',
                payment_status: 'paid'
            }
        });

        // This week's stats
        const weekOrders = await Order.count({
            where: { created_at: { [Op.gte]: startOfWeek } }
        });

        const weekRevenue = await Order.sum('grand_total', {
            where: {
                created_at: { [Op.gte]: startOfWeek },
                status: 'completed',
                payment_status: 'paid'
            }
        });

        // This month's stats
        const monthOrders = await Order.count({
            where: { created_at: { [Op.gte]: startOfMonth } }
        });

        const monthRevenue = await Order.sum('grand_total', {
            where: {
                created_at: { [Op.gte]: startOfMonth },
                status: 'completed',
                payment_status: 'paid'
            }
        });

        // Active users
        const activeUsers = await User.count({
            where: { status: 'active' }
        });

        // Low stock products count
        const lowStockCount = await Product.count({
            where: {
                quantity: { [Op.lte]: 10 },
                status: 'active'
            }
        });

        res.json({
            success: true,
            stats: {
                today: {
                    orders: todayOrders,
                    revenue: todayRevenue || 0
                },
                week: {
                    orders: weekOrders,
                    revenue: weekRevenue || 0
                },
                month: {
                    orders: monthOrders,
                    revenue: monthRevenue || 0
                },
                activeUsers,
                lowStockCount
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics' });
    }
});

module.exports = router;
