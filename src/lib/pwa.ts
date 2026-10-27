import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Registers the static-asset service worker in production builds only. */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  const reg = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  };
  if (document.readyState === "complete") reg();
  else window.addEventListener("load", reg, { once: true });
}

/** Install state for the Settings "Install app" control. */
export function useInstall() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  };
  return { canInstall: !!evt, installed, ios, install };
}
