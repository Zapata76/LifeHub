# LifeHub Recipes

App Angular dedicata all'Archivio Ricette.

## Script principali

- `npm start`: avvio locale (`ng serve`)
- `npm run build`: build produzione con base href `/umbertini/recipes/`
- `npm run deploy`: build + copia output in `c:\xampp\htdocs\LifeHub\recipes\`

## Integrazione

- Backend API: `../api/recipes.php`
- Meal Plan usa le ricette tramite `../api/meals.php`
- Flusso: `Ricetta -> Meal Plan -> Lista Spesa`
