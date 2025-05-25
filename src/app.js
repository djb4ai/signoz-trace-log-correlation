// CRITICAL: Import tracing before any other modules
require('./tracing');

const express = require('express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Sample data to simulate a real application
const USERS = {
  'john@example.com': { id: 1, name: 'John Doe', active: true },
  'jane@example.com': { id: 2, name: 'Jane Smith', active: true },
  'inactive@example.com': { id: 3, name: 'Inactive User', active: false }
};

const ORDERS = {
  1: [{ id: 101, product: 'Laptop', amount: 999.99, status: 'shipped' }],
  2: [{ id: 102, product: 'Phone', amount: 599.99, status: 'pending' }]
};

// Routes

// Home endpoint
app.get('/', (req, res) => {
  logger.info('Home endpoint accessed');

  res.json({
    message: 'Node.js Log-Trace Correlation Demo',
    endpoints: [
      'GET /',
      'GET /users/:email',
      'GET /orders/:userId',
      'GET /simulate-error',
      'GET /health'
    ]
  });
});

// Get user by email
app.get('/users/:email', async (req, res) => {
  const { email } = req.params;

  logger.info('Fetching user data', { email });

  try {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    const user = USERS[email];

    if (!user) {
      logger.warn('User not found', { email });
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.active) {
      logger.warn('Attempt to access inactive user', { email, userId: user.id });
      return res.status(403).json({ error: 'User account is inactive' });
    }

    logger.info('User data retrieved successfully', {
      email,
      userId: user.id,
      userName: user.name
    });

    res.json({ user });

  } catch (error) {
    logger.error('Error fetching user data', {
      email,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get orders for a user
app.get('/orders/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

  logger.info('Fetching user orders', { userId });

  try {
    // Simulate database query time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));

    const orders = ORDERS[userId];

    if (!orders) {
      logger.info('No orders found for user', { userId });
      return res.json({ orders: [] });
    }

    // Simulate potential slow operation
    if (Math.random() < 0.3) {
      logger.warn('Slow order processing detected', { userId });
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info('Orders retrieved successfully', {
      userId,
      orderCount: orders.length,
      totalAmount: orders.reduce((sum, order) => sum + order.amount, 0)
    });

    res.json({ orders });

  } catch (error) {
    logger.error('Error fetching orders', {
      userId,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simulate error endpoint for testing
app.get('/simulate-error', (req, res) => {
  const errorType = req.query.type || 'generic';

  logger.info('Simulating error', { errorType });

  if (errorType === 'timeout') {
    logger.warn('Simulating timeout scenario');
    // Don't respond - simulate a timeout
    setTimeout(() => {
      logger.error('Request timeout occurred');
      res.status(408).json({ error: 'Request timeout' });
    }, 5000);
    return;
  }

  if (errorType === 'database') {
    logger.error('Simulating database connection error', {
      database: 'orders_db',
      connectionAttempts: 3
    });
    return res.status(503).json({ error: 'Database unavailable' });
  }

  // Generic error
  logger.error('Generic error simulation', {
    errorType,
    randomId: Math.random().toString(36).substring(7)
  });

  res.status(500).json({ error: 'Something went wrong!' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };

  logger.info('Health check completed', { status: health.status });

  res.json(health);
});

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl
  });

  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled application error', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl
  });

  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});