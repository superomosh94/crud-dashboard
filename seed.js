require('dotenv').config();
const { User, Product, Category, Order, OrderItem, sequelize } = require('./models/associations');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const moment = require('moment');

const seedDatabase = async () => {
    try {
        console.log('🌱 Starting database seeding...');

        // Create tables and clear existing data
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await sequelize.sync({ force: true });
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅ Database schema synchronized and data cleared');

        // Create users
        const users = await User.bulkCreate([
            {
                username: 'admin',
                email: 'admin@crud.com',
                password: 'password123',
                full_name: 'System Administrator',
                phone: '+254 700 000 000',
                role: 'admin',
                status: 'active',
                avatar: null,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                username: 'manager',
                email: 'manager@crud.com',
                password: 'password123',
                full_name: 'Sales Manager',
                phone: '+254 711 111 111',
                role: 'manager',
                status: 'active',
                avatar: null,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                username: 'john_doe',
                email: 'john@example.com',
                password: 'password123',
                full_name: 'John Doe',
                phone: '+254 722 222 222',
                role: 'user',
                status: 'active',
                avatar: null,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                username: 'jane_smith',
                email: 'jane@example.com',
                password: 'password123',
                full_name: 'Jane Smith',
                phone: '+254 733 333 333',
                role: 'user',
                status: 'active',
                avatar: null,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                username: 'bob_wilson',
                email: 'bob@example.com',
                password: 'User@123',
                full_name: 'Bob Wilson',
                phone: '+254 744 444 444',
                role: 'user',
                status: 'inactive',
                avatar: null,
                created_at: new Date(),
                updated_at: new Date()
            }
        ], { individualHooks: true });

        console.log(`✅ Created ${users.length} users`);

        // Create categories
        const categories = await Category.bulkCreate([
            {
                name: 'Electronics',
                description: 'Electronic devices and gadgets',
                icon: 'fa-laptop',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Clothing',
                description: 'Fashion and apparel',
                icon: 'fa-tshirt',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Books',
                description: 'Books and publications',
                icon: 'fa-book',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Home & Garden',
                description: 'Home improvement and gardening',
                icon: 'fa-home',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Sports',
                description: 'Sports equipment and gear',
                icon: 'fa-futbol',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date()
            }
        ]);

        console.log(`✅ Created ${categories.length} categories`);

        // Create products
        const products = await Product.bulkCreate([
            {
                name: 'Wireless Bluetooth Headphones',
                sku: 'ELEC-001',
                description: 'High-quality wireless headphones with noise cancellation',
                price: 89.99,
                cost_price: 45.00,
                quantity: 50,
                category_id: categories[0].id,
                image: null,
                status: 'active',
                featured: true,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Smartphone X',
                sku: 'ELEC-002',
                description: 'Latest smartphone with 128GB storage',
                price: 699.99,
                cost_price: 450.00,
                quantity: 25,
                category_id: categories[0].id,
                image: null,
                status: 'active',
                featured: true,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Cotton T-Shirt',
                sku: 'CLOTH-001',
                description: '100% cotton premium t-shirt',
                price: 19.99,
                cost_price: 8.50,
                quantity: 100,
                category_id: categories[1].id,
                image: null,
                status: 'active',
                featured: false,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Programming Book',
                sku: 'BOOK-001',
                description: 'Complete guide to JavaScript programming',
                price: 39.99,
                cost_price: 15.00,
                quantity: 75,
                category_id: categories[2].id,
                image: null,
                status: 'active',
                featured: true,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Garden Tool Set',
                sku: 'HOME-001',
                description: 'Complete gardening tool set',
                price: 49.99,
                cost_price: 25.00,
                quantity: 30,
                category_id: categories[3].id,
                image: null,
                status: 'active',
                featured: false,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Running Shoes',
                sku: 'SPORT-001',
                description: 'Professional running shoes',
                price: 79.99,
                cost_price: 35.00,
                quantity: 40,
                category_id: categories[4].id,
                image: null,
                status: 'active',
                featured: true,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                name: 'Out of Stock Item',
                sku: 'TEST-001',
                description: 'Test item with zero quantity',
                price: 29.99,
                cost_price: 12.00,
                quantity: 0,
                category_id: categories[0].id,
                image: null,
                status: 'out_of_stock',
                featured: false,
                created_at: new Date(),
                updated_at: new Date()
            }
        ]);

        console.log(`✅ Created ${products.length} products`);

        // Create orders
        const ordersCreated = [];
        const orderItems = [];

        // Generate orders for the last 30 days
        for (let i = 0; i < 20; i++) {
            const customer = users[Math.floor(Math.random() * users.length)];
            const orderDate = moment().subtract(Math.floor(Math.random() * 30), 'days').toDate();
            const orderNumber = `ORD-${moment(orderDate).format('YYYYMMDD')}-${String(i + 1).padStart(3, '0')}`;

            // Random order status
            const statuses = ['pending', 'processing', 'completed', 'cancelled'];
            const status = statuses[Math.floor(Math.random() * statuses.length)];

            // Random payment status based on order status
            let paymentStatus = 'pending';
            if (status === 'completed') paymentStatus = 'paid';
            if (status === 'cancelled') paymentStatus = 'failed';

            // Random payment method
            const paymentMethods = ['cash', 'card', 'mpesa'];
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

            // Create order
            const order = await Order.create({
                order_number: orderNumber,
                customer_id: customer.id,
                total_amount: 0, // Will be calculated
                discount: Math.random() * 10,
                tax: Math.random() * 5,
                grand_total: 0, // Will be calculated
                status: status,
                payment_method: paymentMethod,
                payment_status: paymentStatus,
                shipping_address: `123 Main St, Nairobi, Kenya`,
                notes: i % 3 === 0 ? 'Handle with care' : null,
                created_at: orderDate,
                updated_at: orderDate
            });

            ordersCreated.push(order);

            // Add 1-3 random products to each order
            const numItems = Math.floor(Math.random() * 3) + 1;
            let orderSubtotal = 0;

            for (let j = 0; j < numItems; j++) {
                const product = products[Math.floor(Math.random() * products.length)];
                const quantity = Math.floor(Math.random() * 3) + 1;
                const subtotal = product.price * quantity;
                orderSubtotal += subtotal;

                orderItems.push({
                    order_id: order.id,
                    product_id: product.id,
                    quantity: quantity,
                    unit_price: product.price,
                    subtotal: subtotal,
                    created_at: orderDate,
                    updated_at: orderDate
                });

                // Update product quantity
                await product.decrement('quantity', { by: quantity });
            }

            // Update order totals
            const grandTotal = orderSubtotal - order.discount + order.tax;
            await order.update({
                total_amount: orderSubtotal,
                grand_total: grandTotal
            });
        }

        // Bulk create order items
        await OrderItem.bulkCreate(orderItems);

        console.log(`✅ Created ${ordersCreated.length} orders with ${orderItems.length} items`);

        // Create some low stock products
        const lowStockProducts = await Product.findAll({
            where: { quantity: { [Op.lte]: 5 } }
        });

        console.log(`⚠️ Low stock products: ${lowStockProducts.length}`);

        console.log('🎉 Database seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

// Run seeding
seedDatabase();
