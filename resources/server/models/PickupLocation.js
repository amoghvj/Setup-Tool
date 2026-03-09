const mongoose = require('mongoose');

const pickupLocationSchema = new mongoose.Schema({
  // External identifier from the business owner's existing systems
  pickupId: {
    type: String,
    required: true,
    unique: true
  },
  // Human-readable label for the pickup point (e.g., "Main Warehouse", "Store #2")
  name: {
    type: String,
    required: true
  },
  // GPS coordinates of the pickup point
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('PickupLocation', pickupLocationSchema);
