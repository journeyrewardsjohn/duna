# Public site imagery: credits

Every file here is an **illustration, not a customer**: generated people of
adult age, fictional and non-identifiable, with no logos or text. They show
the sport; they are never captioned as Duna members, clubs or customers, and
the site labels each photograph "Generated image". Provenance is also logged
in `apps/web/public/media/brand/imagery-log.json` (`site/*` rows).

Stills: Higgsfield, model `nano_banana_2_1` (2k), from the prompts in
`docs/design/website.md` section 5 with the shared grade ("warm sand
highlights, deep blue-teal shadows, lifted blacks, muted, film grain. No text,
no logos, no watermark."). Each was resized to 2,000 px on its long side and
encoded as WebP (quality 78); `next/image` serves AVIF and WebP at each width
from it, with a blur placeholder.

Clips: Higgsfield, model `seedance_2_5` (omni reference from the still, 5 s,
720p, no audio), H.264, no audio track, `faststart`; each under 500 KB.

| File                      | Job id                               | What it shows                                       | Status                       |
| ------------------------- | ------------------------------------ | --------------------------------------------------- | ---------------------------- |
| `hero-portrait.webp`      | 85f8a76a-5130-4269-9122-33d3b77035c1 | A beach player resting between rallies              | Illustration, not a customer |
| `beach-attack.webp`       | 6e7cac07-2409-4931-a465-da30ed5f5fca | A doubles attack over the block at golden hour      | Illustration, not a customer |
| `partners-lowfive.webp`   | 6ca68ae4-fca6-49e6-8d3c-df47f319f50a | Two partners touching hands after a point           | Illustration, not a customer |
| `indoor-serve.webp`       | 30012d6f-cce9-4f93-b344-1ac464d35950 | A jump serve in a gym at night                      | Illustration, not a customer |
| `coach-morning.webp`      | 7906d958-d80a-4d25-9246-72ecb22161d2 | A coach showing two adults a platform, morning haze | Illustration, not a customer |
| `friends-walk.webp`       | c621b5dd-6001-4c3e-a212-b7bfe6670c37 | Four friends walking to the nets at sunset          | Illustration, not a customer |
| `courts-first-light.webp` | 4da0872a-8e17-427a-8bc5-e31d2c507b66 | Empty beach courts at first light                   | Illustration (no people)     |
| `dig-spray.webp`          | 98029778-9fca-4e38-8e85-bfceb273bfcc | A diving dig, sand in the air                       | Illustration, not a customer |
| `indoor-huddle.webp`      | 64e5ce36-75de-43fe-b0ac-5fb54259cd1a | An adult team huddle between sets                   | Illustration, not a customer |
| `watch-rest.webp`         | 5d7283de-093c-4e50-b100-187c67448123 | A player checking a blank watch, face out of frame  | Illustration, not a customer |
| `hero-loop.mp4`           | e435f10c-4c44-4fe8-b194-98ff4c78bd86 | A near-still breathing loop of `hero-portrait`      | Illustration, not a customer |
| `attack-loop.mp4`         | c39c9de5-386d-4e54-8943-9e5800a700d2 | A slow-motion attack from `beach-attack`            | Illustration, not a customer |

No file here comes from the BeachElite project, and none shows a real
person's likeness.
