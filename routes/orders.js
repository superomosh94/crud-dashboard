const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { isAuthenticated, requireRole } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation rules
const orderValidationRules = [
    body('order_number')
        .trim()
        .isLength({ min: 5, max: 50 })
        .withMessage('Order number must be between 5 and 50 characters'),

    body('customer_id')
        .isInt()
        .withMessage('Please select a valid customer'),

    body('items')
        .custom(value => {
            try {
                const items = JSON.parse(value);
                if (!Array.isArray(items) || items.length === 0) {
                    throw new Error('Order must have at least one item');
                }
                return true;
            } catch (error) {
                throw new Error('Invalid items format');
            }
        }),

    body('discount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Discount must be a positive number'),

    body('tax')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Tax must be a positive number'),

    body('payment_method')
        .isIn(['cash', 'card', 'mpesa', 'bank_transfer'])
        .withMessage('Please select a valid payment method'),

    body('shipping_address')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Shipping address must be between 10 and 500 characters')
];

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// List orders
router.get('/', requireRole(['admin', 'manager', 'user']), OrderController.list);

// Show create order form (everyone)
router.get('/create', requireRole(['admin', 'manager', 'user']), OrderController.createForm);

// Create new order (everyone)
router.post('/',
    requireRole(['admin', 'manager', 'user']),
    orderValidationRules,
    OrderController.create
);

// Show order details
router.get('/:id', requireRole(['admin', 'manager', 'user']), OrderController.show);

// Update order status (admin and manager only)
router.post('/:id/status', requireRole(['admin', 'manager']), OrderController.updateStatus);

// Cancel order (admin and manager only)
router.post('/:id/cancel', requireRole(['admin', 'manager']), OrderController.cancel);

// Generate invoice (admin, manager, and user for their own orders)
router.get('/:id/invoice', OrderController.generateInvoice);

// Get order statistics (admin and manager only)
router.get('/statistics', requireRole(['admin', 'manager']), OrderController.getStatistics);

// Export orders to CSV (admin and manager only)
router.get('/export/csv', requireRole(['admin', 'manager']), OrderController.exportCSV);

module.exports = router;
