const mongoose = require('mongoose');
const AgentLocation = require('./models/AgentLocation.js');

async function main() {
  const agentRes = await fetch('http://localhost:3000/api/agents');
  const agentData = await agentRes.json();
  const agents = agentData.agents;

  if (!agents || agents.length === 0) {
    console.log("No agents found.");
    process.exit(1);
  }

  // Choose driver with more active packages
  const sortedAgents = agents.sort((a,b) => b.activeDeliveries.length - a.activeDeliveries.length);
  const targetAgent = sortedAgents[0];
  const agentId = targetAgent.agentId;
  const activeCount = targetAgent.activeDeliveries.length;

  console.log(`Choosing agent ${agentId} with ${activeCount} active deliveries.`);

  // Complete them
  for (let i = 0; i < activeCount; i++) {
    console.log(`Completing delivery ${i+1}/${activeCount} for ${agentId}...`);
    const res = await fetch('http://localhost:3000/api/deliveries/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId })
    });
    console.log(await res.json());
  }

  // Perform pickup
  console.log(`Performing pickup for ${agentId}...`);
  const pickupRes = await fetch('http://localhost:3000/api/deliveries/pickup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId })
  });
  console.log(await pickupRes.json());


  // Add the rest (5 deliveries)
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/optiroute-db';
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB for fetching location');

  const loc = await AgentLocation.findOne({ agentId });
  let baseLat = 37.7749;
  let baseLng = -122.4194;
  if (loc && loc.location && loc.location.lat != null) {
    baseLat = loc.location.lat;
    baseLng = loc.location.lng;
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
  await addDeliveries(5, 'BATCH_C');

  process.exit();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
