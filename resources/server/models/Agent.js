const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true
  },
  // Active Delivery Queue: Ordered array of delivery internal IDs currently being fulfilled.
  // Sequence is fixed and does not change on new un-picked assignment.
  activeDeliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],
  // Pending Pickup Queue: Array of delivery IDs waiting to be picked up.
  pendingPickupDeliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],
  // Next Pickup Location: Coordinates where the agent must collect the pending deliveries.
  nextPickupLocation: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);
