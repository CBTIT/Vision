import mongoose, { Schema } from "mongoose";
const RevitSessionSchema = new Schema({
    dateTime: { type: Date, required: true },
    openingStartTime: { type: Date, required: true },
    openingEndTime: { type: Date, required: true },
    openingReadyTime: { type: Date, required: true },
    openingDuration: { type: Number, default: 0 },
    openingGap: { type: Number, default: 0 },
    totalOpeningDuration: { type: Number, default: 0 },
    closingTime: { type: String, default: "" },
    sessionDuration: { type: String, default: "" },
    revitVersion: { type: String, default: "" },
    autodeskUserName: { type: String, default: "" },
    deviceUserName: { type: String, default: "" },
    deviceName: { type: String, default: "" },
    networkConnectionType: { type: String, default: "" },
    localIPAddress: { type: String, default: "" },
    cbtAssemblyVersion: { type: String, default: "" },
    cloudPlatform: { type: String, default: "" },
    cloudProjectName: { type: String, default: "" },
    fileName: { type: String, default: "" },
    filePath: { type: String, default: "" },
    modelId: { type: String, default: "" },
    projectId: { type: String, default: "" },
    crashStatus: { type: Boolean, default: false },
    fileSize: { type: Number, default: 0 },
    deviceFreeSpace: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    openWorksetCount: { type: Number, default: 0 },
    openWorksetNames: [{ type: String }],
    missingReferences: [{ type: String }],
    syncDatabaseIds: [{ type: Schema.Types.ObjectId }],
}, {
    versionKey: false,
});
// explicit collection name
const RevitSession = mongoose.model("RevitSession", RevitSessionSchema, "revit_sessions");
export default RevitSession;
