# Duna surface map

Every Duna experience shares contracts and data, but each surface owns a
different job and release path.

| Surface                         | Primary audience                        | Runtime                       | Identity                                       | Data/API path                               |
| ------------------------------- | --------------------------------------- | ----------------------------- | ---------------------------------------------- | ------------------------------------------- |
| [Duna Web](WEB.md)              | Public visitors, players, parents, fans | Next.js on Vercel             | Public or WorkOS AuthKit                       | In-process tRPC caller and `/api/trpc` host |
| [Duna HQ](HQ.md)                | Owners, managers, coaches, staff        | Next.js on Vercel             | WorkOS organization session                    | In-process operator procedures              |
| [Duna Admin](ADMIN.md)          | Duna platform admins                    | Routes inside HQ              | WorkOS plus persisted platform role            | In-process admin procedures                 |
| [Duna Player](PLAYER.md)        | Players and guardians                   | Expo/React Native, EAS        | WorkOS OAuth/AuthKit with PKCE                 | Bearer-authenticated Web tRPC/API           |
| [Duna Pro](PRO.md)              | Mobile operators and coaches            | Expo/React Native, EAS        | WorkOS OAuth/AuthKit with organization context | Bearer-authenticated Web tRPC/API           |
| [Voice agents](VOICE_AGENTS.md) | Players, parents, coaches               | LiveKit agent workers         | Short-lived room token issued by Web/HQ        | Draft/transcript returned for human review  |
| [Shared platform](PLATFORM.md)  | All surfaces and integrations           | TypeScript workspace packages | Server-resolved actor/scope                    | Typed router, Drizzle/Neon, pure engines    |

## Cross-surface rule

A feature is not complete merely because one projection exists. Follow the
journey through every named consumer, the shared typed contract, persistence,
offline/retry behavior, authorization, and the release gate for each affected
runtime. Keep browser operator work in HQ and on-the-go operator work in Pro;
keep public/player journeys in Web and native Player; keep global controls in
Admin.

When a route, navigation model, deep link, app identifier, provider dependency,
or ownership boundary changes, update its surface guide in the same change.
