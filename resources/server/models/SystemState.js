/**
 * @fileoverview
 * SystemState Model
 *
 * Stores global system-level metadata.
 *
 * Responsibilities:
 * - Track first deliveries across all agents
 * - Maintain global pickup points
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} SystemState
 * @property {string} configId
 * @property {ObjectId[]} firstDeliveries
 * @property {{lat:number,lng:number}[]} pickupPoints
 */

const systemStateSchema = new mongoose.Schema({
  configId: {
    type: String,
    required: true,
    unique: true,
    default: 'global_optiroute_state'
  },

  firstDeliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],

  pickupPoints: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }]

}, { timestamps: true });

module.exports = mongoose.model('SystemState', systemStateSchema);
