/**
 * @fileoverview
 * AgentLocation Model
 *
 * Stores real-time GPS location of agents.
 *
 * Responsibilities:
 * - Track latest known position
 * - Provide anchor for routing decisions
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} AgentLocation
 * @property {string} agentId
 * @property {{lat:number,lng:number}} location
 * @property {Date} updatedAt
 */

const agentLocationSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true
  },

  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AgentLocation', agentLocationSchema);
