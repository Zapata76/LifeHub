# Database

## Baseline

The complete schema is defined in
[database/lifehub.sql](../database/lifehub.sql). It uses the `lh_` prefix,
UTF-8 character encoding, and MyISAM tables compatible with the server
targeted by the project.

Initialization is allowed only on an empty database:

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub db:init:dry-run .\api\config\app.php
.\tools\php7433.ps1 .\api\bin\lifehub db:init .\api\config\app.php
```

The initial household, administrator, and primary shopping list are created
with `admin:create`.

## Data areas

| Area | Main tables |
|---|---|
| Identity | `lh_households`, `lh_users`, `lh_login_attempts` |
| Calendars | `lh_calendars`, `lh_user_calendars` |
| Activities | `lh_tasks` |
| Shopping | `lh_categories`, `lh_supermarkets`, `lh_products`, `lh_prices`, `lh_shopping_lists`, `lh_shopping_items` |
| Recipes and meals | `lh_recipes`, `lh_recipe_ingredients`, `lh_meal_plan`, `lh_meal_plan_recipes`, `lh_meal_shopping_exports` |
| Knowledge | `lh_notes`, `lh_documents`, `lh_inventory` |
| Goals | `lh_goals`, `lh_trackers`, `lh_goal_logs` |
| Files and relationships | `lh_attachments`, `lh_entity_relations` |
| Operations | `lh_operation_runs`, `lh_operation_steps`, `lh_audit_log` |

## Conventions

- Identifiers are auto-incrementing integers.
- `household_id` separates data belonging to different households.
- `version` columns implement optimistic concurrency control.
- `*_search` and `*_key` fields contain normalized values used for searching
  and uniqueness constraints.
- Dates persisted by the API are stored in UTC; presentation uses the
  configured time zone.
- Files are stored in private storage; the database retains metadata, hashes,
  and ownership links.

## Verification

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub db:inspect .\api\config\app.php
.\tools\php7433.ps1 .\api\bin\lifehub integrity .\api\config\app.php
```

`integrity` checks for orphaned references, missing files, inconsistencies
between attachments and storage, and application invariants.
