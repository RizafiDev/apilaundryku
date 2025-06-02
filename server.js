// server.js
const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Midtrans configuration
const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Core API untuk transaksi yang lebih advance
const coreApi = new midtransClient.CoreApi({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Generate order ID
function generateOrderId() {
    return 'ORDER-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Endpoint untuk membuat transaksi (Snap Token)
app.post('/api/payment/create-transaction', async (req, res) => {
    try {
        const { amount, customerDetails, itemDetails, customExpiry } = req.body;

        // Validasi input
        if (!amount || !customerDetails || !itemDetails) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount, customerDetails, itemDetails'
            });
        }

        const orderId = generateOrderId();
        
        const parameter = {
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
                finish: `${process.env.BASE_URL}/payment-success`,
                error: `${process.env.BASE_URL}/payment-error`,
                pending: `${process.env.BASE_URL}/payment-pending`
            }
        };

        // Custom expiry jika diperlukan
        if (customExpiry) {
            parameter.custom_expiry = customExpiry;
        }

        const transaction = await snap.createTransaction(parameter);
        
        res.json({
            success: true,
            data: {
                token: transaction.token,
                redirect_url: transaction.redirect_url,
                order_id: orderId
            }
        });

    } catch (error) {
        console.error('Create transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create transaction',
            error: error.message
        });
    }
});

// Endpoint untuk cek status transaksi
app.get('/api/payment/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const statusResponse = await coreApi.transaction.status(orderId);
        
        res.json({
            success: true,
            data: statusResponse
        });

    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check transaction status',
            error: error.message
        });
    }
});

// Webhook untuk notifikasi dari Midtrans
app.post('/api/payment/notification', async (req, res) => {
    try {
        const notification = req.body;
        const orderId = notification.order_id;
        const statusResponse = await coreApi.transaction.notification(notification);

        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        console.log(`Transaction notification received. Order ID: ${orderId}. Transaction status: ${transactionStatus}. Fraud status: ${fraudStatus}`);

        // Verifikasi signature key
        const signatureKey = notification.signature_key;
        const orderId2 = notification.order_id;
        const statusCode = notification.status_code;
        const grossAmount = notification.gross_amount;
        const serverKey = process.env.MIDTRANS_SERVER_KEY;
        
        const hash = crypto.createHash('sha512');
        hash.update(orderId2 + statusCode + grossAmount + serverKey);
        const expectedSignature = hash.digest('hex');

        if (signatureKey !== expectedSignature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid signature key'
            });
        }

        // Handle berbagai status transaksi
        if (transactionStatus === 'capture') {
            if (fraudStatus === 'challenge') {
                // TODO: Set payment status to 'challenge'
                console.log('Transaction is challenged');
            } else if (fraudStatus === 'accept') {
                // TODO: Set payment status to 'success'
                console.log('Transaction is successful');
            }
        } else if (transactionStatus === 'settlement') {
            // TODO: Set payment status to 'success'
            console.log('Transaction is settled');
        } else if (transactionStatus === 'deny') {
            // TODO: Set payment status to 'denied'
            console.log('Transaction is denied');
        } else if (transactionStatus === 'cancel' || transactionStatus === 'expire') {
            // TODO: Set payment status to 'cancelled'
            console.log('Transaction is cancelled or expired');
        } else if (transactionStatus === 'pending') {
            // TODO: Set payment status to 'pending'
            console.log('Transaction is pending');
        }

        res.status(200).json({
            success: true,
            message: 'Notification processed successfully'
        });

    } catch (error) {
        console.error('Notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process notification',
            error: error.message
        });
    }
});

// Endpoint untuk cancel transaksi
app.post('/api/payment/cancel/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const cancelResponse = await coreApi.transaction.cancel(orderId);
        
        res.json({
            success: true,
            data: cancelResponse
        });

    } catch (error) {
        console.error('Cancel transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel transaction',
            error: error.message
        });
    }
});

// Endpoint untuk refund
app.post('/api/payment/refund/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { amount, reason } = req.body;
        
        const refundParams = {
            refund_key: `refund-${orderId}-${Date.now()}`,
            amount: amount,
            reason: reason || 'Customer request'
        };
        
        const refundResponse = await coreApi.transaction.refund(orderId, refundParams);
        
        res.json({
            success: true,
            data: refundResponse
        });

    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refund transaction',
            error: error.message
        });
    }
});

// Endpoint untuk mendapatkan list payment methods
app.get('/api/payment/methods', (req, res) => {
    res.json({
        success: true,
        data: {
            credit_card: ['visa', 'mastercard', 'jcb'],
            bank_transfer: ['bca', 'bni', 'bri', 'mandiri', 'permata'],
            e_wallet: ['gopay', 'shopeepay', 'dana'],
            over_the_counter: ['indomaret', 'alfamart'],
            cardless_credit: ['akulaku']
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Midtrans backend is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Midtrans backend server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});