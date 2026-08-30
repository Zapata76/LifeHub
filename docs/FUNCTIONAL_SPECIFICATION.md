# Functional specification

## Purpose

Life Hub is a private household space for organizing activities, information,
shopping, meals, and documents. All application data belongs to a household
and is accessible only to authorized users.

## Users and administration

- Username and password authentication.
- `admin`, `adult`, and `child` roles.
- Account activation and deactivation.
- Administrator-managed password resets.
- Association of users with shared calendars.
- Configuration of the application title and featured home-page text.
- Management of the Google Calendar registry.

## Home

- Summary of open activities, products to purchase, planned meals, and active
  goals.
- Links to available modules.
- Configurable application title and featured text.
- Access to project credits.

## Activities

- Kanban view with To Do, In Progress, and Done columns.
- Creation and editing through modal dialogs.
- Title, description, priority, due date, and assignee.
- Completion and archiving.
- Filtering by household member.

## Shopping list

- Shared list with quantities, immediate selection, and removal.
- Incremental product search.
- Supermarket filtering.
- Removal of already purchased items.
- Product, category, and supermarket registries.
- Product images uploaded from files or captured with the camera on supported
  devices.
- Price history grouped by product, supermarket, package size, and date.
- Explicit confirmation before deletion.

## Recipes

- Search and filtering by category and author.
- Title, category, duration, difficulty, instructions, and image.
- Structured ingredients that can be linked to products or entered as free
  text.
- Creation and editing through modal dialogs.
- Recipe archiving.

## Meal planner

- Weekly lunch and dinner planning.
- Navigation between weeks.
- Association of one or more recipes with each meal.
- Free-form meals, servings, and notes.
- Preview and controlled generation of shopping-list items.

## Notes

- Search by title, content, and author.
- Creation and editing through modal dialogs.
- Highlighting of pinned notes.
- Associated image or attachment.
- Browsable archive and restoration.

## Documents

- Private repository with title, category, dates, issuer, and notes.
- Attachment upload, download, and removal.
- Links to inventory items.
- Search and editing through modal dialogs.
- Deletion with confirmation.

## Inventory

- Search by name, location, and category.
- Owner, configurable household category, location, quantity, unit, status, dates, and notes.
- Category catalogue with create and rename actions; deleting a category moves its active and archived items to the protected `Altro` fallback.
- Existing category assignments are normalized through versioned `category_id` references.
- Link to a document.
- Attachments and images.
- Creation and editing through modal dialogs.
- Archiving.

## Calendars

- Separate or combined display of configured calendars.
- A distinct event color for each calendar.
- Shared creation workflow with the Admin section.
- Permanent deletion with confirmation.

## Goals

- Title, description, owner, time range, and status.
- Boolean, numeric, or percentage trackers with configurable frequency.
- Progress logging and completion indicator.
- Creation, editing, and deletion through modal dialogs.

## Attachments

- A single private storage area.
- Authorized downloads through the API.
- MIME type, file size, and ownership validation.
- Links to products, prices, recipes, notes, documents, and inventory items.
