import mongoose, { Schema } from "mongoose";

const UserRegisteredSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: false,
      trim: true,
    },
    profileIcon: {
      type: String,
      default: "user",
      enum: [
        "user",
        "cat",
        "dog",
        "bird",
        "fish",
        "feather",
        "bug",
        "snail",
        "turtle",
        "rabbit",
        "squirrel",
        "wolf",
        "paw",
        "deer",
        "fox",
      ],
    },
    lastPasswordChange: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const UserRegistered = mongoose.model(
  "UserRegistered",
  UserRegisteredSchema,
  "users_registered",
);

export default UserRegistered;
