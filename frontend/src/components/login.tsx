import React, { useEffect, useRef, useState } from "react";
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
  const networkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const navigate = useNavigate();
  const { setUser, authError } = useAuth();

  const isOverlayVisible = isLoading;

  useEffect(() => {
    if (!isOverlayVisible) {
      return;
    }

    const canvas = networkCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    type NetworkPoint = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      phase: number;
    };

    const points: NetworkPoint[] = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    let animationFrame = 0;

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const pointCount = Math.max(
        70,
        Math.min(140, Math.floor((width * height) / 18000)),
      );

      points.length = 0;
      for (let i = 0; i < pointCount; i += 1) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.42,
          vy: (Math.random() - 0.5) * 0.42,
          radius: 1 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };

    const drawFrame = (timestamp: number) => {
      context.clearRect(0, 0, width, height);

      const background = context.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#050505");
      background.addColorStop(1, "#1a1a1a");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const maxDistance = 150;
      const pulse = (Math.sin(timestamp * 0.0014) + 1) / 2;

      for (let i = 0; i < points.length; i += 1) {
        const pointA = points[i];

        pointA.x += pointA.vx;
        pointA.y += pointA.vy;

        if (pointA.x <= 0 || pointA.x >= width) {
          pointA.vx *= -1;
        }
        if (pointA.y <= 0 || pointA.y >= height) {
          pointA.vy *= -1;
        }

        pointA.x = Math.min(width, Math.max(0, pointA.x));
        pointA.y = Math.min(height, Math.max(0, pointA.y));

        for (let j = i + 1; j < points.length; j += 1) {
          const pointB = points[j];
          const dx = pointA.x - pointB.x;
          const dy = pointA.y - pointB.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > maxDistance) {
            continue;
          }

          const proximity = 1 - distance / maxDistance;
          const flicker =
            0.35 +
            0.65 *
              ((Math.sin(timestamp * 0.002 + pointA.phase + pointB.phase) + 1) /
                2);
          const alpha = proximity * 0.36 * (0.55 * pulse + 0.45 * flicker);

          context.strokeStyle = `rgba(235, 235, 235, ${alpha.toFixed(3)})`;
          context.lineWidth = proximity * 1.2 + 0.2;
          context.beginPath();
          context.moveTo(pointA.x, pointA.y);
          context.lineTo(pointB.x, pointB.y);
          context.stroke();
        }

        const pointGlow =
          0.45 + 0.35 * Math.sin(timestamp * 0.002 + pointA.phase);
        context.fillStyle = `rgba(255, 255, 255, ${(0.35 + pointGlow).toFixed(3)})`;
        context.beginPath();
        context.arc(pointA.x, pointA.y, pointA.radius, 0, Math.PI * 2);
        context.fill();
      }

      animationFrame = window.requestAnimationFrame(drawFrame);
    };

    resizeCanvas();
    animationFrame = window.requestAnimationFrame(drawFrame);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [isOverlayVisible]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);
      setUser(result.user);
      navigate("/");
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {isOverlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/60">
          <canvas
            ref={networkCanvasRef}
            className="login-network-canvas absolute inset-0"
          />
          <div className="absolute inset-0 login-network-vignette" />
          <div className="relative text-center px-6 py-7 rounded-2xl login-loading-panel">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-md">
              Connecting to Backend
            </h2>
            <p className="mt-3 text-sm sm:text-base font-semibold text-white/90">
              Please wait while we prepare your workspace...
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-white login-loading-dot login-loading-dot-1" />
              <span className="h-2.5 w-2.5 rounded-full bg-white login-loading-dot login-loading-dot-2" />
              <span className="h-2.5 w-2.5 rounded-full bg-white login-loading-dot login-loading-dot-3" />
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">CBT Vision</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>

        {/* Main Card */}
        <Card className="p-6 border">
          {/* Error Alert */}
          {(error || authError) && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive">
                {error || authError}
              </p>
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
