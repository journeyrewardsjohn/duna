---
title: "Service Providers"
slug: "subprocessors"
audience: "Players, organizations and anyone reviewing how Duna handles personal information"
summary: "The companies that process personal information for Duna, what each one does, and where."
version: "1.0-draft"
effectiveDate: "[to be set when approved]"
lastUpdated: "2026-11-27"
---

# Service Providers

> **Draft for attorney review. Not in effect.** This is the one place in Duna's product copy where providers are named, because privacy law and our customers' contracts expect it.

> **The short version** (this summary does not replace the list below)
>
> - These companies run parts of Duna for us under contracts that limit how they use information.
> - Most process data in the United States.
> - We give organizations 30 days' notice before adding a new one.

## 1. How to read this list

Each provider processes personal information only to provide its service to Duna. "In use" means the service is configured in Duna today. "Optional" means it runs only if you or your organization turn on the feature. "Not active" means it is set up in code but not switched on; we list it so you know before it is.

## 2. Providers

| Provider                                | Purpose                                                                                                                                                | Data involved                                                 | Status                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| WorkOS, Inc.                            | Sign-in, accounts, organization membership and invitations                                                                                             | Name, email, sign-in identifiers                              | In use                                                                           |
| Stripe, Inc.                            | Payments, connected accounts for organizations, subscriptions, identity verification for payouts, sales tax calculation, in-person card payments       | Payment, billing, payout and identity verification data       | In use. Stripe also acts as an independent business under its own privacy policy |
| Vercel, Inc.                            | Application hosting for duna.coach and Duna HQ, scheduled jobs, file storage, and routing of AI requests to model providers                            | All data handled by the application                           | In use                                                                           |
| Neon, Inc. (Databricks)                 | Database hosting ("Duna Database")                                                                                                                     | All stored account and service data                           | In use                                                                           |
| Cloudflare, Inc.                        | Private storage of video, message attachments and analysis files; live video ingest and playback                                                       | Video, attachments                                            | In use (storage); live video optional                                            |
| Mux, Inc.                               | Video processing, playback and playback quality data                                                                                                   | Video, pseudonymous viewer data                               | In use [confirm; may be removed]                                                 |
| OpenAI, L.L.C.                          | AI models for Ask Duna, messaging safety screening, voice onboarding, transcription and website generation                                             | The content of AI requests                                    | In use; Junior content restricted                                                |
| Moonshot AI                             | Alternative AI model available to Duna's internal assistant                                                                                            | The content of AI requests                                    | Unconfirmed: allowed in configuration; confirm whether used                      |
| LiveKit, Inc.                           | Real-time voice sessions (voice onboarding, session notes)                                                                                             | Voice audio, transcripts                                      | In use [confirm hosting]                                                         |
| Higgsfield AI                           | Image and video generation from reference photos                                                                                                       | Reference photos, generated media                             | Optional                                                                         |
| Upstash, Inc.                           | Message delivery signals (no message content)                                                                                                          | Conversation identifiers                                      | In use                                                                           |
| Inngest, Inc.                           | Background job processing                                                                                                                              | Job identifiers and payloads                                  | Not active in production                                                         |
| Google LLC                              | Maps, places search and time zones (Google Maps Platform); video meeting links for virtual sessions (Google Workspace); optional livestream to YouTube | Addresses, venue searches; meeting attendees; stream metadata | Maps in use; Workspace and YouTube optional or not active                        |
| Mapbox, Inc.                            | Maps in the apps and on the web                                                                                                                        | Map views, approximate location                               | In use                                                                           |
| Tomorrow.io                             | Weather forecasts and match-time weather                                                                                                               | Venue locations and times                                     | In use                                                                           |
| Firecrawl                               | Reading public results pages and websites an organization points us to                                                                                 | Public web content                                            | In use                                                                           |
| Resend, Inc.                            | Transactional email                                                                                                                                    | Email address, message content                                | In use [confirm sender configured]                                               |
| Sent.dm                                 | Text message templates (invitations, alerts)                                                                                                           | Phone number, message content                                 | Not active in production                                                         |
| Sendblue                                | iMessage and text delivery for adult one-to-one club conversations                                                                                     | Phone number, message content                                 | Not active                                                                       |
| Expo (650 Industries, Inc.)             | Push notification delivery to the Duna apps                                                                                                            | Device push token, notification content                       | In use [confirm]                                                                 |
| Apple Inc.                              | Push notifications, Live Activities and Wallet passes; Apple Health is read on your device under Apple's terms                                         | Device tokens, pass data                                      | In use                                                                           |
| [GPU hosting provider, to be confirmed] | Video analysis worker                                                                                                                                  | Video frames, derived measurements                            | Unconfirmed: host not identified                                                 |

Twilio and other providers referenced in Duna's configuration but not used are not listed.

## 3. Location

Providers process data in the United States. Some providers may process limited data in other countries under their own safeguards. [Confirm per provider.]

## 4. Changes

We update this page before a new provider starts processing personal information, and notify organization owners who subscribe at least 30 days ahead. Contact privacy@duna.coach to subscribe or with questions.
