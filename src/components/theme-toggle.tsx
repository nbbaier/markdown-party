import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cycleTheme, getStoredTheme, type Theme } from "@/lib/theme";

const ICON_SIZE = 18;

const themeConfig: Record<Theme, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: "System theme" },
  light: { icon: Sun, label: "Light theme" },
  dark: { icon: Moon, label: "Dark theme" },
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const handleCycle = () => {
    const next = cycleTheme();
    setTheme(next);
  };

  const config = themeConfig[theme];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button onClick={handleCycle} size="sm" type="button" variant="ghost">
          <Icon size={ICON_SIZE} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{config.label}</TooltipContent>
    </Tooltip>
  );
};
