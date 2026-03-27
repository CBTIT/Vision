import React, { useState } from "react";
import { createPortal } from "react-dom";
import { changePassword } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Eye, EyeOff } from "lucide-react";

interface ChangePasswordProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  show: boolean;
  onToggle: () => void;
  showCriteria?: boolean;
  isPasswordValid?: boolean;
  isLoading?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  value,
  onChange,
  show,
  onToggle,
  showCriteria,
  isPasswordValid,
  isLoading,
}) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-foreground">{label}</label>
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder="Enter password"
        disabled={isLoading}
        className="h-9 pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        disabled={isLoading}
        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        aria-label="Toggle password visibility"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
    {showCriteria && value.length > 0 && (
      <div
        className={`text-xs mt-1 ${isPasswordValid ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
      >
        {isPasswordValid
          ? "✓ Password meets requirements"
          : "✗ Minimum 8 characters required"}
      </div>
    )}
  </div>
);

export default function ChangePassword({
  onSuccess,
  onCancel,
}: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isPasswordValid = newPassword.length >= 8;
  const passwordsMatch =
    newPassword === confirmPassword && newPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Current password is required");
      return;
    }

    if (!isPasswordValid) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!passwordsMatch) {
      setError("New passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md p-6 border shadow-lg">
        <h2 className="text-2xl font-bold mb-6 text-foreground">
          Change Password
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput
            label="Current Password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            show={showCurrentPassword}
            onToggle={() => setShowCurrentPassword(!showCurrentPassword)}
            isLoading={isLoading}
          />

          <PasswordInput
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            show={showNewPassword}
            onToggle={() => setShowNewPassword(!showNewPassword)}
            showCriteria={true}
            isPasswordValid={isPasswordValid}
            isLoading={isLoading}
          />

          <PasswordInput
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            show={showConfirmPassword}
            onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
            isLoading={isLoading}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <div className="text-xs text-red-600 dark:text-red-400">
              ✗ Passwords do not match
            </div>
          )}
          {confirmPassword.length > 0 && passwordsMatch && (
            <div className="text-xs text-green-600 dark:text-green-400">
              ✓ Passwords match
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={
                isLoading ||
                !isPasswordValid ||
                !passwordsMatch ||
                !currentPassword
              }
              className="flex-1 h-9"
            >
              {isLoading ? "Updating..." : "Update Password"}
            </Button>
            <Button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              variant="outline"
              className="flex-1 h-9"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body,
  );
}
