export const THEME_STORAGE_KEY = "porac-theme";

// Runs before first paint (inline in app/layout.tsx) so a saved dark choice
// never flashes light. Light stays the default; there is no system-preference
// auto-switch until the dark surfaces have been reviewed screen by screen.
export const themeInitScript = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;
