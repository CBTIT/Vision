import React from "react";

const iconMap: Record<string, string> = {
  user: "🙂",
  cat: "🐱",
  dog: "🐶",
  bird: "🐦",
  fish: "🐟",
  feather: "🪶",
  bug: "🐞",
  snail: "🐌",
  turtle: "🐢",
  rabbit: "🐰",
  squirrel: "🐿️",
  wolf: "🐺",
  paw: "🐾",
  deer: "🦌",
  fox: "🦊",
};

export function getProfileIconComponent(
  iconName: string = "user",
  className: string = "h-8 w-8",
): React.ReactNode {
  const emoji = iconMap[iconName] || iconMap.user;
  return (
    <span
      className={`${className} inline-flex items-center justify-center text-base`}
    >
      {emoji}
    </span>
  );
}
