const mongoose = require('mongoose');
const Agent = require('./models/Agent.js');
const AgentLocation = require('./models/AgentLocation.js');
const DeliveryAssignment = require('./models/DeliveryAssignment.js');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/optiroute-db';
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  // Reset old state to ensure clean test
  await DeliveryAssignment.deleteMany({});
  await Agent.updateMany({}, { activeDeliveries: [], pendingPickupDeliveries: [] });

  // get first agent
  const agent1 = await Agent.findOne();
  if (!agent1) {
    console.error('No existing agents found!');
    process.exit(1);
  }
  const agentId1 = agent1.agentId;

  // get agent1 location
  const loc1 = await AgentLocation.findOne({ agentId: agentId1 });
  let baseLat = 37.7749;
  let baseLng = -122.4194;
  if (loc1 && loc1.location && loc1.location.lat != null) {
    baseLat = loc1.location.lat;
    baseLng = loc1.location.lng;
  }

  // Ensure agent2 exists
  const agentId2 = agentId1 + '_beta';
  let agent2 = await Agent.findOne({ agentId: agentId2 });
  if (!agent2) {
    console.log(`Adding agent ${agentId2}...`);
    await fetch('http://localhost:3000/api/agents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId2 })
    });
  }

  // Set agent2 location slightly apart
  const agent2Lat = baseLat + 0.005;
  const agent2Lng = baseLng + 0.005;
  await fetch('http://localhost:3000/api/agents/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId2, coords: { lat: agent2Lat, lng: agent2Lng } })
  });

  // add deliveries
  const addDeliveries = async (count, batchName) => {
    for (let i = 0; i < count; i++) {
        const dLat = baseLat + (Math.random() - 0.5) * 0.05;
        const dLng = baseLng + (Math.random() - 0.5) * 0.05;
        const order_id = `ORDER_${batchName}_${Date.now()}_${i}`;
        await fetch('http://localhost:3000/api/deliveries/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id, coords: { lat: dLat, lng: dLng } })
        });
    }
  };

  console.log('Adding first set of 5 deliveries...');
  await addDeliveries(5, 'SET1');

  console.log('Adding second set of 5 deliveries...');
  await addDeliveries(5, 'SET2');

  console.log(`Performing pickup for ${agentId1}...`);
  const pickupRes = await fetch('http://localhost:3000/api/deliveries/pickup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId1 })
  });
  console.log(await pickupRes.json());
  
  process.exit();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
