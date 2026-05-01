/**
 * @fileoverview
 * Agent Model
 *
 * Represents a delivery agent and their assigned workload.
 *
 * Responsibilities:
 * - Maintain ordered delivery queues
 * - Store next pickup location (derived externally)
 *
 * Notes:
 * - Arrays are the SINGLE source of truth
 * - Order matters for activeDeliveries
 * - pendingPickupDeliveries is append-only until pickup
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} Agent
 * @property {string} agentId
 * @property {ObjectId[]} activeDeliveries
 * @property {ObjectId[]} pendingPickupDeliveries
 * @property {{lat:number,lng:number}|null} nextPickupLocation
 */

const agentSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  /**
   * Ordered route of active deliveries
   */
  activeDeliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],

  /**
   * Queue of deliveries waiting for pickup
   */
  pendingPickupDeliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],

  /**
   * Next pickup location
   * - null by default
   * - updated by higher-level logic (NOT stateService)
   */
  nextPickupLocation: {
    lat: { type: Number },
    lng: { type: Number }
  }

}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);
