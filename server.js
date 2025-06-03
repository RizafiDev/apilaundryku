require('dotenv').config();
const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Basic middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Midtrans config
const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY
});

// Generate simple order ID
const generateOrderId = () => `LY-${Date.now()}`;

// Create payment endpoint
app.post('/api/payment/create', async (req, res) => {
    try {
        const { amount, customerDetails, itemDetails } = req.body;
        
        const orderId = generateOrderId();
        
        const parameters = {
            transaction_details: {
                order_id: orderId,
                gross_amount: amount
            },
            customer_details: customerDetails,
            item_details: itemDetails
        };

        const transaction = await snap.createTransaction(parameters);
        
        res.json({
            success: true,
            message: 'Payment created',
            data: {
                token: transaction.token,
                redirect_url: transaction.redirect_url,
                order_id: orderId,
                payment_type: transaction.payment_type // Include payment method
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Payment failed',
            error: error.message
        });
    }
});

// Check status endpoint
app.get('/api/payment/status', async (req, res) => {
    try {
        const { order_id } = req.query;
        
        const status = await snap.transaction.status(order_id);
        
        res.json({
            success: true,
            message: 'Status checked',
            data: {
                order_id: status.order_id,
                payment_type: status.payment_type, // Payment method
                status: status.transaction_status
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Status check failed',
            error: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});