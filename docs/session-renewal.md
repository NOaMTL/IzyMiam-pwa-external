# Session renouvelable External POS

La connexion demande `rememberMe: true`. Le backend fournit un JWT d'une heure et un secret de renouvellement dont seul le condensat est stocké dans la table Session existante. Le renouvellement prolonge la session de 30 jours : après 30 jours sans renouvellement, une reconnexion est nécessaire.

Sur HTTP 401, la PWA renouvelle la session puis rejoue une seule fois la requête. Les appels simultanés partagent un renouvellement. Les pannes réseau, HTTP 429 et 5xx conservent les identifiants pour la prochaine tentative. Une déconnexion locale interrompt la session immédiatement et tente de révoquer son renouvellement côté serveur, même pendant un renouvellement en cours. Hors ligne, cette révocation distante ne peut pas être garantie ; le JWT déjà émis expire au plus tard une heure après son émission.

Un changement de mot de passe, de client ou de point de préparation invalide le renouvellement. Les comptes, clients et points désactivés sont également refusés au renouvellement.

## Déploiement

Déployer d'abord le backend avec `/externalpos-app/auth/refresh` et `/logout`, puis la PWA. Aucune migration de base de données. Les anciennes applications sans `rememberMe` conservent leur contrat de connexion. Les sessions déjà ouvertes doivent se reconnecter une fois pour obtenir un jeton de renouvellement. Le cache du service worker passe à `prep-shell-v3`.

Vérifications : `npm test`, `npm run build`, et tests `externalpos-auth.service.spec.ts` du backend. Aucun changement de push, de filtrage Live/Test ou d'informations de livraison.
