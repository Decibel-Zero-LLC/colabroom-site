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

## Actual app screens — 25 October 2026

`app-account.png`, `app-profile.png` and `app-team.png` are unchanged Flutter
render-test captures from the native Account, Profiles and Team redesigns,
present in app main `6c60b725f118bc2cae3a087554c4a9a14017ca38`.
They use synthetic example people, rooms and accounts, including an example.com
email address. They are not customer data or endorsements. Captions distinguish
these actual app layouts from the site's authored illustrations, and state that
the layouts are in testing; a merge does not put them on beta phones.

`app-screens.json` records each original repository path, exact bytes and SHA-256.
The images have not been retouched, recomposed or cropped. At 187,381 bytes in
total, they load lazily on the relevant pages. Source review reports are
`handover/reports/CODEX_ACCOUNT_NATIVE_2026-10-24.md`,
`CODEX_PROFILES_NATIVE_2026-10-24.md` and
`CODEX_TEAM_STAGE_NATIVE_2026-10-24.md` in the app repository.

These captures show only the native areas already adopted. Broader HTML design
proposals, specialized Open Mic work, the held playable-song game and whole-app
acceptance are not represented as completed native work.

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
