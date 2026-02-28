# Life Hub

**Life Hub** is designed as a complete "Family Operating System": a central organizational hub for your household, a shared knowledge base, and a personal growth system. 

It is built with a modular architecture centered around shared entities: Users, Roles, Tags, and Attachments. 

## Features

- **Household Organization**: Keep track of calendars, shopping lists, meals, recipes, and tasks in one place.
- **Role-based Access**: Custom permissions based on user roles (Admin, Adult, Child).
- **Dark Theme**: Modern and responsive UI with a default dark mode layout.
- **Cross-module Integration**: Links between recipes and meal plans/shopping lists, etc.
- **Legacy Compatibility**: The PHP backend is compatible with older environments (PHP 5.3+) while the frontend is a modern Angular application.

## Tech Stack

### Frontend (`LifeHubFE/`)
- **Framework**: Angular 11
- **Styling**: Pure CSS (no heavy CSS frameworks)
- **Architecture**: Single Page Application (SPA)

### Backend (`LifeHubBE/`)
- **Language**: PHP 5.3+ (Fully compatible with PHP 5.5.38)
- **Database**: MySQL / MariaDB
- **Security**: Prepared statements (MySQLi), MD5 hashing (with `password_verify()` preparation), HTTPS enforced.

---

## Directory Structure

```text
/
├── LifeHubBE/           # PHP Backend API
│   ├── api/             # End-points (auth, calendars, meals, notes, recipes, shopping, tasks, users)
│   ├── includes/        # Core files (db.php, config.php, auth.php)
│   └── .htaccess        # CORS rules and rewrite conditions
│
└── LifeHubFE/           # Angular 11 Frontend
    ├── src/             # Source code (Components, Services, Routing, Guards)
    ├── config/          # Build and deployment configurations
    └── scripts/         # Node.js scripts for automated builds
```

---

## Users & Roles

Life Hub starts with three primary roles, extensible in the future:

| Role  | Permissions |
|-------|-------------|
| **Admin** | Full access to all sections, including User Management. |
| **Adult** | Full access to all sections, excluding User Management. |
| **Child** | Limited access to specific sections (excluding sensitive modules and User Management). |

Permissions are handled both on the Frontend (via Angular `RoleGuard`) and Backend (API checks).

---

## Installation & Setup

### 1. Database
1. Create a MySQL database (e.g., `lifehub`).
2. Import the initial database schema (you can find the structure in the backend folder or use the provided SQL script).
3. Add users.

### 2. Backend (`LifeHubBE`)
1. Place the `LifeHubBE` folder in your web server's document root (e.g., Apache, Nginx).
2. Configure your database connection in `LifeHubBE/includes/config.php` and `db.php` (if applicable).
3. Ensure the web server has write permissions to any required upload directories.

### 3. Frontend (`LifeHubFE`)
1. Navigate to the `LifeHubFE` folder:
   ```bash
   cd LifeHubFE
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. **Local Configuration**:
   - Copy `config/deploy.example.json` to `config/deploy.local.json` and set your `baseHref` (e.g., `/lifehubfe/`).
   - Copy `src/assets/runtime-config.example.json` to `src/assets/runtime-config.json` and set your `appTitle` and `calendarOptions`.
4. Run the development server:
   ```bash
   npm start
   ```
   *The application will be available at `http://localhost:4200/`.*
5. To build for production:
   ```bash
   npm run build
   ```
   *The output will be in the `dist/` folder.*

---

## Security Notes

- **Authentication**: Requires username and password login. The session timeout is configured to 3 days.
- **Session Protection**: Implements automatic redirect if unauthenticated, logout with session destruction, and session regeneration after login.
- **Data Safety**: All database queries use prepared statements, and outputs are sanitized.

---

## Roadmap

- **Phase 1**: Core architecture consolidation
- **Phase 2**: Document archive & Inventory management
- **Phase 3**: Recipes, Meal Planner, and Shopping integration
- **Phase 4**: Goals & Trackers
- **Phase 5**: Central dashboard with summary widgets
