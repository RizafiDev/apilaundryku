require('dotenv').config();
const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Midtrans configuration
const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Helper functions
const generateOrderId = () => `LY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

// API Endpoints
app.post('/api/payment/create', async (req, res) => {
    try {
        const { amount, customerDetails, itemDetails } = req.body;

        // Validate request
        if (!amount || !customerDetails || !itemDetails) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount, customerDetails, itemDetails',
                data: null
            });
        }

        if (!customerDetails.first_name || !customerDetails.phone) {
            return res.status(400).json({
                success: false,
                message: 'Customer details must include first_name and phone',
                data: null
            });
        }

        if (!Array.isArray(itemDetails) || itemDetails.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Item details must be a non-empty array',
                data: null
            });
        }

        const orderId = generateOrderId();
        
        const parameters = {
            transaction_details: {
                order_id: orderId,
                gross_amount: amount
            },
            credit_card: {
                secure: true
            },
            customer_details: customerDetails,
            item_details: itemDetails,
            callbacks: {
                finish: `${process.env.BASE_URL}/payment/finish`,
                error: `${process.env.BASE_URL}/payment/error`,
                pending: `${process.env.BASE_URL}/payment/pending`
            }
        };

        const transaction = await snap.createTransaction(parameters);
        
        res.json({
            success: true,
            message: 'Transaction created successfully',
            data: {
                token: transaction.token,
                redirect_url: transaction.redirect_url,
                order_id: orderId
            }
        });

    } catch (error) {
        console.error('Transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create transaction',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            data: null
        });
    }
});

app.get('/api/payment/status', async (req, res) => {
    try {
        const { order_id } = req.query;
        
        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required',
                data: null
            });
        }

        const statusResponse = await snap.transaction.status(order_id);
        
        res.json({
            success: true,
            message: 'Transaction status retrieved',
            data: {
                transaction_status: statusResponse.transaction_status,
                order_id: statusResponse.order_id,
                gross_amount: statusResponse.gross_amount,
                payment_type: statusResponse.payment_type,
                transaction_time: statusResponse.transaction_time,
                fraud_status: statusResponse.fraud_status
            }
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check transaction status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            data: null
        });
    }
});

app.post('/api/payment/notification', async (req, res) => {
    try {
        const notification = req.body;
        
        // Verify and process the notification
        const statusResponse = await snap.transaction.notification(notification);
        
        console.log('Payment notification:', {
            orderId: statusResponse.order_id,
            status: statusResponse.transaction_status,
            amount: statusResponse.gross_amount,
            paymentType: statusResponse.payment_type
        });

        // TODO: Update your database based on the transaction status
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Notification error:', error);
        res.status(500).send('Error processing notification');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
        data: null
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});