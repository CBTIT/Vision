import mongoose, { Schema } from "mongoose";
const UserMappingsSchema = new Schema({
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
}, {
    versionKey: false,
});
const UserMappings = mongoose.model("UserMappingSchema", UserMappingsSchema, "user_mappings");
export default UserMappings;
