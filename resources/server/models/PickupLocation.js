/**
 * @fileoverview
 * PickupLocation Model
 *
 * Represents static pickup points.
 *
 * Responsibilities:
 * - Store pickup hubs / warehouses
 * - Provide routing reference points
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} PickupLocation
 * @property {string} pickupId
 * @property {string} name
 * @property {{lat:number,lng:number}} location
 */

const pickupLocationSchema = new mongoose.Schema({
  pickupId: {
    type: String,
    required: true,
    unique: true
  },

  name: {
    type: String,
    required: true
  },

  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }

}, { timestamps: true });

module.exports = mongoose.model('PickupLocation', pickupLocationSchema);
