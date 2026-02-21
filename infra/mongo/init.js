/**
 * MongoDB initialization script for local Docker development.
 *
 * This file is mounted into the mongo container at:
 *   /docker-entrypoint-initdb.d/init.js
 *
 * It runs ONCE when the container first starts with an empty data volume.
 * It does NOT run on subsequent starts (the data directory already exists).
 *
 * Production note: In MongoDB Atlas, create collections and indexes via
 * the Atlas UI or Atlas CLI — this script is local dev only.
 */

// Switch to (or create) the application database
// eslint-disable-next-line no-undef
db = db.getSiblingDB('truthguard');

// Create a dedicated app user for the truthguard database.
// In production (Atlas), configure roles in the Atlas UI instead.
db.createUser({
  user: 'truthguard',
  pwd: 'truthguard_dev_password',
  roles: [{ role: 'readWrite', db: 'truthguard' }],
});

// ─── Collections ──────────────────────────────────────────────────────────────
// Creating collections explicitly lets us add validation schemas later.

db.createCollection('users');
db.createCollection('reports');
db.createCollection('events');        // Geospatial misinfo events (Phase 3)
db.createCollection('claims_vectors'); // Vector embeddings (Phase 2)
db.createCollection('feedback');      // User feedback on verdicts (Phase 6)
db.createCollection('preferences');   // User preferences (Phase 1)

// ─── Indexes ──────────────────────────────────────────────────────────────────

// users: unique email
db.users.createIndex({ email: 1 }, { unique: true });

// reports: lookup by URL + by user
db.reports.createIndex({ url: 1 });
db.reports.createIndex({ user_id: 1, created_at: -1 });

// events: 2dsphere for geospatial queries (Phase 3 heatmap)
db.events.createIndex({ location: '2dsphere' });
db.events.createIndex({ category: 1, timestamp: -1 });
db.events.createIndex({ timestamp: -1 });

// feedback: link to reports
db.feedback.createIndex({ report_id: 1 });
db.feedback.createIndex({ user_id: 1 });

print('TruthGuard MongoDB initialized successfully.');
print('Collections: users, reports, events, claims_vectors, feedback, preferences');
