# Bahuckel Neon Design System

A comprehensive guide for implementing a dark theme with customizable neon/glow effects for the Bahuckel chat application.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [CSS Variables & Tokens](#css-variables--tokens)
3. [Tailwind Configuration](#tailwind-configuration)
4. [Global Styles](#global-styles)
5. [Neon Glow Utilities](#neon-glow-utilities)
6. [Component Examples](#component-examples)
7. [Toggle System](#toggle-system)
8. [Customization Guide](#customization-guide)

---

## Design Philosophy

The Bahuckel neon theme combines Discord's familiar dark UI with cyberpunk-inspired glowing accents. Key principles:

- **Subtle by default**: Glow effects enhance, not overwhelm
- **User-controllable**: All neon effects can be toggled on/off
- **Performance-conscious**: Use CSS filters and box-shadows efficiently
- **Accessible**: Maintain WCAG contrast ratios even with glow effects

---

## CSS Variables & Tokens

Add these to your `globals.css` inside `:root`:

```css
/* ========================================
   BAHUCKEL NEON DESIGN SYSTEM
   ======================================== */

:root {
  /* ---- Base Dark Theme (Discord-inspired) ---- */
  --bg-primary: #313338;
  --bg-secondary: #2b2d31;
  --bg-tertiary: #1e1f22;
  --bg-hover: #3f4147;
  --bg-active: #43444b;
  
  --text-primary: #f2f3f5;
  --text-secondary: #b5bac1;
  --text-muted: #6d6f78;
  
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.12);
  
  /* ---- Neon Color Palette ---- */
  /* Primary Neon (Cyan/Blue - main accent) */
  --neon-primary: #00d4ff;
  --neon-primary-dim: #00a8cc;
  --neon-primary-glow: rgba(0, 212, 255, 0.6);
  --neon-primary-soft: rgba(0, 212, 255, 0.15);
  
  /* Secondary Neon (Purple/Violet) */
  --neon-secondary: #b24bff;
  --neon-secondary-dim: #9333ea;
  --neon-secondary-glow: rgba(178, 75, 255, 0.6);
  --neon-secondary-soft: rgba(178, 75, 255, 0.15);
  
  /* Accent Neon (Pink/Magenta) */
  --neon-accent: #ff2d92;
  --neon-accent-dim: #db2777;
  --neon-accent-glow: rgba(255, 45, 146, 0.6);
  --neon-accent-soft: rgba(255, 45, 146, 0.15);
  
  /* Success Neon (Green) */
  --neon-success: #00ff88;
  --neon-success-dim: #22c55e;
  --neon-success-glow: rgba(0, 255, 136, 0.6);
  --neon-success-soft: rgba(0, 255, 136, 0.15);
  
  /* Warning Neon (Orange/Yellow) */
  --neon-warning: #ffaa00;
  --neon-warning-dim: #f59e0b;
  --neon-warning-glow: rgba(255, 170, 0, 0.6);
  --neon-warning-soft: rgba(255, 170, 0, 0.15);
  
  /* Danger Neon (Red) */
  --neon-danger: #ff3355;
  --neon-danger-dim: #ef4444;
  --neon-danger-glow: rgba(255, 51, 85, 0.6);
  --neon-danger-soft: rgba(255, 51, 85, 0.15);
  
  /* ---- Glow Intensity Multipliers ---- */
  --glow-intensity: 1;
  --glow-spread: 20px;
  --glow-spread-lg: 40px;
  --glow-spread-xl: 60px;
  
  /* ---- Animation Timing ---- */
  --transition-fast: 150ms;
  --transition-normal: 250ms;
  --transition-slow: 400ms;
  
  /* ---- Neon Toggle State (1 = on, 0 = off) ---- */
  --neon-enabled: 1;
}

/* When neon is disabled */
[data-neon="off"] {
  --neon-enabled: 0;
  --glow-intensity: 0;
  --neon-primary: #5865f2;
  --neon-secondary: #9333ea;
  --neon-accent: #db2777;
  --neon-success: #22c55e;
  --neon-warning: #f59e0b;
  --neon-danger: #ef4444;
}
```

---

## Tailwind Configuration

Update your `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base theme
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary": "var(--bg-tertiary)",
        "bg-hover": "var(--bg-hover)",
        "bg-active": "var(--bg-active)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        
        // Neon colors
        neon: {
          primary: "var(--neon-primary)",
          "primary-dim": "var(--neon-primary-dim)",
          "primary-glow": "var(--neon-primary-glow)",
          "primary-soft": "var(--neon-primary-soft)",
          secondary: "var(--neon-secondary)",
          "secondary-dim": "var(--neon-secondary-dim)",
          "secondary-glow": "var(--neon-secondary-glow)",
          "secondary-soft": "var(--neon-secondary-soft)",
          accent: "var(--neon-accent)",
          "accent-dim": "var(--neon-accent-dim)",
          "accent-glow": "var(--neon-accent-glow)",
          "accent-soft": "var(--neon-accent-soft)",
          success: "var(--neon-success)",
          "success-dim": "var(--neon-success-dim)",
          "success-glow": "var(--neon-success-glow)",
          "success-soft": "var(--neon-success-soft)",
          warning: "var(--neon-warning)",
          "warning-dim": "var(--neon-warning-dim)",
          "warning-glow": "var(--neon-warning-glow)",
          "warning-soft": "var(--neon-warning-soft)",
          danger: "var(--neon-danger)",
          "danger-dim": "var(--neon-danger-dim)",
          "danger-glow": "var(--neon-danger-glow)",
          "danger-soft": "var(--neon-danger-soft)",
        },
      },
      boxShadow: {
        // Neon glow shadows
        "neon-primary": "0 0 var(--glow-spread) var(--neon-primary-glow), 0 0 calc(var(--glow-spread) * 2) var(--neon-primary-soft)",
        "neon-primary-lg": "0 0 var(--glow-spread-lg) var(--neon-primary-glow), 0 0 calc(var(--glow-spread-lg) * 2) var(--neon-primary-soft)",
        "neon-secondary": "0 0 var(--glow-spread) var(--neon-secondary-glow), 0 0 calc(var(--glow-spread) * 2) var(--neon-secondary-soft)",
        "neon-secondary-lg": "0 0 var(--glow-spread-lg) var(--neon-secondary-glow), 0 0 calc(var(--glow-spread-lg) * 2) var(--neon-secondary-soft)",
        "neon-accent": "0 0 var(--glow-spread) var(--neon-accent-glow), 0 0 calc(var(--glow-spread) * 2) var(--neon-accent-soft)",
        "neon-accent-lg": "0 0 var(--glow-spread-lg) var(--neon-accent-glow), 0 0 calc(var(--glow-spread-lg) * 2) var(--neon-accent-soft)",
        "neon-success": "0 0 var(--glow-spread) var(--neon-success-glow), 0 0 calc(var(--glow-spread) * 2) var(--neon-success-soft)",
        "neon-warning": "0 0 var(--glow-spread) var(--neon-warning-glow), 0 0 calc(var(--glow-spread) * 2) var(--neon-warning-soft)",
        "neon-danger": "0 0 var(--glow-spread) var(--neon-danger-glow), 0 0 calc(var(--glow-spread) * 2) var(--neon-danger-soft)",
        
        // Inset glows for inputs
        "neon-inset-primary": "inset 0 0 10px var(--neon-primary-soft), 0 0 var(--glow-spread) var(--neon-primary-glow)",
        "neon-inset-secondary": "inset 0 0 10px var(--neon-secondary-soft), 0 0 var(--glow-spread) var(--neon-secondary-glow)",
      },
      animation: {
        "neon-pulse": "neon-pulse 2s ease-in-out infinite",
        "neon-flicker": "neon-flicker 3s linear infinite",
        "glow-breathe": "glow-breathe 4s ease-in-out infinite",
      },
      keyframes: {
        "neon-pulse": {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.8", filter: "brightness(1.2)" },
        },
        "neon-flicker": {
          "0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%": { opacity: "1" },
          "20%, 21.999%, 63%, 63.999%, 65%, 69.999%": { opacity: "0.4" },
        },
        "glow-breathe": {
          "0%, 100%": { boxShadow: "0 0 20px var(--neon-primary-glow)" },
          "50%": { boxShadow: "0 0 40px var(--neon-primary-glow), 0 0 60px var(--neon-primary-soft)" },
        },
      },
      transitionDuration: {
        fast: "var(--transition-fast)",
        normal: "var(--transition-normal)",
        slow: "var(--transition-slow)",
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## Global Styles

Add these utility classes to `globals.css`:

```css
/* ========================================
   NEON UTILITY CLASSES
   ======================================== */

/* Base neon text glow */
.neon-text {
  text-shadow: 
    0 0 7px var(--neon-primary),
    0 0 10px var(--neon-primary),
    0 0 21px var(--neon-primary),
    0 0 42px var(--neon-primary-glow);
}

.neon-text-secondary {
  text-shadow: 
    0 0 7px var(--neon-secondary),
    0 0 10px var(--neon-secondary),
    0 0 21px var(--neon-secondary),
    0 0 42px var(--neon-secondary-glow);
}

.neon-text-accent {
  text-shadow: 
    0 0 7px var(--neon-accent),
    0 0 10px var(--neon-accent),
    0 0 21px var(--neon-accent),
    0 0 42px var(--neon-accent-glow);
}

/* Subtle text glow (for readability) */
.neon-text-subtle {
  text-shadow: 
    0 0 5px var(--neon-primary-soft),
    0 0 10px var(--neon-primary-soft);
}

/* Neon borders */
.neon-border {
  border: 1px solid var(--neon-primary);
  box-shadow: 
    0 0 5px var(--neon-primary-soft),
    inset 0 0 5px var(--neon-primary-soft);
}

.neon-border-secondary {
  border: 1px solid var(--neon-secondary);
  box-shadow: 
    0 0 5px var(--neon-secondary-soft),
    inset 0 0 5px var(--neon-secondary-soft);
}

.neon-border-accent {
  border: 1px solid var(--neon-accent);
  box-shadow: 
    0 0 5px var(--neon-accent-soft),
    inset 0 0 5px var(--neon-accent-soft);
}

/* Neon button base */
.neon-button {
  position: relative;
  background: transparent;
  border: 2px solid var(--neon-primary);
  color: var(--neon-primary);
  text-shadow: 0 0 5px var(--neon-primary-soft);
  box-shadow: 
    0 0 5px var(--neon-primary-soft),
    inset 0 0 5px var(--neon-primary-soft);
  transition: all var(--transition-normal) ease;
}

.neon-button:hover {
  background: var(--neon-primary-soft);
  box-shadow: 
    0 0 10px var(--neon-primary-glow),
    0 0 20px var(--neon-primary-soft),
    inset 0 0 10px var(--neon-primary-soft);
  text-shadow: 0 0 10px var(--neon-primary);
}

.neon-button:active {
  transform: scale(0.98);
  box-shadow: 
    0 0 5px var(--neon-primary-glow),
    inset 0 0 15px var(--neon-primary-soft);
}

/* Filled neon button variant */
.neon-button-filled {
  background: var(--neon-primary);
  border: none;
  color: var(--bg-tertiary);
  font-weight: 600;
  text-shadow: none;
  box-shadow: 
    0 0 10px var(--neon-primary-glow),
    0 0 20px var(--neon-primary-soft);
  transition: all var(--transition-normal) ease;
}

.neon-button-filled:hover {
  background: var(--neon-primary);
  box-shadow: 
    0 0 15px var(--neon-primary-glow),
    0 0 30px var(--neon-primary-glow),
    0 0 45px var(--neon-primary-soft);
  filter: brightness(1.1);
}

/* Secondary color variants */
.neon-button-secondary {
  border-color: var(--neon-secondary);
  color: var(--neon-secondary);
  text-shadow: 0 0 5px var(--neon-secondary-soft);
  box-shadow: 
    0 0 5px var(--neon-secondary-soft),
    inset 0 0 5px var(--neon-secondary-soft);
}

.neon-button-secondary:hover {
  background: var(--neon-secondary-soft);
  box-shadow: 
    0 0 10px var(--neon-secondary-glow),
    0 0 20px var(--neon-secondary-soft),
    inset 0 0 10px var(--neon-secondary-soft);
}

.neon-button-accent {
  border-color: var(--neon-accent);
  color: var(--neon-accent);
  text-shadow: 0 0 5px var(--neon-accent-soft);
  box-shadow: 
    0 0 5px var(--neon-accent-soft),
    inset 0 0 5px var(--neon-accent-soft);
}

.neon-button-accent:hover {
  background: var(--neon-accent-soft);
  box-shadow: 
    0 0 10px var(--neon-accent-glow),
    0 0 20px var(--neon-accent-soft),
    inset 0 0 10px var(--neon-accent-soft);
}

/* Neon input fields */
.neon-input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  transition: all var(--transition-normal) ease;
}

.neon-input:focus {
  outline: none;
  border-color: var(--neon-primary);
  box-shadow: 
    0 0 10px var(--neon-primary-soft),
    inset 0 0 5px var(--neon-primary-soft);
}

.neon-input::placeholder {
  color: var(--text-muted);
}

/* Neon cards/panels */
.neon-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  transition: all var(--transition-normal) ease;
}

.neon-panel:hover {
  border-color: var(--neon-primary-dim);
  box-shadow: 
    0 0 15px var(--neon-primary-soft),
    inset 0 0 5px rgba(0, 212, 255, 0.03);
}

/* Active/selected state glow */
.neon-active {
  border-color: var(--neon-primary) !important;
  box-shadow: 
    0 0 10px var(--neon-primary-glow),
    0 0 20px var(--neon-primary-soft) !important;
}

/* Status indicator dots with glow */
.neon-status-online {
  background: var(--neon-success);
  box-shadow: 0 0 8px var(--neon-success-glow);
}

.neon-status-idle {
  background: var(--neon-warning);
  box-shadow: 0 0 8px var(--neon-warning-glow);
}

.neon-status-dnd {
  background: var(--neon-danger);
  box-shadow: 0 0 8px var(--neon-danger-glow);
}

.neon-status-offline {
  background: var(--text-muted);
  box-shadow: none;
}

/* Server icon with neon ring on active */
.neon-server-icon {
  transition: all var(--transition-normal) ease;
}

.neon-server-icon:hover {
  transform: scale(1.05);
  box-shadow: 0 0 15px var(--neon-primary-soft);
}

.neon-server-icon.active {
  box-shadow: 
    0 0 0 3px var(--neon-primary),
    0 0 15px var(--neon-primary-glow);
}

/* Voice activity ring */
.neon-speaking {
  animation: speaking-pulse 0.8s ease-in-out infinite;
}

@keyframes speaking-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 var(--neon-success-glow);
  }
  50% {
    box-shadow: 
      0 0 0 4px var(--neon-success-glow),
      0 0 20px var(--neon-success-glow);
  }
}

/* Scrollbar styling */
.neon-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.neon-scrollbar::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
}

.neon-scrollbar::-webkit-scrollbar-thumb {
  background: var(--bg-hover);
  border-radius: 4px;
}

.neon-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--neon-primary-dim);
  box-shadow: 0 0 10px var(--neon-primary-soft);
}

/* ========================================
   CONDITIONAL NEON (respects toggle)
   ======================================== */

/* When neon is disabled, remove all glow effects */
[data-neon="off"] .neon-text,
[data-neon="off"] .neon-text-secondary,
[data-neon="off"] .neon-text-accent,
[data-neon="off"] .neon-text-subtle {
  text-shadow: none;
}

[data-neon="off"] .neon-button,
[data-neon="off"] .neon-button-secondary,
[data-neon="off"] .neon-button-accent,
[data-neon="off"] .neon-button-filled {
  box-shadow: none;
}

[data-neon="off"] .neon-button:hover,
[data-neon="off"] .neon-button-secondary:hover,
[data-neon="off"] .neon-button-accent:hover {
  box-shadow: none;
}

[data-neon="off"] .neon-input:focus {
  box-shadow: 0 0 0 2px var(--neon-primary-dim);
}

[data-neon="off"] .neon-panel:hover {
  box-shadow: none;
}

[data-neon="off"] .neon-server-icon:hover,
[data-neon="off"] .neon-server-icon.active {
  box-shadow: none;
  border: 2px solid var(--neon-primary);
}

[data-neon="off"] .neon-status-online,
[data-neon="off"] .neon-status-idle,
[data-neon="off"] .neon-status-dnd {
  box-shadow: none;
}

[data-neon="off"] .neon-speaking {
  animation: none;
  box-shadow: 0 0 0 2px var(--neon-success);
}
```

---

## Component Examples

### 1. Neon Button Component

```tsx
// components/ui/neon-button.tsx
import { forwardRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "accent" | "filled" | "ghost";
  size?: "sm" | "md" | "lg";
  glowIntensity?: "subtle" | "normal" | "intense";
}

const NeonButton = forwardRef<HTMLButtonElement, NeonButtonProps>(
  ({ className, variant = "default", size = "md", glowIntensity = "normal", children, ...props }, ref) => {
    const baseStyles = "relative font-medium rounded-lg transition-all duration-normal focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-primary";
    
    const variants = {
      default: "neon-button",
      secondary: "neon-button neon-button-secondary",
      accent: "neon-button neon-button-accent",
      filled: "neon-button-filled",
      ghost: "bg-transparent text-neon-primary hover:bg-neon-primary-soft",
    };
    
    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    };
    
    const glowStyles = {
      subtle: "[--glow-spread:10px]",
      normal: "[--glow-spread:20px]",
      intense: "[--glow-spread:30px]",
    };
    
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], glowStyles[glowIntensity], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

NeonButton.displayName = "NeonButton";

export { NeonButton };
```

### 2. Neon Input Component

```tsx
// components/ui/neon-input.tsx
import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface NeonInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const NeonInput = forwardRef<HTMLInputElement, NeonInputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "neon-input w-full px-4 py-2 rounded-lg",
          error && "border-neon-danger focus:border-neon-danger focus:shadow-neon-danger",
          className
        )}
        {...props}
      />
    );
  }
);

NeonInput.displayName = "NeonInput";

export { NeonInput };
```

### 3. Server Icon Component

```tsx
// components/ui/server-icon.tsx
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ServerIconProps {
  name: string;
  imageUrl?: string;
  isActive?: boolean;
  hasNotification?: boolean;
  onClick?: () => void;
}

export function ServerIcon({ name, imageUrl, isActive, hasNotification, onClick }: ServerIconProps) {
  const initials = name.slice(0, 2).toUpperCase();
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "neon-server-icon relative w-12 h-12 rounded-2xl bg-bg-tertiary flex items-center justify-center",
        "text-text-secondary font-semibold text-lg",
        "hover:rounded-xl",
        isActive && "active rounded-xl"
      )}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt={name} fill className="rounded-inherit object-cover" />
      ) : (
        <span className={cn(isActive && "text-neon-primary neon-text-subtle")}>{initials}</span>
      )}
      
      {/* Notification indicator */}
      {hasNotification && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-neon-danger rounded-full neon-status-dnd" />
      )}
      
      {/* Active indicator pill */}
      {isActive && (
        <span className="absolute -left-3 w-1 h-8 bg-neon-primary rounded-full shadow-neon-primary" />
      )}
    </button>
  );
}
```

### 4. User Status Avatar

```tsx
// components/ui/user-avatar.tsx
import { cn } from "@/lib/utils";
import Image from "next/image";

type Status = "online" | "idle" | "dnd" | "offline";

interface UserAvatarProps {
  src?: string;
  name: string;
  status?: Status;
  size?: "sm" | "md" | "lg";
  isSpeaking?: boolean;
}

export function UserAvatar({ src, name, status = "offline", size = "md", isSpeaking }: UserAvatarProps) {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };
  
  const statusSizes = {
    sm: "w-2.5 h-2.5 -bottom-0.5 -right-0.5",
    md: "w-3 h-3 -bottom-0.5 -right-0.5",
    lg: "w-4 h-4 bottom-0 right-0",
  };
  
  const statusColors = {
    online: "neon-status-online",
    idle: "neon-status-idle",
    dnd: "neon-status-dnd",
    offline: "neon-status-offline",
  };
  
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  
  return (
    <div className={cn("relative", sizes[size])}>
      <div
        className={cn(
          "w-full h-full rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden",
          "text-text-secondary font-medium",
          isSpeaking && "neon-speaking"
        )}
      >
        {src ? (
          <Image src={src} alt={name} fill className="object-cover" />
        ) : (
          <span className="text-sm">{initials}</span>
        )}
      </div>
      
      {/* Status indicator */}
      <span
        className={cn(
          "absolute rounded-full border-2 border-bg-secondary",
          statusSizes[size],
          statusColors[status]
        )}
      />
    </div>
  );
}
```

### 5. Channel Item

```tsx
// components/ui/channel-item.tsx
import { cn } from "@/lib/utils";
import { Hash, Volume2 } from "lucide-react";

interface ChannelItemProps {
  name: string;
  type: "text" | "voice";
  isActive?: boolean;
  unreadCount?: number;
  onClick?: () => void;
}

export function ChannelItem({ name, type, isActive, unreadCount, onClick }: ChannelItemProps) {
  const Icon = type === "text" ? Hash : Volume2;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md",
        "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
        "transition-all duration-fast",
        isActive && "bg-bg-active text-neon-primary neon-text-subtle"
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-neon-primary")} />
      <span className="truncate flex-1 text-left">{name}</span>
      
      {unreadCount && unreadCount > 0 && (
        <span className="px-1.5 py-0.5 text-xs font-bold bg-neon-danger text-white rounded-full min-w-[20px] text-center shadow-neon-danger">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
```

### 6. Message Composer

```tsx
// components/chat/message-composer.tsx
"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Paperclip, Smile, Send } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";

interface MessageComposerProps {
  channelName: string;
  onSend: (message: string) => void;
}

export function MessageComposer({ channelName, onSend }: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const handleSend = () => {
    if (message.trim()) {
      onSend(message.trim());
      setMessage("");
    }
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  return (
    <div className="px-4 pb-4">
      <div className={cn(
        "flex items-end gap-2 p-2 rounded-lg",
        "bg-bg-tertiary border border-border-subtle",
        "focus-within:border-neon-primary focus-within:shadow-neon-primary transition-all duration-normal"
      )}>
        {/* Attachment button */}
        <button className="p-2 text-text-muted hover:text-neon-primary transition-colors">
          <Paperclip className="w-5 h-5" />
        </button>
        
        {/* Input */}
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName}`}
          className={cn(
            "flex-1 bg-transparent resize-none text-text-primary placeholder:text-text-muted",
            "focus:outline-none max-h-32 min-h-[24px]"
          )}
          rows={1}
        />
        
        {/* Emoji button */}
        <button className="p-2 text-text-muted hover:text-neon-warning transition-colors">
          <Smile className="w-5 h-5" />
        </button>
        
        {/* Send button */}
        <NeonButton
          variant="filled"
          size="sm"
          onClick={handleSend}
          disabled={!message.trim()}
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </NeonButton>
      </div>
    </div>
  );
}
```

---

## Toggle System

### Neon Context Provider

```tsx
// contexts/neon-context.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type NeonTheme = "on" | "off";
type NeonColor = "cyan" | "purple" | "pink" | "green" | "orange";

interface NeonContextType {
  neonEnabled: boolean;
  toggleNeon: () => void;
  setNeonEnabled: (enabled: boolean) => void;
  neonColor: NeonColor;
  setNeonColor: (color: NeonColor) => void;
  glowIntensity: number;
  setGlowIntensity: (intensity: number) => void;
}

const NeonContext = createContext<NeonContextType | undefined>(undefined);

const colorPresets: Record<NeonColor, { primary: string; glow: string; soft: string }> = {
  cyan: {
    primary: "#00d4ff",
    glow: "rgba(0, 212, 255, 0.6)",
    soft: "rgba(0, 212, 255, 0.15)",
  },
  purple: {
    primary: "#b24bff",
    glow: "rgba(178, 75, 255, 0.6)",
    soft: "rgba(178, 75, 255, 0.15)",
  },
  pink: {
    primary: "#ff2d92",
    glow: "rgba(255, 45, 146, 0.6)",
    soft: "rgba(255, 45, 146, 0.15)",
  },
  green: {
    primary: "#00ff88",
    glow: "rgba(0, 255, 136, 0.6)",
    soft: "rgba(0, 255, 136, 0.15)",
  },
  orange: {
    primary: "#ffaa00",
    glow: "rgba(255, 170, 0, 0.6)",
    soft: "rgba(255, 170, 0, 0.15)",
  },
};

export function NeonProvider({ children }: { children: ReactNode }) {
  const [neonEnabled, setNeonEnabled] = useState(true);
  const [neonColor, setNeonColor] = useState<NeonColor>("cyan");
  const [glowIntensity, setGlowIntensity] = useState(1);
  
  // Load preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("bahuckel-neon-prefs");
    if (saved) {
      const prefs = JSON.parse(saved);
      setNeonEnabled(prefs.enabled ?? true);
      setNeonColor(prefs.color ?? "cyan");
      setGlowIntensity(prefs.intensity ?? 1);
    }
  }, []);
  
  // Apply neon settings to document
  useEffect(() => {
    const root = document.documentElement;
    
    // Toggle attribute
    root.setAttribute("data-neon", neonEnabled ? "on" : "off");
    
    // Apply color preset
    const colors = colorPresets[neonColor];
    root.style.setProperty("--neon-primary", colors.primary);
    root.style.setProperty("--neon-primary-glow", colors.glow);
    root.style.setProperty("--neon-primary-soft", colors.soft);
    
    // Apply intensity
    root.style.setProperty("--glow-intensity", String(glowIntensity));
    root.style.setProperty("--glow-spread", `${20 * glowIntensity}px`);
    root.style.setProperty("--glow-spread-lg", `${40 * glowIntensity}px`);
    
    // Save to localStorage
    localStorage.setItem("bahuckel-neon-prefs", JSON.stringify({
      enabled: neonEnabled,
      color: neonColor,
      intensity: glowIntensity,
    }));
  }, [neonEnabled, neonColor, glowIntensity]);
  
  const toggleNeon = () => setNeonEnabled(prev => !prev);
  
  return (
    <NeonContext.Provider value={{
      neonEnabled,
      toggleNeon,
      setNeonEnabled,
      neonColor,
      setNeonColor,
      glowIntensity,
      setGlowIntensity,
    }}>
      {children}
    </NeonContext.Provider>
  );
}

export function useNeon() {
  const context = useContext(NeonContext);
  if (!context) {
    throw new Error("useNeon must be used within a NeonProvider");
  }
  return context;
}
```

### Settings Panel Component

```tsx
// components/settings/neon-settings.tsx
"use client";

import { useNeon } from "@/contexts/neon-context";
import { cn } from "@/lib/utils";

const colorOptions = [
  { value: "cyan", label: "Cyber Cyan", color: "#00d4ff" },
  { value: "purple", label: "Neon Purple", color: "#b24bff" },
  { value: "pink", label: "Hot Pink", color: "#ff2d92" },
  { value: "green", label: "Matrix Green", color: "#00ff88" },
  { value: "orange", label: "Amber", color: "#ffaa00" },
] as const;

export function NeonSettings() {
  const { neonEnabled, toggleNeon, neonColor, setNeonColor, glowIntensity, setGlowIntensity } = useNeon();
  
  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold text-text-primary">Neon Effects</h3>
      
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-primary">Enable Neon Glow</p>
          <p className="text-sm text-text-muted">Toggle glowing effects on UI elements</p>
        </div>
        <button
          onClick={toggleNeon}
          className={cn(
            "w-12 h-6 rounded-full transition-all duration-normal",
            neonEnabled 
              ? "bg-neon-primary shadow-neon-primary" 
              : "bg-bg-tertiary"
          )}
        >
          <span
            className={cn(
              "block w-5 h-5 rounded-full bg-white transition-transform duration-normal",
              neonEnabled ? "translate-x-6" : "translate-x-0.5"
            )}
          />
        </button>
      </div>
      
      {/* Color Selection */}
      <div className={cn(!neonEnabled && "opacity-50 pointer-events-none")}>
        <p className="text-text-primary mb-3">Neon Color</p>
        <div className="flex gap-3">
          {colorOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setNeonColor(option.value)}
              className={cn(
                "w-10 h-10 rounded-full border-2 transition-all duration-normal",
                neonColor === option.value
                  ? "border-white scale-110"
                  : "border-transparent hover:scale-105"
              )}
              style={{ 
                backgroundColor: option.color,
                boxShadow: neonColor === option.value 
                  ? `0 0 20px ${option.color}` 
                  : "none"
              }}
              title={option.label}
            />
          ))}
        </div>
      </div>
      
      {/* Intensity Slider */}
      <div className={cn(!neonEnabled && "opacity-50 pointer-events-none")}>
        <div className="flex justify-between mb-2">
          <p className="text-text-primary">Glow Intensity</p>
          <span className="text-text-muted">{Math.round(glowIntensity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="2"
          step="0.1"
          value={glowIntensity}
          onChange={(e) => setGlowIntensity(parseFloat(e.target.value))}
          className="w-full accent-neon-primary"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>Subtle</span>
          <span>Intense</span>
        </div>
      </div>
    </div>
  );
}
```

---

## Customization Guide

### Adding Custom Neon Colors

To add a new neon color, update:

1. **CSS Variables** in `globals.css`:
```css
--neon-custom: #your-color;
--neon-custom-dim: #your-darker-color;
--neon-custom-glow: rgba(r, g, b, 0.6);
--neon-custom-soft: rgba(r, g, b, 0.15);
```

2. **Tailwind Config**:
```typescript
neon: {
  custom: "var(--neon-custom)",
  "custom-dim": "var(--neon-custom-dim)",
  // ...
}
```

3. **Color Presets** in context:
```typescript
const colorPresets = {
  // ...existing
  custom: {
    primary: "#your-color",
    glow: "rgba(r, g, b, 0.6)",
    soft: "rgba(r, g, b, 0.15)",
  },
};
```

### Adjusting Glow Intensity Per-Component

Use CSS custom properties locally:
```tsx
<button style={{ "--glow-spread": "30px" }} className="neon-button">
  Extra Glow
</button>
```

### Creating Animated Neon Effects

Add custom keyframes:
```css
@keyframes neon-rainbow {
  0% { --neon-primary: #ff0000; }
  33% { --neon-primary: #00ff00; }
  66% { --neon-primary: #0000ff; }
  100% { --neon-primary: #ff0000; }
}

.neon-rainbow {
  animation: neon-rainbow 5s linear infinite;
}
```

---

## Quick Reference

### Class Names

| Class | Effect |
|-------|--------|
| `neon-text` | Primary color text glow |
| `neon-text-subtle` | Subtle text glow |
| `neon-button` | Outlined glow button |
| `neon-button-filled` | Filled glow button |
| `neon-input` | Input with focus glow |
| `neon-panel` | Card with hover glow |
| `neon-active` | Active/selected glow state |
| `neon-border` | Border with glow |
| `neon-server-icon` | Server icon with active ring |
| `neon-status-online` | Green status dot |
| `neon-speaking` | Voice activity pulse |
| `neon-scrollbar` | Styled scrollbar |

### Tailwind Shadows

| Class | Effect |
|-------|--------|
| `shadow-neon-primary` | Primary color glow shadow |
| `shadow-neon-primary-lg` | Large primary glow |
| `shadow-neon-secondary` | Secondary color glow |
| `shadow-neon-accent` | Accent color glow |
| `shadow-neon-success` | Success (green) glow |
| `shadow-neon-danger` | Danger (red) glow |

---

## Integration with Layout

Wrap your app with the NeonProvider:

```tsx
// app/layout.tsx
import { NeonProvider } from "@/contexts/neon-context";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-primary text-text-primary">
        <NeonProvider>
          {children}
        </NeonProvider>
      </body>
    </html>
  );
}
```

---

## Performance Notes

1. **Use `will-change` sparingly**: Only on elements that animate frequently
2. **Prefer `box-shadow` over `filter: drop-shadow()`**: Better performance
3. **Reduce glow spread on mobile**: Lower `--glow-spread` values
4. **Disable animations with `prefers-reduced-motion`**:
```css
@media (prefers-reduced-motion: reduce) {
  .neon-speaking,
  .animate-neon-pulse {
    animation: none;
  }
}
```

---

*Last updated: Bahuckel Neon Design System v1.0*
