/**
 * @fileoverview
 * DeliveryAssignment Model
 *
 * Represents a single delivery in the system.
 *
 * Responsibilities:
 * - Store delivery destination
 * - Maintain agent ownership (agentId)
 * - Maintain pointer relationships (prev/next)
 *
 * Notes:
 * - Status is NOT stored (derived via stateService)
 * - Pointer fields are derived and can be rebuilt
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} DeliveryAssignment
 * @property {string} _id - Internal delivery identifier
 * @property {string|null} orderId - External identifier
 * @property {string|null} agentId - Assigned agent
 * @property {{lat:number,lng:number}} destination
 * @property {ObjectId|null} prevDeliveryId
 * @property {ObjectId|null} nextDeliveryId
 */

const deliveryAssignmentSchema = new mongoose.Schema({
  orderId: {
    type: String,
    sparse: true,
    index: true
  },

  /**
   * Agent assignment reference
   * Nullable → represents unassigned state
   */
  agentId: {
    type: String,
    default: null,
    index: true
  },

  /**
   * Delivery destination coordinates
   */
  destination: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },

  /**
   * Pointer to previous delivery (derived)
   */
  prevDeliveryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment',
    default: null
  },

  /**
   * Pointer to next delivery (derived)
   */
  nextDeliveryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment',
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model('DeliveryAssignment', deliveryAssignmentSchema);
