# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Backend (Node.js/Express)
- Start development server: `cd backend && npm run dev` (uses nodemon)
- Start production server: `cd backend && npm start`
- Install dependencies: `cd backend && npm install`

### Frontend (React Admin Dashboard)
- Start development server: `cd web-admin/zerothree-admin && npm start` (runs on port 3001)
- Build for production: `cd web-admin/zerothree-admin && npm run build`
- Run tests: `cd web-admin/zerothree-admin && npm test`
- Eject from CRA: `cd web-admin/zerothree-admin && npm run eject` (not recommended)

### Environment Variables
- Backend: Create a `.env` file in the `backend` directory based on the variables used in the code (PORT, database credentials, JWT secret, Cloudinary keys, etc.)
- Frontend: The React app uses environment variables prefixed with `REACT_APP_` if needed (currently none visible).

## Architecture Overview

### Backend (`/backend`)
- **Entry point**: `index.js` sets up Express middleware, routes, and starts the server.
- **Routes** (`/routes`): Separate route files for different entities:
  - `auth.js`: Authentication endpoints (login, registration)
  - `outlets.js`: Outlet data (nearby search, last visit)
  - `visits.js`: Visit logging and retrieval
  - `admin.js`: Administrative functions
  - `routes.js`: Route management (for riders)
  - `photos.js`: Photo upload handling (uses Cloudinary)
  - `sync.js`: Data synchronization endpoints
- **Database**: Uses `postgres.js` (direct PostgreSQL client) and `db.js` (Supabase client) for database interactions. Spatial queries (PostGIS) are used for location-based searches.
- **Middleware**: `authenticate.js` provides JWT-based authentication protection for routes.

### Frontend (`/web-admin/zerothree-admin`)
- **Bootstrapped with**: Create React App (React 19, React-Scripts 5)
- **State Management**: React's built-in state (useState, useEffect) and props drilling; no external state library (like Redux) observed.
- **Key Components** (`/src`):
  - `App.js`: Defines routes using `react-router-dom`
  - `Login.js`: Authentication page
  - `Dashboard.js`: Main dashboard view
  - `MapView.js`: Displays outlets on a Leaflet map with search/filter capabilities
  - `RidersView.js`: Manages rider data
  - `RoutesView.js`: Manages route data
  - `PhotoReviewView.js` & `PhotoUploadModal.js`: Handle photo upload and review
  - `Sidebar.js`: Navigation sidebar
- **Styling**: Custom CSS in `index.css`
- **Dependencies**: 
  - `leaflet` & `react-leaflet` for interactive maps
  - `axios` for HTTP requests to the backend
  - `react-router-dom` for client-side routing
  - `web-vitals` for performance monitoring
  - Testing library (`@testing-library/*`) for unit tests

### Data Flow
1. Frontend React app makes API calls to backend endpoints (e.g., `/api/v1/outlets/nearby`)
2. Backend processes requests, performs database queries (PostgreSQL/PostGIS), and returns JSON
3. Frontend updates state and re-renders components accordingly
4. Authentication: JWT tokens are stored in localStorage/JWT and sent via Authorization header

## Development Notes

### Testing
- **Backend**: No test script defined in `package.json` (currently `echo "Error: no test specified"`). Unit tests would need to be added.
- **Frontend**: Uses Jest via React-Scripts. Run tests with `npm test` in the frontend directory. Tests are likely written using `@testing-library/react`.

### Linting & Code Quality
- No ESLint configuration visible at the project root (only within node_modules). Consider adding an `.eslintrc` file for consistent code style.
- Frontend inherits Create React App's default ESLint settings (extends `react-app` and `react-app/jest`).

### Database
- Uses PostgreSQL with PostGIS extension for geospatial queries (seen in outlets route: `ST_Distance`, `ST_Point`, `ST_DWithin`).
- Connection managed via `postgres.js` (direct client) and `db.js` (Supabase wrapper).

### Security
- Backend uses `helmet`? Not observed; consider adding security middleware.
- Authentication uses JWT (`jsonwebtoken`).
- CORS enabled via `cors` middleware.
- Passwords hashed with `bcrypt`.

### Project Structure Tips
- When adding new backend features: Create a new route file in `/routes` and import it in `index.js`.
- When adding new frontend features: Add a new component in `/src` and register a route in `App.js`.
- Keep components small and focused; reuse presentational components where possible.

### Getting Started
1. Clone the repository
2. Set up backend:
   - `cd backend`
   - `npm install`
   - Create `.env` with required variables
   - `npm run dev`
3. Set up frontend:
   - `cd web-admin/zerothree-admin`
   - `npm install`
   - `npm start`
4. Access the admin dashboard at `http://localhost:3001`