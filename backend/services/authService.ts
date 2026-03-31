import UserRegistered from "../models/UserRegistered.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const VALID_PROFILE_ICONS = [
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
] as const;

type ProfileIcon = (typeof VALID_PROFILE_ICONS)[number];

export interface AuthPayload {
  userId: string;
  email: string;
  fullName?: string;
  profileIcon?: string;
}

export const loginService = async (
  email: string,
  password: string,
): Promise<{
  token: string;
  user: {
    email: string;
    userId: string;
    fullName?: string;
    profileIcon?: string;
  };
}> => {
  const user = await UserRegistered.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new Error("User not found");
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new Error("Invalid password");
  }

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      fullName: user.fullName || undefined,
      profileIcon: user.profileIcon || "user",
    },
    process.env.JWT_SECRET!,
    { expiresIn: "14d" },
  );

  return {
    token,
    user: {
      email: user.email,
      userId: user._id.toString(),
      fullName: user.fullName || undefined,
      profileIcon: user.profileIcon || "user",
    },
  };
};

export const changePasswordService = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const user = await UserRegistered.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    throw new Error("Current password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.lastPasswordChange = new Date();
  await user.save();
};

export const getUserService = async (userId: string) => {
  const user = await UserRegistered.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return {
    email: user.email,
    userId: user._id.toString(),
    fullName: user.fullName || undefined,
    profileIcon: user.profileIcon || "user",
  };
};

export const updateProfileIconService = async (
  userId: string,
  profileIcon: string,
): Promise<void> => {
  if (!VALID_PROFILE_ICONS.includes(profileIcon as ProfileIcon)) {
    throw new Error("Invalid profile icon");
  }

  const user = await UserRegistered.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.profileIcon = profileIcon as ProfileIcon;
  await user.save();
};
