// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    req.flash('error_msg', 'Please login to access this page');
    res.redirect('/auth/login');
};

const isNotAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return next();
    }
    res.redirect('/dashboard');
};

// Role-based access control
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            req.flash('error_msg', 'Please login to access this page');
            return res.redirect('/auth/login');
        }

        if (!roles.includes(req.session.user.role)) {
            req.flash('error_msg', 'You do not have permission to access this page');
            return res.redirect('/');
        }

        next();
    };
};

// Check if user can edit/delete their own data
const canEditUser = (req, res, next) => {
    const userId = parseInt(req.params.id);

    if (req.session.user.role === 'admin') {
        return next();
    }

    if (userId === req.session.user.id) {
        return next();
    }

    req.flash('error_msg', 'You can only edit your own profile');
    res.redirect('/dashboard');
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    requireRole,
    canEditUser
};
