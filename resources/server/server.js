require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();

// ============================================
// CONFIGURATION
// ============================================

const PORT = process.env.PORT || 3000;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/optiroute-db';

// ============================================
// MIDDLEWARE
// ============================================

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'"
        ],
        imgSrc: [
          "'self'",
          'data:',
          'https://*.tile.openstreetmap.org',
          'https://images.unsplash.com'
        ],
        connectSrc: ["'self'"]
      }
    }
  })
);

// CORS — allows the mobile app and other clients to call this server
app.use(cors());

// HTTP request logging (useful for debugging on cloud / VPS)
app.use(morgan('combined'));

// Parse JSON request bodies
app.use(express.json());

// ============================================
// SERVICES
// ============================================

const {
  assignAgent
} = require('./services/assignmentService');

const {
  assignDriver,
  processPickup,
  completeDelivery,
  cancelDelivery,
  assignExistingDelivery,
  getAgentRoute
} = require('./services/deliveryService');

const {
  createAgent,
  getAgents,
  upsertAgentLocation,
  createPickupLocation,
  getPickupLocation,
  deletePickupLocation,
  getPickupLocations,
  getDeliveries
} = require('./services/stateService');

// ============================================
// STATIC FRONTEND
// ============================================

app.use(
  '/manager',
  express.static(
    path.join(__dirname, 'frontend/dist')
  )
);

// ============================================
// AGENT ENDPOINTS
// ============================================

/**
 * Registers a new delivery agent.
 */
app.post('/api/agents/add', async (req, res) => {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({
        error: 'agent_id is required.'
      });
    }

    const agent =
      await createAgent(agent_id);

    return res.json({
      success: true,
      agent
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Retrieves current route for agent.
 */
app.get('/api/agents/route', async (req, res) => {
  try {
    const { agent_id } = req.query;

    if (!agent_id) {
      return res.status(400).json({
        error:
          'agent_id query parameter is required.'
      });
    }

    const route =
      await getAgentRoute(agent_id);

    return res.json({
      success: true,
      ...route
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Updates live GPS location of agent.
 */
app.post('/api/agents/location', async (req, res) => {
  try {
    const { agent_id, coords } = req.body;

    if (
      !agent_id ||
      !coords ||
      coords.lat == null ||
      coords.lng == null
    ) {
      return res.status(400).json({
        error:
          'agent_id and coords { lat, lng } are required.'
      });
    }

    const location =
      await upsertAgentLocation(
        agent_id,
        {
          lat: coords.lat,
          lng: coords.lng
        }
      );

    return res.json({
      success: true,
      location
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Lists all agents.
 */
app.get('/api/agents', async (_req, res) => {
  try {
    const agents =
      await getAgents();

    return res.json({
      success: true,
      count: agents.length,
      agents
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

// ============================================
// DELIVERY ENDPOINTS
// ============================================

/**
 * Creates and assigns delivery.
 */
app.post('/api/deliveries/add', async (req, res) => {
  try {
    const { order_id, coords } = req.body;

    if (
      !coords ||
      coords.lat == null ||
      coords.lng == null
    ) {
      return res.status(400).json({
        error:
          'coords with lat and lng are required.'
      });
    }

    const agentId =
      await assignAgent(coords);

    const agent =
      await assignDriver(
        agentId,
        order_id,
        coords
      );

    return res.json({
      success: true,
      agentId,
      agent
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Assigns existing delivery.
 */
app.post('/api/deliveries/assign', async (req, res) => {
  try {
    const {
      delivery_id,
      agent_id
    } = req.body;

    if (!delivery_id || !agent_id) {
      return res.status(400).json({
        error:
          'delivery_id and agent_id are required.'
      });
    }

    const result =
      await assignExistingDelivery(
        delivery_id,
        agent_id
      );

    return res.json({
      success: true,
      ...result
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Processes pickup batch.
 */
app.post('/api/deliveries/pickup', async (req, res) => {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({
        error: 'agent_id is required.'
      });
    }

    const agent =
      await processPickup(agent_id);

    return res.json({
      success: true,
      agent
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Completes current delivery.
 */
app.post('/api/deliveries/complete', async (req, res) => {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({
        error: 'agent_id is required.'
      });
    }

    const agent =
      await completeDelivery(agent_id);

    return res.json({
      success: true,
      agent
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Cancels delivery.
 */
app.post('/api/deliveries/cancel', async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({
        error: 'order_id is required.'
      });
    }

    const agent =
      await cancelDelivery(order_id);

    return res.json({
      success: true,
      agent
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Lists deliveries.
 */
app.get('/api/deliveries', async (_req, res) => {
  try {
    const deliveries =
      await getDeliveries();

    return res.json({
      success: true,
      count: deliveries.length,
      deliveries
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

// ============================================
// PICKUP ENDPOINTS
// ============================================

/**
 * Creates pickup location.
 */
app.post('/api/pickups/add', async (req, res) => {
  try {
    const {
      id,
      name,
      coords
    } = req.body;

    if (
      !id ||
      !name ||
      !coords ||
      coords.lat == null ||
      coords.lng == null
    ) {
      return res.status(400).json({
        error:
          'id, name, and coords { lat, lng } are required.'
      });
    }

    const pickup =
      await createPickupLocation({
        id,
        name,
        coords
      });

    return res.json({
      success: true,
      pickup
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Retrieves pickup location.
 */
app.get('/api/pickups/:id', async (req, res) => {
  try {
    const pickup =
      await getPickupLocation(
        req.params.id
      );

    return res.json({
      success: true,
      pickup
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Deletes pickup location.
 */
app.delete('/api/pickups/:id', async (req, res) => {
  try {
    const deleted =
      await deletePickupLocation(
        req.params.id
      );

    return res.json({
      success: true,
      deleted
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

/**
 * Lists pickup locations.
 */
app.get('/api/pickups', async (_req, res) => {
  try {
    const pickups =
      await getPickupLocations();

    return res.json({
      success: true,
      count: pickups.length,
      pickups
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

// ============================================
// SPA FALLBACK
// ============================================

app.get('/manager/*', (req, res) => {
  if (
    req.path.startsWith(
      '/manager/assets/'
    )
  ) {
    return res
      .status(404)
      .send('Asset not found');
  }

  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, must-revalidate'
  );

  return res.sendFile(
    path.join(
      __dirname,
      'frontend/dist',
      'index.html'
    )
  );
});

app.get('/manager', (_req, res) => {
  return res.redirect('/manager/');
});

// ============================================
// DATABASE
// ============================================

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log(
        'Connected to MongoDB'
      );
    })
    .catch((err) => {
      console.error(
        'Failed to connect to MongoDB:',
        err.message
      );
    });
}

// ============================================
// STARTUP
// ============================================

if (require.main === module) {
  const server =
    app.listen(PORT, () => {
      console.log(
        `Server listening on http://localhost:${PORT}`
      );
    });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use.`
      );

      process.exit(1);
    }

    throw err;
  });
}

// Export for Vercel serverless functions
module.exports = app;
