# Déploiement sur GitHub Pages

Ce projet est configuré pour être déployé sur GitHub Pages de deux façons différentes.

## Option 1 : Déploiement Automatique avec GitHub Actions (Recommandé)

Le projet utilise GitHub Actions pour déployer automatiquement sur GitHub Pages à chaque push sur la branche `main`.

### Configuration

1. **Activer GitHub Pages dans les paramètres du repo**
   - Aller dans `Settings` → `Pages`
   - Dans "Build and deployment", sélectionner `Source: GitHub Actions`

2. **Push sur main**
   - Le workflow `.github/workflows/deploy.yml` se déclenchera automatiquement
   - Le site sera disponible à : `https://wait4code.github.io/soviet-calculator/`

### Déclenchement Manuel

Vous pouvez aussi déclencher le workflow manuellement :
- Aller dans `Actions` → `Deploy to GitHub Pages` → `Run workflow`

## Option 2 : Déploiement Manuel avec gh-pages

Si vous préférez déployer manuellement depuis votre machine locale :

```bash
# Build et déploie sur la branche gh-pages
npm run deploy
```

Cette commande :
1. Exécute `npm run build` (via `predeploy`)
2. Déploie le contenu de `dist/` sur la branche `gh-pages`

### Configuration pour gh-pages manuel

Si vous utilisez cette méthode, configurez GitHub Pages :
- Aller dans `Settings` → `Pages`
- Dans "Build and deployment", sélectionner `Source: Deploy from a branch`
- Sélectionner `Branch: gh-pages` et `/ (root)`

## Configuration Vite

Le fichier `vite.config.ts` contient :
```typescript
base: '/soviet-calculator/'
```

Cette configuration est nécessaire pour que les chemins des assets soient corrects sur GitHub Pages.

## Fichiers Importants

- `.github/workflows/deploy.yml` - Workflow GitHub Actions
- `public/.nojekyll` - Empêche Jekyll de traiter les fichiers
- `vite.config.ts` - Configuration du base path

## Développement Local

Pour tester le build localement avec le même base path :

```bash
npm run build
npm run preview
```

Le preview sera disponible à `http://localhost:4173/soviet-calculator/`

## Troubleshooting

### Le site ne charge pas les assets
- Vérifier que `base: '/soviet-calculator/'` est bien dans `vite.config.ts`
- Vérifier que le nom du repo correspond au base path

### GitHub Actions échoue
- Vérifier les permissions dans `Settings` → `Actions` → `General`
- S'assurer que `Workflow permissions` est sur "Read and write permissions"

### Le workflow ne se déclenche pas
- Vérifier que le push est bien sur la branche `main`
- Vous pouvez le déclencher manuellement depuis l'onglet Actions
