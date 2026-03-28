const STORAGE_KEY = "markdown-party-theme";

type Theme = "light" | "dark" | "system";

const THEMES: Theme[] = ["system", "light", "dark"];

const getStoredTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
};

const getEffectiveTheme = (theme: Theme): "light" | "dark" => {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyTheme = (theme: Theme) => {
  const effective = getEffectiveTheme(theme);
  document.documentElement.classList.toggle("dark", effective === "dark");
};

export const initializeTheme = () => {
  const theme = getStoredTheme();
  applyTheme(theme);

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    });
};

export const cycleTheme = (): Theme => {
  const current = getStoredTheme();
  const nextIndex = (THEMES.indexOf(current) + 1) % THEMES.length;
  const next = THEMES[nextIndex] ?? "system";
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
};

export { getStoredTheme };
export type { Theme };
