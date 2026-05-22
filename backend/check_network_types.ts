import mongoose from "mongoose";
import RevitSession from "./models/RevitSession.js";

const mongoUri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/revit-db";

async function checkNetworkTypes() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    // Get stats on networkConnectionType field
    const totalSessions = await RevitSession.countDocuments({});
    const withNetworkType = await RevitSession.countDocuments({
      networkConnectionType: { $exists: true, $ne: "" },
    });
    const withoutNetworkType = await RevitSession.countDocuments({
      $or: [
        { networkConnectionType: { $exists: false } },
        { networkConnectionType: "" },
      ],
    });

    console.log(`\n=== Network Connection Type Statistics ===`);
    console.log(`Total sessions: ${totalSessions}`);
    console.log(`Sessions with networkConnectionType: ${withNetworkType}`);
    console.log(
      `Sessions without networkConnectionType: ${withoutNetworkType}`,
    );

    // Get unique network connection types
    const uniqueTypes = await RevitSession.distinct("networkConnectionType", {
      networkConnectionType: { $exists: true, $ne: "" },
    });
    console.log(`\nUnique connection types found:`);
    uniqueTypes.forEach((type) => {
      console.log(`  - "${type}"`);
    });

    // Sample some records with network types
    console.log("\n=== Sample Sessions ===");
    const samples = await RevitSession.find(
      { networkConnectionType: { $exists: true, $ne: "" } },
      {
        _id: 1,
        autodeskUserName: 1,
        deviceName: 1,
        networkConnectionType: 1,
      },
    )
      .limit(5)
      .lean();

    samples.forEach((session, index) => {
      console.log(`\nSession ${index + 1}:`);
      console.log(`  User: ${session.autodeskUserName}`);
      console.log(`  Device: ${session.deviceName}`);
      console.log(`  Network Type: ${session.networkConnectionType}`);
    });

    await mongoose.disconnect();
    console.log("\n✅ Check complete");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkNetworkTypes();
