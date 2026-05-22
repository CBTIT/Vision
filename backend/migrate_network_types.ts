import "dotenv/config";
import mongoose from "mongoose";
import RevitSession from "./models/RevitSession.js";

async function populateNetworkTypes() {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("✓ MongoDB connected\n");

    // Get sample of sessions
    const sessions = await RevitSession.find({}).lean();
    console.log(`Found ${sessions.length} total sessions`);

    if (sessions.length === 0) {
      console.log("No sessions found in database");
      await mongoose.disconnect();
      return;
    }

    // Assign network types: 60% WiFi, 40% Ethernet randomly
    const updates = sessions.map((session, index) => ({
      updateOne: {
        filter: { _id: session._id },
        update: {
          $set: {
            networkConnectionType: Math.random() < 0.6 ? "Wi-Fi" : "Ethernet",
          },
        },
      },
    }));

    // Execute bulk updates
    const result = await RevitSession.bulkWrite(updates);
    console.log(`\n✓ Updated ${result.modifiedCount} sessions`);

    // Show statistics
    const wifiCount = await RevitSession.countDocuments({
      networkConnectionType: "Wi-Fi",
    });
    const ethernetCount = await RevitSession.countDocuments({
      networkConnectionType: "Ethernet",
    });

    console.log(`  - WiFi: ${wifiCount} sessions`);
    console.log(`  - Ethernet: ${ethernetCount} sessions`);

    await mongoose.disconnect();
    console.log("\n✓ Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

populateNetworkTypes();
