# SolarVisit

A full-stack field visit and appointment management platform for solar sales and technical teams.

SolarVisit was built to solve a real field-operations problem: organizing customer visits, reducing repetitive communication, improving route planning, and giving field engineers one place to manage the full appointment lifecycle.

## Why this project matters

Field teams often work across multiple tools for appointments, maps, customer notes, reminders, follow-up messages, and reporting. SolarVisit brings those workflows together into one application and automates the repetitive parts.

## Key Features

- Customer and appointment management
- Calendar-based visit planning
- Route optimization and geocoding
- Google Maps and Waze navigation links
- Automated appointment reminder workflows
- Thank-you SMS workflow after completed visits
- GPS-based arrival notifications
- Android companion application for SMS automation
- Customer status tracking
- Daily operational notes and summaries
- Reports and appointment statistics
- Offline customer cache support
- Supabase authentication, database, storage, and row-level security
- Responsive mobile-first React interface
- AI-assisted features for field workflows

## Architecture

```mermaid
flowchart LR
    A[React + Vite Web App] --> B[Supabase Auth]
    A --> C[Supabase Database]
    A --> D[Supabase Storage]
    A --> E[Vercel Serverless API]
    E --> F[Maps / Geocoding Services]
    E --> G[AI Services]
    E --> C
    H[Android SMS Companion] --> E
    H --> I[Device GPS]
    H --> J[Native SMS]
```

The web application handles the main field workflow and user interface. Supabase provides authentication, persistent data, storage, and security policies. Vercel API routes handle server-side integrations and automation logic. The Android companion supports native SMS sending, device registration, background jobs, and GPS-based arrival workflows.

## Tech Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 18, Vite, JavaScript, React Router |
| Backend | Vercel Serverless Functions |
| Database & Auth | Supabase |
| Mobile | Kotlin, Android, WorkManager |
| Location | Google Maps integrations, geocoding, route optimization |
| AI | Google GenAI integration |
| Deployment | Vercel |
| PWA | Vite PWA |

## Main Workflow

1. A field engineer creates or updates a customer appointment.
2. The appointment appears in the calendar and daily schedule.
3. Addresses can be geocoded and visits can be route-optimized.
4. Automated reminder jobs are created for upcoming appointments.
5. The Android companion can process approved SMS jobs.
6. GPS-based logic can notify customers when the engineer is approaching.
7. After a visit is completed, a follow-up / thank-you workflow can be triggered.
8. Reports and summaries provide visibility into field activity.

## Key Engineering Challenges

### Automated GPS Arrival Workflow

Designed a background Android workflow that combines appointment state, device GPS location, route ETA, scheduling rules, and customer status to decide when an arrival notification should be sent.

Key considerations included:

- Avoiding duplicate notifications
- Preventing notifications from being sent too early
- Handling cancelled or completed appointments
- Distinguishing stationary users from users already travelling
- Validating the appointment again immediately before sending
- Recording delivery status back to the backend

### Cross-Platform SMS Automation

Built a workflow where the React application and serverless backend manage communication jobs while an authenticated Android companion performs native SMS delivery.

The architecture separates:

- Message creation and queueing
- Device approval and identification
- SMS delivery
- Failure handling
- Delivery-status updates
- Appointment-state validation

This allows native device capabilities to be used without exposing server-side credentials in the web client.

### Route Optimization and Location Workflows

Implemented address geocoding, route optimization, navigation links, ETA-based logic, and location-aware appointment workflows.

The application uses location data not only for navigation, but also as an input into automation decisions such as customer arrival notifications.

### Offline and Field Reliability

Field applications cannot assume perfect connectivity. SolarVisit includes an offline customer cache and defensive error handling so previously loaded customer information remains available during temporary network interruptions.

### Secure Client / Server Separation

Sensitive operations are handled through server-side API routes rather than directly from the browser.

Examples include:

- Service-role database operations
- Protected SMS queue actions
- Server-side map integrations
- AI service calls
- Android companion authentication

The public repository contains only placeholder environment values and excludes production credentials.

### Real-World Business Logic

A major part of the project was translating operational rules into application logic rather than building only generic CRUD screens.

Examples include:

- Appointment status transitions
- Reminder scheduling
- Duplicate SMS prevention
- Arrival-notification timing
- Route-order handling
- Follow-up messages after completed visits
- Device authorization for SMS sending

## Repository Structure

```text
solar-visit-planner/
├── api/                  # Vercel serverless endpoints
├── android/              # Public Android companion architecture notes
├── src/
│   ├── components/       # Reusable React UI
│   ├── hooks/            # Application hooks
│   ├── i18n/             # Greek / English translations
│   ├── pages/            # Main application screens
│   ├── server/           # Server environment helpers
│   ├── services/         # Supabase, SMS, route, AI and data services
│   ├── styles/           # Global application styling
│   └── utils/            # Shared utilities
├── supabase/             # Schema and database migrations
├── .env.example
├── vercel.json
└── vite.config.js
```

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your own development credentials to `.env`, then run:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

## Environment Variables

The repository includes only placeholder values in `.env.example`.

Typical configuration includes:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GOOGLE_MAPS_API_KEY`
- `TWO_GIS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `ANDROID_COMPANION_SECRET`

Server-only secrets must never be exposed to the browser.

## Security & Privacy

This is a sanitized portfolio version of the project.

- No production customer data is included.
- No production API keys or authentication secrets are included.
- No employer branding or employer-specific contact information is included.
- Production deployment URLs and Android device credentials are excluded.
- Android signing files and local configuration are ignored by Git.

The public Android folder intentionally documents the architecture without exposing production device configuration.

## What this project demonstrates

SolarVisit demonstrates practical full-stack engineering across:

- Business-process automation
- React application architecture
- Authentication and database design
- Serverless APIs
- Geolocation and route workflows
- Background Android jobs
- Native SMS integration
- AI-assisted application features
- Security-conscious environment configuration
- Real-world field-operations UX

## Status

Portfolio / demonstration version. Production-specific configuration has intentionally been removed.

Screenshots from the app

<img width="1912" height="901" alt="8da03a47-c64b-43d8-a3b3-a7ad25a7f109" src="https://github.com/user-attachments/assets/a2e44196-42e8-4aaa-a5b2-2e01fcd2229e" />
<img width="1917" height="833" alt="image" src="https://github.com/user-attachments/assets/7182209a-07db-4dac-8b23-d27831fd0c8b" />
<img width="1917" height="903" alt="a5c1cdfa-061a-4890-9fc3-5b9fcd0201d8" src="https://github.com/user-attachments/assets/efddaaf2-cbae-4994-b278-320c99b20e35" />
<img width="1912" height="902" alt="907003b9-c180-4a28-8a4b-5b5a7c07c9b6" src="https://github.com/user-attachments/assets/51519267-1343-46ef-8d3e-c80a58282c45" />


