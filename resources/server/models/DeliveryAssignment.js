const mongoose = require('mongoose');

const deliveryAssignmentSchema = new mongoose.Schema({
  // Optional external integration identifier (e.g., from an external e-commerce platform).
  // The native _id is the primary internal routing identifier.
  orderId: {
    type: String,
    sparse: true // Allows nulls/undefined but indexes if present
  },
  // Delivery-to-Agent Mapping: delivery._id -> agent_id
  // Used for fast lookup, cancellation, and reassignment
  agentId: {
    type: String,
    required: true,
    index: true
  },
  // Delivery Location Mapping: destination coordinates for routing
  destination: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in-progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('DeliveryAssignment', deliveryAssignmentSchema);
