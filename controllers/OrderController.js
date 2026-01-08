const { Order, OrderItem, Product, User, sequelize } = require('../models/associations');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const crypto = require('crypto');

const OrderController = {
    // List all orders
    list: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const status = req.query.status || '';
            const payment_status = req.query.payment_status || '';
            const start_date = req.query.start_date || '';
            const end_date = req.query.end_date || '';

            let where = {};
            if (search) {
                where[Op.or] = [
                    { order_number: { [Op.like]: `%${search}%` } },
                    { '$customer.full_name$': { [Op.like]: `%${search}%` } },
                    { '$customer.email$': { [Op.like]: `%${search}%` } }
                ];
            }
            if (status) where.status = status;
            if (payment_status) where.payment_status = payment_status;

            // Date range filter
            if (start_date || end_date) {
                where.created_at = {};
                if (start_date) where.created_at[Op.gte] = new Date(start_date);
                if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59');
            }

            const [
                { count, rows: orders },
                totalRevenue,
                pendingOrders
            ] = await Promise.all([
                Order.findAndCountAll({
                    where,
                    include: [{
                        model: User,
                        as: 'customer',
                        attributes: ['id', 'full_name', 'email', 'phone']
                    }],
                    limit,
                    offset,
                    order: [['created_at', 'DESC']]
                }),
                Order.sum('grand_total', {
                    where: { status: 'completed', payment_status: 'paid' }
                }),
                Order.count({
                    where: { status: 'pending' }
                })
            ]);

            const totalPages = Math.ceil(count / limit);

            res.render('orders/list', {
                title: 'Order Management',
                orders,
                currentPage: page,
                totalPages,
                totalOrders: count,
                totalRevenue: totalRevenue || 0,
                pendingOrders,
                search,
                status,
                payment_status,
                start_date,
                end_date,
                statusOptions: ['pending', 'processing', 'completed', 'cancelled', 'refunded'],
                paymentStatusOptions: ['pending', 'paid', 'failed', 'refunded'],
                paymentMethods: ['cash', 'card', 'mpesa', 'bank_transfer']
            });
        } catch (error) {
            console.error('Error fetching orders:', error);
            req.flash('error_msg', 'Error fetching orders');
            res.redirect('/dashboard');
        }
    },

    // Show create order form
    createForm: async (req, res) => {
        try {
            const userRole = req.session.user.role;
            const userId = req.session.user.id;

            const [customers, products] = await Promise.all([
                userRole === 'user'
                    ? User.findAll({ where: { id: userId }, attributes: ['id', 'full_name', 'email', 'phone'] })
                    : User.findAll({
                        where: { status: 'active' },
                        attributes: ['id', 'full_name', 'email', 'phone'],
                        order: [['full_name', 'ASC']]
                    }),
                Product.findAll({
                    where: {
                        status: 'active',
                        quantity: { [Op.gt]: 0 }
                    },
                    attributes: ['id', 'name', 'sku', 'price', 'quantity'],
                    order: [['name', 'ASC']]
                })
            ]);

            // Generate order number
            const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            // Check if a specific product was requested (Purchase Now flow)
            const preSelectedProductId = req.query.product_id;

            res.render('orders/create', {
                title: 'Create New Order',
                orderNumber,
                customers,
                products,
                preSelectedProductId: preSelectedProductId || null
            });
        } catch (error) {
            console.error('Error loading create order form:', error);
            req.flash('error_msg', 'Error loading order form');
            res.redirect('/orders');
        }
    },

    // Create new order
    create: async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Re-fetch data for the form in case of errors
            const userRole = req.session.user.role;
            const userId = req.session.user.id;
            const [customers, products] = await Promise.all([
                userRole === 'user'
                    ? User.findAll({ where: { id: userId }, attributes: ['id', 'full_name', 'email', 'phone'] })
                    : User.findAll({ where: { status: 'active' }, attributes: ['id', 'full_name', 'email', 'phone'] }),
                Product.findAll({ where: { status: 'active', quantity: { [Op.gt]: 0 } } })
            ]);

            return res.render('orders/create', {
                title: 'Create New Order',
                errors: errors.array(),
                formData: req.body,
                orderNumber: req.body.order_number,
                customers,
                products,
                preSelectedProductId: null
            });
        }

        const transaction = await sequelize.transaction();

        try {
            let { order_number, customer_id, items, tax, discount, payment_method, shipping_address, notes } = req.body;

            // Enforce customer_id for 'user' role
            if (req.session.user.role === 'user') {
                customer_id = req.session.user.id;
            }

            // Parse items JSON
            const orderItems = JSON.parse(items);

            // Fetch all required products at once
            const productIds = orderItems.map(item => item.product_id);
            const products = await Product.findAll({
                where: { id: { [Op.in]: productIds } },
                transaction
            });

            const productMap = products.reduce((map, p) => {
                map[p.id] = p;
                return map;
            }, {});

            // Calculate totals and validate stock
            let subtotal = 0;
            for (const item of orderItems) {
                const product = productMap[item.product_id];
                if (!product) {
                    await transaction.rollback();
                    req.flash('error_msg', `Product not found: ${item.product_id}`);
                    return res.redirect('/orders/create');
                }

                if (product.quantity < item.quantity) {
                    await transaction.rollback();
                    req.flash('error_msg', `Insufficient stock for ${product.name}. Available: ${product.quantity}`);
                    return res.redirect('/orders/create');
                }

                subtotal += product.price * item.quantity;
            }

            const discountVal = parseFloat(discount) || 0;
            const taxVal = parseFloat(tax) || 0;
            const grand_total = subtotal - discountVal + taxVal;

            // Create order
            const order = await Order.create({
                order_number,
                customer_id: parseInt(customer_id),
                total_amount: subtotal,
                discount: discountVal,
                tax: taxVal,
                grand_total,
                status: 'pending',
                payment_method,
                payment_status: 'pending',
                shipping_address,
                notes
            }, { transaction });

            // Create order items and update product quantities
            for (const item of orderItems) {
                const product = await Product.findByPk(item.product_id, { transaction });

                await OrderItem.create({
                    order_id: order.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: product.price,
                    subtotal: product.price * item.quantity
                }, { transaction });

                // Update product quantity
                await product.decrement('quantity', {
                    by: item.quantity,
                    transaction
                });
            }

            await transaction.commit();

            req.flash('success_msg', 'Order created successfully');
            res.redirect(`/orders/${order.id}`);
        } catch (error) {
            if (transaction) await transaction.rollback();
            console.error('Error creating order:', error);
            req.flash('error_msg', 'Error creating order');
            res.redirect('/orders/create');
        }
    },

    // Show order details
    show: async (req, res) => {
        try {
            const order = await Order.findByPk(req.params.id, {
                include: [
                    {
                        model: User,
                        as: 'customer',
                        attributes: ['id', 'full_name', 'email', 'phone', 'avatar']
                    },
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'image']
                        }]
                    }
                ]
            });

            if (!order) {
                req.flash('error_msg', 'Order not found');
                return res.redirect('/orders');
            }

            res.render('orders/view', {
                title: 'Order Details',
                order
            });
        } catch (error) {
            console.error('Error fetching order:', error);
            req.flash('error_msg', 'Error fetching order details');
            res.redirect('/orders');
        }
    },

    // Update order status
    updateStatus: async (req, res) => {
        try {
            const { status, payment_status } = req.body;
            const order = await Order.findByPk(req.params.id);

            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            const updates = {};
            if (status) updates.status = status;
            if (payment_status) updates.payment_status = payment_status;

            await order.update(updates);

            res.json({
                success: true,
                message: 'Order updated successfully',
                order: order.toJSON()
            });
        } catch (error) {
            console.error('Error updating order:', error);
            res.status(500).json({ success: false, message: 'Error updating order' });
        }
    },

    // Cancel order
    cancel: async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const order = await Order.findByPk(req.params.id, {
                include: [{
                    model: OrderItem,
                    as: 'items'
                }],
                transaction
            });

            if (!order) {
                await transaction.rollback();
                req.flash('error_msg', 'Order not found');
                return res.redirect('/orders');
            }

            if (order.status === 'cancelled') {
                await transaction.rollback();
                req.flash('error_msg', 'Order is already cancelled');
                return res.redirect('/orders');
            }

            // Return stock to products
            for (const item of order.items) {
                const product = await Product.findByPk(item.product_id, { transaction });
                if (product) {
                    await product.increment('quantity', {
                        by: item.quantity,
                        transaction
                    });
                }
            }

            // Update order status
            await order.update({
                status: 'cancelled',
                payment_status: order.payment_status === 'paid' ? 'refunded' : 'failed'
            }, { transaction });

            await transaction.commit();

            req.flash('success_msg', 'Order cancelled successfully');
            res.redirect('/orders');
        } catch (error) {
            if (transaction) await transaction.rollback();
            console.error('Error cancelling order:', error);
            req.flash('error_msg', 'Error cancelling order');
            res.redirect('/orders');
        }
    },

    // Generate invoice
    generateInvoice: async (req, res) => {
        try {
            const order = await Order.findByPk(req.params.id, {
                include: [
                    {
                        model: User,
                        as: 'customer',
                        attributes: ['full_name', 'email', 'phone']
                    },
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{
                            model: Product,
                            as: 'product',
                            attributes: ['name', 'sku']
                        }]
                    }
                ]
            });

            if (!order) {
                req.flash('error_msg', 'Order not found');
                return res.redirect('/orders');
            }

            res.render('orders/invoice', {
                title: `Invoice - ${order.order_number}`,
                order,
                company: {
                    name: 'Nairobi Tech Solutions',
                    address: 'Nairobi, Kenya',
                    phone: '+254 7XX XXX XXX',
                    email: 'billing@nairobitech.co.ke',
                    vat: 'VAT123456'
                }
            });
        } catch (error) {
            console.error('Error generating invoice:', error);
            req.flash('error_msg', 'Error generating invoice');
            res.redirect('/orders');
        }
    },

    // Get order statistics
    getStatistics: async (req, res) => {
        try {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());

            // Today's orders
            const todayOrders = await Order.findAll({
                where: {
                    created_at: {
                        [Op.gte]: new Date(today.setHours(0, 0, 0, 0))
                    }
                }
            });

            // This week's revenue
            const weeklyRevenue = await Order.sum('grand_total', {
                where: {
                    created_at: { [Op.gte]: startOfWeek },
                    status: 'completed',
                    payment_status: 'paid'
                }
            });

            // This month's revenue
            const monthlyRevenue = await Order.sum('grand_total', {
                where: {
                    created_at: { [Op.gte]: startOfMonth },
                    status: 'completed',
                    payment_status: 'paid'
                }
            });

            // Total orders
            const totalOrders = await Order.count();

            // Order status counts
            const statusCounts = await Order.findAll({
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                group: ['status']
            });

            // Monthly sales data for chart
            const monthlySales = await Order.findAll({
                attributes: [
                    [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
                    [sequelize.fn('SUM', sequelize.col('grand_total')), 'total']
                ],
                where: {
                    status: 'completed',
                    payment_status: 'paid',
                    created_at: {
                        [Op.gte]: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
                    }
                },
                group: [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m')],
                order: [[sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'ASC']]
            });

            res.json({
                success: true,
                statistics: {
                    todayOrders: todayOrders.length,
                    weeklyRevenue: weeklyRevenue || 0,
                    monthlyRevenue: monthlyRevenue || 0,
                    totalOrders,
                    statusCounts,
                    monthlySales
                }
            });
        } catch (error) {
            console.error('Error fetching statistics:', error);
            res.status(500).json({ success: false, message: 'Error fetching statistics' });
        }
    },

    // Export orders to CSV
    exportCSV: async (req, res) => {
        try {
            const orders = await Order.findAll({
                include: [{
                    model: User,
                    as: 'customer',
                    attributes: ['full_name', 'email']
                }],
                order: [['created_at', 'DESC']]
            });

            // Create CSV content
            let csv = 'Order Number,Customer,Total Amount (KSh),Discount (KSh),Tax (KSh),Grand Total (KSh),Status,Payment Status,Payment Method,Created At\n';
            orders.forEach(order => {
                csv += `${order.order_number},${order.customer.full_name},${order.total_amount},${order.discount},${order.tax},${order.grand_total},${order.status},${order.payment_status},${order.payment_method},${req.app.locals.moment(order.created_at).format('YYYY-MM-DD HH:mm:ss')}\n`;
            });

            res.header('Content-Type', 'text/csv');
            res.attachment('orders.csv');
            res.send(csv);
        } catch (error) {
            console.error('Error exporting orders:', error);
            req.flash('error_msg', 'Error exporting orders');
            res.redirect('/orders');
        }
    }
};

module.exports = OrderController;
