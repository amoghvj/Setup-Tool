const mongoose = require('mongoose');
const AgentLocation = require('./models/AgentLocation.js');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/optiroute-db';
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  let baseLat = 37.7749;
  let baseLng = -122.4194;

  const loc1 = await AgentLocation.findOne({ agentId: 'driver-001' });
  if (loc1 && loc1.location && loc1.location.lat != null) {
    baseLat = loc1.location.lat;
    baseLng = loc1.location.lng;
  }

  const addDeliveries = async (count, batchName) => {
    for (let i = 0; i < count; i++) {
        const dLat = baseLat + (Math.random() - 0.5) * 0.05;
        const dLng = baseLng + (Math.random() - 0.5) * 0.05;
        const order_id = `ORDER_${batchName}_${Date.now()}_${i}`;
        const res = await fetch('http://localhost:3000/api/deliveries/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id, coords: { lat: dLat, lng: dLng } })
        });
        const d = await res.json();
        console.log(`Added ${order_id} assigned to ${d.agentId}`);
    }
  };

  console.log('Adding 5 random deliveries...');
  await addDeliveries(5, 'BATCH_A');

  process.exit();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
