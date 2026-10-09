-- Seed a pre-device-association database with two users, devices and live sessions.
INSERT INTO "User" ("id", "userId", "passwordHash", "updatedAt")
VALUES ('migration-user-a', 'migration-user-a', 'test-only', CURRENT_TIMESTAMP),
       ('migration-user-b', 'migration-user-b', 'test-only', CURRENT_TIMESTAMP);

INSERT INTO "Device" ("userId", "deviceId", "name", "activePrefix", "createdAt", "lastUsedAt")
VALUES ('migration-user-a', 'device-a', 'Phone', 'prefix-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('migration-user-b', 'device-b', 'Laptop', 'prefix-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "AuthSession" ("id", "userId", "tokenHash", "expiresAt")
VALUES ('migration-session-a', 'migration-user-a', 'migration-token-a', '2099-01-01 00:00:00'),
       ('migration-session-b', 'migration-user-b', 'migration-token-b', '2099-01-01 00:00:00');
