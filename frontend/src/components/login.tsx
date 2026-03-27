import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);
      setUser(result.user);
      setShowWelcome(true);

      // Show welcome message for 1.5 seconds then navigate
      setTimeout(() => {
        navigate("/");
      }, 1500);
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Welcome screen overlay
  if (showWelcome) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white mb-2">Welcome!</h2>
          <p className="text-lg text-white/80">
            Getting your dashboard ready...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">CBT Vision</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>

        {/* Main Card */}
        <Card className="p-6 border">
          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@cbtarchitects.com"
                disabled={isLoading}
                required
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isLoading}
                  required
                  className="h-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full h-9">
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} CBT Digital Practice. All rights
          reserved.
        </p>
      </div>
    </div>
  );
}
