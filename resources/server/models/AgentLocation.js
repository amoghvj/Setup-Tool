const mongoose = require('mongoose');

const agentLocationSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true
  },
  // Live coordinates reported by the mobile app
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  // Timestamp of the last location update
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AgentLocation', agentLocationSchema);
