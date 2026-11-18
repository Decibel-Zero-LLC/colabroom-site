# Campaign images

Original campaign art generated with OpenAI's image-generation tool on 22 October
2026 for the website redesign. The people are fictional; these are atmospheric
illustrations, not photographs of customers, testimonials, or product screenshots.
No third-party brand assets were used.

- `campaign-studio.webp`: 1672 × 941, 91,994 bytes. Adult guitarist in an intimate
  studio, another musician softly in the background; negative space at left,
  midnight blue and cyan rim light, subtle haze. Used for the home invitation
  and the Rooms setting. Converted from the generated PNG with `cwebp -q 84`.
- `campaign-together.webp`: 1672 × 941, 123,640 bytes. Three fictional adult
  musicians—voice, acoustic guitar and keyboard—creating a song in a rehearsal
  studio. Blue-hour light, restrained cyan and warm practical highlights.
  Converted from the generated PNG with `cwebp -q 82`.

Both prompts requested original cinematic editorial photography, natural hands
and instruments, tactile materials, no logos, no lettering, no watermark and no
interface. The second explicitly requested fictional adults without celebrity
resemblance. Original PNGs are retained in the designer's local generation
archive; the site ships only the compressed WebP files.

## Actual app screens — 18 November 2026

`app-account.png`, `app-profile.png` and `app-team.png` are unchanged captures
from the app's render harness (`test_render/` in CoLabRoom-Flutter), drawn at
390 × 844 at text scale 1 from commit
`8545b60d72621216ec186e1391226c89c1ac8160` on the local branch
`feat/tools-and-the-desk`, which contains the 17 November test build
(`ec2eed27`). They replace the 24 October captures of the older interface.

- Account: `account_is_you_test.dart`, state `account`.
- A profile: `the_profile_test.dart`, the phone case.
- A team: `the_team_pages_and_stage_test.dart`, state `team`.

The harness tests were run from copies kept in the app's ignored `build/`
folder, changed only to draw at 390 × 844 and, for the profile, to wait for
the app's serif before the capture (the stock profile test draws the name as
blank boxes). Nothing was committed in the app repository.

They use the harness's synthetic people, rooms and accounts. They are not
customer data, real people or endorsements. The images have not been
retouched, recomposed or cropped, and are kept as the harness wrote them: at
144,602 bytes together they are already smaller than the set they replace,
so they were not re-encoded. They load lazily on the relevant pages.
`app-screens.json` records each source, the commit, exact bytes and SHA-256.

These captures show three screens only. The site's drawn pictures elsewhere
(the sample song, the room card, the stands) are the site's own
illustrations, not app screens.

## Shared blue fog — 25 October 2026

`site-fog.jpg` is the unchanged 1024 × 1536, 120,326-byte JPEG approved for the
login atmosphere concept on 21 October 2026, reused at Taylor's request for
slow, subtle fog throughout the website. SHA-256:
`3c476263405f99d47906e7650ffb636c324abb3a6ec6dc6cdaa95562edfbe5e4`.

Source: `handover/design/ui-pass-2026-10-21/login-haze-preview.jpg` in the
`codex-ui-2026-10-21` app design worktree; its adjacent README documents the
original image-generation prompt and encoding. It is original generated
atmospheric art, with no logo, lettering, person or third-party brand asset.
The original PNG is preserved at
`/Users/tsw/code/colabroom/archive/ui-pass-2026-10-21/login-texture/generated-original.png`.
This copy has no crop, retouching, compositing or encoding changes. The browser
composites two low-opacity instances; no additional images or dependencies are
loaded. The texture remains still without JavaScript or with reduced motion,
and is absent in print. Legal pages and public records use a quieter opacity.

## Site icons — 10 November 2026

The tab icon, the home-screen icon and the logo in the home page's data are
the app's own mark, so search results, a phone's home screen and the stores
show one drawing. Nothing was redrawn.

- `logo-512.png` (repository root): a byte-for-byte copy of
  `web/icons/Icon-512.png` in CoLabRoom-Flutter at `origin/main`
  `9c7808d0ab767f6315768b8960f48f6f43153276` (last changed in app PR #183,
  "A mark that is ours"). 512 × 512 PNG. SHA-256:
  `c8cb7345084872f49544fd485b57bc3bf98e15034a6d2ce42219a476802e8889`.
- `apple-touch-icon.png`: the same file scaled to 180 × 180 with macOS
  `sips -z 180 180`. No other change.
- `favicon.ico`: the same file scaled to 16, 32 and 48 px with `sips`, the
  three PNGs packed unchanged into one icon file.
- `favicon.svg`: a byte-for-byte copy of `assets/icon/launcher_icon.svg` in
  the same app commit, which is the hand-copy of the app's
  `CoLabRoomMarkPainter` that CI rasterises for the Android and iOS icons.

If the mark in the app changes, replace all four from the new app files.

## The testers' door — 17 November 2026

`the-door/waiting-{tall,mid,wide}.webp` and `the-door/open-{tall,mid,wide}.webp`
are stills of the room behind `test.html`, taken from the page's own WebGL
renderer (`canvas.toDataURL('image/webp', 0.9)`) at 390 × 844, 820 × 1180 and
1440 × 900. Nothing in them is photographed or generated elsewhere. They are
the first paint, the no-WebGL picture and the reduced-motion picture; retake
them whenever the room's look changes, so the still and the living room stay
the same place.
