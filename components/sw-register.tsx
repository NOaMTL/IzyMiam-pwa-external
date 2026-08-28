"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (installabilité PWA + cache du shell).
 *
 * UNIQUEMENT en production : en dev, un SW servirait des pages/bundles d'un
 * build précédent (→ erreurs d'hydratation « fantômes »). En dev on
 * désenregistre aussi tout SW résiduel et on purge ses caches.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Nettoyage d'un SW installé par une session précédente.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => keys.forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // best-effort : la PWA fonctionne aussi sans SW
    });
  }, []);
  return null;
}
