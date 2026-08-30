# Android Companion

The production version of this project includes an Android companion application used for SMS automation and GPS-based arrival workflows.

For the public portfolio version, device-specific configuration, deployment URLs, phone numbers, and companion authentication secrets are intentionally excluded.

## Responsibilities

- Periodic background SMS queue checks with WorkManager
- SMS sending from an approved Android device
- GPS-based arrival detection
- Appointment reminder automation
- Device registration and approval flow
- SMS delivery status updates back to the web backend

The web application and server-side API in this repository expose the integration points used by the Android companion.
