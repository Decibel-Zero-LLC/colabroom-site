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
