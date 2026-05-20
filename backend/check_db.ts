import mongoose from "mongoose";
import dotenv from "dotenv";
import RevitHeartbeat from "./models/RevitHeartbeat.js";
import RevitSession from "./models/RevitSession.js";
import { connectDB } from "./db.js";

dotenv.config();

function normalizeModelId(value: string): string {
  return value.trim().replace(/^\{+|\}+$/g, "");
}

async function run() {
  await connectDB();

  const cutoff = new Date(Date.now() - 90 * 1000);
  console.log("Cutoff date:", cutoff.toISOString());

  const active = await RevitHeartbeat.find({
    dateTime: { $gt: cutoff },
    openDocs: { $ne: [] },
  }).lean();

  console.log(`Found ${active.length} active heartbeats:`);
  for (const hb of active) {
    console.log(`\n----------------------------------------`);
    console.log(`Heartbeat:`);
    console.log(`  User: ${hb.autodeskUserName}`);
    console.log(`  Machine: ${hb.machine}`);
    console.log(`  Revit: ${hb.revitVersion}`);
    console.log(`  Time: ${hb.dateTime.toISOString()}`);
    console.log(`  Open Docs:`, JSON.stringify(hb.openDocs, null, 2));

    if (Array.isArray(hb.openDocs)) {
      for (const od of hb.openDocs) {
        console.log(`  Doc: ${od.modelName} (sessionId / modelId: ${od.sessionId})`);
        
        // Find matching sessions in RevitSession collection
        const mid = normalizeModelId(od.sessionId).toLowerCase();
        const mName = hb.machine.trim().toLowerCase();
        const uName = hb.autodeskUserName.trim().toLowerCase();

        console.log(`  Searching sessions for modelId: "${mid}", machine: "${mName}", user: "${uName}"`);
        const sessions = await RevitSession.find({
          modelId: { $regex: `^\\{?${mid}\\}?$`, $options: "i" }
        }).sort({ dateTime: -1 }).lean();

        console.log(`    Found ${sessions.length} sessions for this model in total.`);
        if (sessions.length > 0) {
          console.log(`    Latest session overall:`);
          console.log(`      _id: ${sessions[0]._id}`);
          console.log(`      User: ${sessions[0].autodeskUserName}`);
          console.log(`      Machine: ${sessions[0].deviceName}`);
          console.log(`      Ready Time: ${sessions[0].openingReadyTime}`);
          console.log(`      DateTime: ${sessions[0].dateTime}`);
          console.log(`      Sync count: ${sessions[0].syncDatabaseIds?.length ?? 0}`);
          console.log(`      Closing Time: "${sessions[0].closingTime}"`);

          const matchBoth = sessions.filter(s => 
            s.deviceName.trim().toLowerCase() === mName && 
            s.autodeskUserName.trim().toLowerCase() === uName
          );
          console.log(`    Matching BOTH machine & user: ${matchBoth.length}`);
          if (matchBoth.length > 0) {
            console.log(`      Latest matching BOTH:`);
            console.log(`        _id: ${matchBoth[0]._id}`);
            console.log(`        Ready Time: ${matchBoth[0].openingReadyTime}`);
            console.log(`        DateTime: ${matchBoth[0].dateTime}`);
            console.log(`        Sync count: ${matchBoth[0].syncDatabaseIds?.length ?? 0}`);
            console.log(`        Closing Time: "${matchBoth[0].closingTime}"`);
          }

          const matchMachine = sessions.filter(s => 
            s.deviceName.trim().toLowerCase() === mName
          );
          console.log(`    Matching machine only: ${matchMachine.length}`);
        }
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
