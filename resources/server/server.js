require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();

// ---------- Configuration ----------
// Environment variables are loaded from .env by dotenv.
// The setup tool generates this file with user-provided values.
const PORT = process.env.PORT || 3000;
const EXAMPLE_API_KEY = process.env.EXAMPLE_API_KEY || '';
const EXAMPLE_ENDPOINT = process.env.EXAMPLE_ENDPOINT || '';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/optiroute-db';

// ---------- Middleware ----------
// Security headers (safe defaults for both local and cloud)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: [
        "'self'", 
        "data:", 
        "https://*.tile.openstreetmap.org", 
        "https://images.unsplash.com"
      ],
      connectSrc: ["'self'"],
    },
  },
}));

// CORS — allows the mobile app and other clients to call this server
app.use(cors());

// HTTP request logging (useful for debugging on cloud / VPS)
app.use(morgan('combined'));

// Parse JSON request bodies
app.use(express.json());

// ---------- Services ----------
const { assignAgent } = require('./services/assignmentService');
const {
  assignDriver,
  processPickup,
  completeDelivery,
  cancelDelivery,
  assignExistingDelivery,
  getAgentRoute
} = require('./services/deliveryService');

// ---------- Models ----------
const Agent = require('./models/Agent');
const AgentLocation = require('./models/AgentLocation');
const PickupLocation = require('./models/PickupLocation');
const DeliveryAssignment = require('./models/DeliveryAssignment');

// Serve static files from the React frontend under the /manager path
app.use('/manager', express.static(path.join(__dirname, 'frontend/dist')));

// POST /api/agents/add — Register a new delivery agent (used by mobile app)
app.post('/api/agents/add', async (req, res) => {
  try {
    const { agent_id } = req.body;
    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required.' });
    }

    const existing = await Agent.findOne({ agentId: agent_id });
    if (existing) {
      return res.status(409).json({ error: `Agent "${agent_id}" already exists.` });
    }

    const agent = new Agent({ agentId: agent_id });
    await agent.save();

    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/route — Fetch an agent's active deliveries and next pickup
app.get('/api/agents/route', async (req, res) => {
  try {
    const { agent_id } = req.query;
    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id query parameter is required.' });
    }

    const route = await getAgentRoute(agent_id);
    res.json({ success: true, ...route });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/location — Update agent's live GPS coordinates
app.post('/api/agents/location', async (req, res) => {
  try {
    const { agent_id, coords } = req.body;
    if (!agent_id || !coords || coords.lat == null || coords.lng == null) {
      return res.status(400).json({ error: 'agent_id and coords { lat, lng } are required.' });
    }

    const location = await AgentLocation.findOneAndUpdate(
      { agentId: agent_id },
      { location: { lat: coords.lat, lng: coords.lng }, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    res.json({ success: true, location });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/add — Business owner adds a new delivery
app.post('/api/deliveries/add', async (req, res) => {
  try {
    const { order_id, coords } = req.body;
    if (!coords || coords.lat == null || coords.lng == null) {
      return res.status(400).json({ error: 'coords with lat and lng are required.' });
    }

    // Step 1 — Agent Assignment
    const agentId = await assignAgent(coords);

    // Step 2 — Assign Driver (creates record, appends to pending queue)
    const agent = await assignDriver(agentId, order_id, coords);

    res.json({ success: true, agentId, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/assign — Persist a dashboard assignment to a specific driver
app.post('/api/deliveries/assign', async (req, res) => {
  try {
    const { delivery_id, agent_id } = req.body;
    if (!delivery_id || !agent_id) {
      return res.status(400).json({ error: 'delivery_id and agent_id are required.' });
    }

    const result = await assignExistingDelivery(delivery_id, agent_id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/pickup — Driver picks up the next batch
app.post('/api/deliveries/pickup', async (req, res) => {
  try {
    const { agent_id } = req.body;
    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required.' });
    }

    const agent = await processPickup(agent_id);
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/complete — Driver completes the current delivery
app.post('/api/deliveries/complete', async (req, res) => {
  try {
    const { agent_id } = req.body;
    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required.' });
    }

    const agent = await completeDelivery(agent_id);
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries/cancel — Business owner cancels a delivery by order_id
app.post('/api/deliveries/cancel', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required.' });
    }

    const agent = await cancelDelivery(order_id);
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== Pickup Location Endpoints ==========

// POST /api/pickups/add — Add a new pickup location
app.post('/api/pickups/add', async (req, res) => {
  try {
    const { id, name, coords } = req.body;
    if (!id || !name || !coords || coords.lat == null || coords.lng == null) {
      return res.status(400).json({ error: 'id, name, and coords { lat, lng } are required.' });
    }

    const existing = await PickupLocation.findOne({ pickupId: id });
    if (existing) {
      return res.status(409).json({ error: `Pickup location "${id}" already exists.` });
    }

    const pickup = new PickupLocation({
      pickupId: id,
      name,
      location: { lat: coords.lat, lng: coords.lng }
    });
    await pickup.save();

    res.json({ success: true, pickup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pickups/:id — Get a pickup location by external ID
app.get('/api/pickups/:id', async (req, res) => {
  try {
    const pickup = await PickupLocation.findOne({ pickupId: req.params.id });
    if (!pickup) {
      return res.status(404).json({ error: `Pickup location "${req.params.id}" not found.` });
    }
    res.json({ success: true, pickup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/pickups/:id — Delete a pickup location by external ID
app.delete('/api/pickups/:id', async (req, res) => {
  try {
    const pickup = await PickupLocation.findOneAndDelete({ pickupId: req.params.id });
    if (!pickup) {
      return res.status(404).json({ error: `Pickup location "${req.params.id}" not found.` });
    }
    res.json({ success: true, deleted: pickup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== List Endpoints ==========

// GET /api/pickups — List all registered pickup locations
app.get('/api/pickups', async (_req, res) => {
  try {
    const pickups = await PickupLocation.find({});
    res.json({ success: true, count: pickups.length, pickups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents — List all registered agents
app.get('/api/agents', async (_req, res) => {
  try {
    const agents = await Agent.find({});
    res.json({ success: true, count: agents.length, agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deliveries — List all delivery assignments
app.get('/api/deliveries', async (_req, res) => {
  try {
    const deliveries = await DeliveryAssignment.find({});
    res.json({ success: true, count: deliveries.length, deliveries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback Route (catch-all for React Router)
// This must handle any route that starts with /manager/ but NOT dashboard assets
app.get('/manager/*', (req, res) => {
  // If the request is for an asset but it wasn't found by express.static, 
  // we should return a 404 instead of index.html to avoid MIME type errors.
  if (req.path.startsWith('/manager/assets/')) {
    return res.status(404).send('Asset not found');
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

// Optional: Redirect root /manager to /manager/
app.get('/manager', (req, res) => {
  res.redirect('/manager/');
});

// ---------- Database Initialization ----------
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Failed to connect to MongoDB:', err.message));
} else {
  console.log('MONGODB_URI not provided. Skipping database connection.');
}

// ---------- Start ----------
// Only listen when run directly (not when imported by Vercel serverless)
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Another server is already running.`);
      process.exit(1);
    }

    throw err;
  });
}

// Export for Vercel serverless functions
module.exports = app;
