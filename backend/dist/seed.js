import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import UserRegistered from "./models/UserRegistered.js";
const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");
        // Clear existing users_registered collection
        await UserRegistered.deleteMany({});
        console.log("Cleared existing users");
        // Hash passwords
        const password1 = await bcrypt.hash("test1234", 10);
        const password2 = await bcrypt.hash("test1234", 10);
        const password3 = await bcrypt.hash("test1234", 10);
        // Seed users
        const users = [
            {
                email: "vincent@cbtarchitects.com",
                password: password1,
                fullName: "Rood Vincent",
                lastPasswordChange: new Date(),
            },
            {
                email: "paquette@cbtarchitects.com",
                password: password2,
                fullName: "William Paquette",
                lastPasswordChange: new Date(),
            },
            {
                email: "verma@cbtarchitects.com",
                password: password3,
                fullName: "Avinash Verma",
                lastPasswordChange: new Date(),
            },
        ];
        const createdUsers = await UserRegistered.insertMany(users);
        console.log(`✅ Seeded ${createdUsers.length} users`);
        createdUsers.forEach((user) => {
            console.log(`   - ${user.email}`);
        });
        await mongoose.disconnect();
        console.log("Database disconnected");
    }
    catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
};
seedDatabase();
