import mongoose, { Schema } from "mongoose";

const PluginUseSchema = new Schema(
  {
    autodeskUserName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
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
