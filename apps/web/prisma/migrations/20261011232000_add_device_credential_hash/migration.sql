-- Existing devices remain registered but cannot authenticate without a credential.
ALTER TABLE "Device" ADD COLUMN "credentialHash" TEXT;
