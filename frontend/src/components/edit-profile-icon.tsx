import { useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { updateProfileIcon } from "../lib/api";

interface EditProfileIconProps {
  currentIcon: string;
  onSuccess: (icon: string) => void;
  onCancel: () => void;
}

const ICON_OPTIONS = [
  { id: "user", label: "User", emoji: "🙂" },
  { id: "cat", label: "Cat", emoji: "🐱" },
  { id: "dog", label: "Dog", emoji: "🐶" },
  { id: "bird", label: "Bird", emoji: "🐦" },
  { id: "fish", label: "Fish", emoji: "🐟" },
  { id: "feather", label: "Feather", emoji: "🪶" },
  { id: "bug", label: "Bug", emoji: "🐞" },
  { id: "snail", label: "Snail", emoji: "🐌" },
  { id: "turtle", label: "Turtle", emoji: "🐢" },
  { id: "rabbit", label: "Rabbit", emoji: "🐰" },
  { id: "squirrel", label: "Squirrel", emoji: "🐿️" },
  { id: "wolf", label: "Wolf", emoji: "🐺" },
  { id: "paw", label: "Paw", emoji: "🐾" },
  { id: "deer", label: "Deer", emoji: "🦌" },
  { id: "fox", label: "Fox", emoji: "🦊" },
];

export default function EditProfileIcon({
  currentIcon,
  onSuccess,
  onCancel,
}: EditProfileIconProps) {
  const [selectedIcon, setSelectedIcon] = useState(currentIcon);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (selectedIcon === currentIcon) {
      onCancel();
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await updateProfileIcon(selectedIcon);
      onSuccess(result.user.profileIcon || selectedIcon);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to update profile icon");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl p-6 border">
        <h2 className="text-2xl font-bold mb-6 text-foreground">
          Choose Your Avatar
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Icon Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
          {ICON_OPTIONS.map((option) => {
            const isSelected = selectedIcon === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setSelectedIcon(option.id)}
                disabled={isLoading}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-muted hover:border-muted-foreground/50"
                } disabled:opacity-50`}
                title={option.label}
              >
                <span className="text-3xl leading-none mb-1" aria-hidden="true">
                  {option.emoji}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 h-9"
          >
            {isLoading ? "Updating..." : "Save Avatar"}
          </Button>
          <Button
            onClick={onCancel}
            disabled={isLoading}
            variant="outline"
            className="flex-1 h-9"
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
