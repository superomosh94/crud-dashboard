const { Product, Category } = require('../models/associations');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const ProductController = {
    // List all products
    list: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 12;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const category_id = req.query.category_id || '';
            const status = req.query.status || '';
            const min_price = parseFloat(req.query.min_price) || '';
            const max_price = parseFloat(req.query.max_price) || '';

            let where = {};
            if (search) {
                where[Op.or] = [
                    { name: { [Op.like]: `%${search}%` } },
                    { sku: { [Op.like]: `%${search}%` } },
                    { description: { [Op.like]: `%${search}%` } }
                ];
            }
            if (category_id) where.category_id = category_id;
            if (status) where.status = status;
            if (min_price) where.price = { ...where.price, [Op.gte]: min_price };
            if (max_price) where.price = { ...where.price, [Op.lte]: max_price };

            const [
                { count, rows: products },
                categories
            ] = await Promise.all([
                Product.findAndCountAll({
                    where,
                    include: [{
                        model: Category,
                        as: 'category',
                        attributes: ['id', 'name']
                    }],
                    limit,
                    offset,
                    order: [['created_at', 'DESC']]
                }),
                Category.findAll({
                    where: { status: 'active' },
                    order: [['name', 'ASC']]
                })
            ]);

            const totalPages = Math.ceil(count / limit);

            res.render('products/list', {
                title: 'Product Management',
                products,
                categories,
                currentPage: page,
                totalPages,
                totalProducts: count,
                search,
                category_id,
                status,
                min_price,
                max_price,
                statusOptions: ['active', 'inactive', 'out_of_stock', 'discontinued']
            });
        } catch (error) {
            console.error('Error fetching products:', error);
            req.flash('error_msg', 'Error fetching products');
            res.redirect('/dashboard');
        }
    },

    // Show create product form
    createForm: async (req, res) => {
        try {
            const categories = await Category.findAll({
                where: { status: 'active' },
                order: [['name', 'ASC']]
            });

            res.render('products/create', {
                title: 'Add New Product',
                categories,
                statusOptions: ['active', 'inactive', 'out_of_stock', 'discontinued']
            });
        } catch (error) {
            console.error('Error fetching categories:', error);
            req.flash('error_msg', 'Error loading form');
            res.redirect('/products');
        }
    },

    // Create new product
    create: async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const categories = await Category.findAll({
                where: { status: 'active' },
                order: [['name', 'ASC']]
            });

            return res.render('products/create', {
                title: 'Add New Product',
                categories,
                statusOptions: ['active', 'inactive', 'out_of_stock', 'discontinued'],
                errors: errors.array(),
                formData: req.body
            });
        }

        try {
            const {
                name, sku, description, price, cost_price,
                quantity, category_id, status, featured
            } = req.body;

            // Check if SKU exists
            const existingProduct = await Product.findOne({ where: { sku } });
            if (existingProduct) {
                req.flash('error_msg', 'Product with this SKU already exists');
                return res.redirect('/products/create');
            }

            // Handle image upload
            let image = null;
            if (req.file) {
                image = `/uploads/products/${req.file.filename}`;
            }

            // Generate SKU if not provided
            const productSku = sku || `PROD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            // Create product
            const product = await Product.create({
                name,
                sku: productSku,
                description,
                price: parseFloat(price),
                cost_price: parseFloat(cost_price),
                quantity: parseInt(quantity),
                category_id: parseInt(category_id),
                image,
                status,
                featured: featured === 'on'
            });

            req.flash('success_msg', 'Product created successfully');
            res.redirect('/products');
        } catch (error) {
            console.error('Error creating product:', error);
            req.flash('error_msg', 'Error creating product');
            res.redirect('/products/create');
        }
    },

    // Show product details
    show: async (req, res) => {
        try {
            const product = await Product.findByPk(req.params.id, {
                include: [{
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name', 'description']
                }]
            });

            if (!product) {
                req.flash('error_msg', 'Product not found');
                return res.redirect('/products');
            }

            // Calculate profit margin
            const profit = product.price - product.cost_price;
            const margin = product.cost_price > 0 ? (profit / product.cost_price) * 100 : 0;

            res.render('products/view', {
                title: 'Product Details',
                product,
                profit: profit.toFixed(2),
                margin: margin.toFixed(2)
            });
        } catch (error) {
            console.error('Error fetching product:', error);
            req.flash('error_msg', 'Error fetching product details');
            res.redirect('/products');
        }
    },

    // Show edit form
    editForm: async (req, res) => {
        try {
            const product = await Product.findByPk(req.params.id);
            const categories = await Category.findAll({
                where: { status: 'active' },
                order: [['name', 'ASC']]
            });

            if (!product) {
                req.flash('error_msg', 'Product not found');
                return res.redirect('/products');
            }

            res.render('products/edit', {
                title: 'Edit Product',
                product,
                categories,
                statusOptions: ['active', 'inactive', 'out_of_stock', 'discontinued']
            });
        } catch (error) {
            console.error('Error fetching product:', error);
            req.flash('error_msg', 'Error fetching product');
            res.redirect('/products');
        }
    },

    // Update product
    update: async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const product = await Product.findByPk(req.params.id);
            const categories = await Category.findAll({
                where: { status: 'active' },
                order: [['name', 'ASC']]
            });

            return res.render('products/edit', {
                title: 'Edit Product',
                product,
                categories,
                statusOptions: ['active', 'inactive', 'out_of_stock', 'discontinued'],
                errors: errors.array()
            });
        }

        try {
            const {
                name, description, price, cost_price,
                quantity, category_id, status, featured
            } = req.body;

            const product = await Product.findByPk(req.params.id);

            if (!product) {
                req.flash('error_msg', 'Product not found');
                return res.redirect('/products');
            }

            // Handle image upload
            if (req.file) {
                // Delete old image if exists
                if (product.image) {
                    const oldImagePath = path.join(__dirname, '..', 'public', product.image);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
                product.image = `/uploads/products/${req.file.filename}`;
            }

            // Update product
            await product.update({
                name,
                description,
                price: parseFloat(price),
                cost_price: parseFloat(cost_price),
                quantity: parseInt(quantity),
                category_id: parseInt(category_id),
                status,
                featured: featured === 'on'
            });

            req.flash('success_msg', 'Product updated successfully');
            res.redirect('/products');
        } catch (error) {
            console.error('Error updating product:', error);
            req.flash('error_msg', 'Error updating product');
            res.redirect(`/products/${req.params.id}/edit`);
        }
    },

    // Delete product
    delete: async (req, res) => {
        try {
            const product = await Product.findByPk(req.params.id);

            if (!product) {
                req.flash('error_msg', 'Product not found');
                return res.redirect('/products');
            }

            // Delete image if exists
            if (product.image) {
                const imagePath = path.join(__dirname, '..', 'public', product.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }

            await product.destroy();

            req.flash('success_msg', 'Product deleted successfully');
            res.redirect('/products');
        } catch (error) {
            console.error('Error deleting product:', error);
            req.flash('error_msg', 'Error deleting product');
            res.redirect('/products');
        }
    },

    // Update stock quantity
    updateStock: async (req, res) => {
        try {
            const { action, quantity } = req.body;
            const product = await Product.findByPk(req.params.id);

            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            let newQuantity = product.quantity;

            if (action === 'add') {
                newQuantity += parseInt(quantity);
            } else if (action === 'subtract') {
                newQuantity -= parseInt(quantity);
                if (newQuantity < 0) newQuantity = 0;
            } else if (action === 'set') {
                newQuantity = parseInt(quantity);
            }

            await product.update({ quantity: newQuantity });

            res.json({
                success: true,
                message: 'Stock updated successfully',
                newQuantity
            });
        } catch (error) {
            console.error('Error updating stock:', error);
            res.status(500).json({ success: false, message: 'Error updating stock' });
        }
    },

    // Export products to CSV
    exportCSV: async (req, res) => {
        try {
            const products = await Product.findAll({
                include: [{
                    model: Category,
                    as: 'category',
                    attributes: ['name']
                }],
                order: [['created_at', 'DESC']]
            });

            // Create CSV content
            let csv = 'ID,Name,SKU,Category,Price (KSh),Cost Price (KSh),Quantity,Status,Created At\n';
            products.forEach(product => {
                csv += `${product.id},${product.name},${product.sku},${product.category ? product.category.name : 'N/A'},${product.price},${product.cost_price},${product.quantity},${product.status},${req.app.locals.moment(product.created_at).format('YYYY-MM-DD HH:mm:ss')}\n`;
            });

            res.header('Content-Type', 'text/csv');
            res.attachment('products.csv');
            res.send(csv);
        } catch (error) {
            console.error('Error exporting products:', error);
            req.flash('error_msg', 'Error exporting products');
            res.redirect('/products');
        }
    },

    // Get low stock products
    getLowStock: async (req, res) => {
        try {
            const threshold = parseInt(req.query.threshold) || 10;

            const lowStockProducts = await Product.findAll({
                where: {
                    quantity: { [Op.lte]: threshold },
                    status: 'active'
                },
                include: [{
                    model: Category,
                    as: 'category',
                    attributes: ['name']
                }],
                order: [['quantity', 'ASC']]
            });

            res.json({ success: true, products: lowStockProducts });
        } catch (error) {
            console.error('Error fetching low stock:', error);
            res.status(500).json({ success: false, message: 'Error fetching low stock products' });
        }
    }
};

module.exports = ProductController;
