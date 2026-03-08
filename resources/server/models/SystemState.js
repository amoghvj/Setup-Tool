const mongoose = require('mongoose');

const systemStateSchema = new mongoose.Schema({
  configId: {
    type: String,
    required: true,
    unique: true,
    default: 'global_optiroute_state'
  },
  // Global First-Delivery Array: stores only the native _ids of all current immediate next deliveries
  firstDeliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],
  // Pickup Point Locations: Static or rarely changing item pickup coordinates
  pickupPoints: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }]
}, { timestamps: true });

module.exports = mongoose.model('SystemState', systemStateSchema);
