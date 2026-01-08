const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const { isAuthenticated, requireRole, canEditUser } = require('../middleware/auth');
const { uploadAvatar, handleUploadError } = require('../middleware/upload');
const { body, validationResult } = require('express-validator');

// Validation rules
const userValidationRules = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),

    body('password')
        .optional()
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/\d/)
        .withMessage('Password must contain at least one number'),

    body('full_name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),

    body('phone')
        .optional()
        .trim()
        .isLength({ max: 20 })
        .withMessage('Phone number too long'),

    body('role')
        .isIn(['admin', 'manager', 'user'])
        .withMessage('Invalid role selected')
];

const updateUserValidationRules = [
    body('full_name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),

    body('phone')
        .optional()
        .trim()
        .isLength({ max: 20 })
        .withMessage('Phone number too long'),

    body('role')
        .isIn(['admin', 'manager', 'user'])
        .withMessage('Invalid role selected'),

    body('status')
        .isIn(['active', 'inactive', 'suspended'])
        .withMessage('Invalid status selected')
];

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// List users (admin and manager only)
router.get('/', requireRole(['admin', 'manager']), UserController.list);

// Show create user form (admin only)
router.get('/create', requireRole(['admin']), UserController.createForm);

// Create new user (admin only)
router.post('/',
    requireRole(['admin']),
    uploadAvatar.single('avatar'),
    handleUploadError,
    userValidationRules,
    UserController.create
);

// Show user details
router.get('/:id', requireRole(['admin', 'manager']), UserController.show);

// Show edit form (admin or own profile)
router.get('/:id/edit', canEditUser, UserController.editForm);

// Update user
router.put('/:id',
    canEditUser,
    uploadAvatar.single('avatar'),
    handleUploadError,
    updateUserValidationRules,
    UserController.update
);

// Delete user (admin only)
router.delete('/:id', requireRole(['admin']), UserController.delete);

// Change password
router.post('/:id/change-password',
    canEditUser,
    [
        body('new_password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters')
            .matches(/\d/)
            .withMessage('Password must contain at least one number')
    ],
    UserController.changePassword
);

// Export users to CSV (admin and manager only)
router.get('/export/csv', requireRole(['admin', 'manager']), UserController.exportCSV);

module.exports = router;
