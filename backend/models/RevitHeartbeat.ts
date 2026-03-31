import mongoose from "mongoose";

const openDocsSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    trim: true,
  },
  modelName: {
    type: String,
    required: true,
    trim: true,
  },
});

const revitHeartbeatSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true,
    trim: true,
  },
  machine: {
    type: String,
    required: true,
    trim: true,
  },
  revitVersion: {
    type: String,
    required: true,
    trim: true,
  },
  openDocs: {
    type: [openDocsSchema],
    default: [],
  },
  activeDocId: {
    type: String,
    default: null,
    trim: true,
  },
  activeDocName: {
    type: String,
    default: null,
    trim: true,
  },
  activeViewId: {
    type: String,
    default: null,
    trim: true,
  },
  activeViewName: {
    type: String,
    default: null,
    trim: true,
  },
  activeProjectName: {
    type: String,
    default: null,
    trim: true,
    index: true,
  },
  ts: {
    type: Date,
    required: true,
    index: true,
    expires: 180,
  },
});

export default mongoose.model(
  "RevitHeartbeat",
  revitHeartbeatSchema,
  "revit_heartbeat",
);
