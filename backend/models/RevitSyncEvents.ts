import mongoose, { Schema } from "mongoose";

const RevitSyncEventSchema = new Schema(
  {
    dateTime: { type: Date, required: true },
    syncStartTime: { type: Date, required: true },
    syncEndTime: { type: Date, required: true },
    syncReadyTime: { type: Date, required: true },

    duration: { type: Number, default: 0 },
    gap: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 },

    fileName: { type: String, default: "" },
    cloudProjectName: { type: String, default: "" },
    autodeskUserName: { type: String, default: "" },

    revitSessionId: {
      type: Schema.Types.ObjectId,
      ref: "RevitSession",
      required: true,
    },

    modelId: { type: String, default: "" },
    projectId: { type: String, default: "" },
  },
  {
    versionKey: false,
  },
);

const RevitSyncEvent = mongoose.model(
  "RevitSyncEvent",
  RevitSyncEventSchema,
  "revit_sync_events",
);

export default RevitSyncEvent;
