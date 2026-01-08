const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { isAuthenticated, requireRole } = require('../middleware/auth');
const { uploadProduct, handleUploadError } = require('../middleware/upload');
const { body, validationResult } = require('express-validator');

// Validation rules
const productValidationRules = [
    body('name')
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage('Product name must be between 3 and 200 characters'),

    body('sku')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('SKU must be maximum 50 characters'),

    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),

    body('cost_price')
        .isFloat({ min: 0 })
        .withMessage('Cost price must be a positive number'),

    body('quantity')
        .isInt({ min: 0 })
        .withMessage('Quantity must be a positive integer'),

    body('category_id')
        .isInt()
        .withMessage('Please select a valid category'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description too long')
];

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// List products
router.get('/', requireRole(['admin', 'manager', 'user']), ProductController.list);

// Show create product form (admin and manager only)
router.get('/create', requireRole(['admin', 'manager']), ProductController.createForm);

// Create new product (admin and manager only)
router.post('/',
    requireRole(['admin', 'manager']),
    uploadProduct.single('image'),
    handleUploadError,
    productValidationRules,
    ProductController.create
);

// Show product details
router.get('/:id', requireRole(['admin', 'manager', 'user']), ProductController.show);

// Show edit form (admin and manager only)
router.get('/:id/edit', requireRole(['admin', 'manager']), ProductController.editForm);

// Update product (admin and manager only)
router.put('/:id',
    requireRole(['admin', 'manager']),
    uploadProduct.single('image'),
    handleUploadError,
    productValidationRules,
    ProductController.update
);

// Delete product (admin only)
router.delete('/:id', requireRole(['admin']), ProductController.delete);

// Update stock (admin and manager only)
router.post('/:id/stock', requireRole(['admin', 'manager']), ProductController.updateStock);

// Export products to CSV (admin and manager only)
router.get('/export/csv', requireRole(['admin', 'manager']), ProductController.exportCSV);

// Get low stock products (admin and manager only)
router.get('/low-stock', requireRole(['admin', 'manager']), ProductController.getLowStock);

module.exports = router;
