# EventPick Préparation (PWA)

PWA des **points de préparation** (ExternalPOS) : réception en quasi temps réel
des commandes qui les concernent, et traitement article par article.

## Fonctionnalités

- Connexion avec le compte du point de préparation (utilisateur rattaché à un
  ExternalPOS — endpoint `externalpos-app/auth/login` de l'API NEST).
- Board « À préparer / Terminées », rafraîchi toutes les 5 s (polling).
- **Alerte sonore + vibration + notification** à chaque nouvelle commande
  (activer via le bouton 🔔 — un geste utilisateur est requis par les
  navigateurs pour débloquer l'audio).
- Chaque commande n'affiche **que les articles du point** (scope serveur), avec
  les **variantes bien visibles** et la mention **PRÉCOMMANDE** + date de
  retrait le cas échéant.
- Toggle « préparé » par article (optimiste, rollback si échec réseau).
- Installable (manifest + service worker) sur Android/iOS/desktop.
- Déconnexion automatique si session expirée (401).

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner NEXT_PUBLIC_API_URL
npm run dev            # http://localhost:3020
```

## Déploiement

- Build : `npm run build` puis `npm start` (ou Vercel/équivalent).
- **CORS** : l'origine de la PWA doit être autorisée par l'API NEST
  (configuration des origines de `buildCorsOptions`).
- Servir en **HTTPS** (requis pour service worker + notifications).

## Comptes

Un « compte point de préparation » est un utilisateur dont `externalPOSId`
pointe vers l'ExternalPOS (géré via le panel admin — page Points de
préparation pour créer le point, et un utilisateur qui y est rattaché).
