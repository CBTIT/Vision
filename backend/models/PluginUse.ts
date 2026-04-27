import mongoose, { Schema } from "mongoose";

const PluginUseSchema = new Schema(
  {
    dateTime: { type: Date },
    autodeskUserName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    pluginName: {
      type: String,
      trim: true,
      default: "",
    },
    fileName: {
      type: String,
      trim: true,
      default: "",
    },
    cloudProjectName: {
      type: String,
      trim: true,
      default: "",
    },
    modelId: {
      type: String,
      trim: true,
      default: "",
    },
    projectId: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    versionKey: false,
  },
);

const PluginUse = mongoose.model(
  "PluginUseSchema",
  PluginUseSchema,
  "plugin_use",
);

export default PluginUse;
