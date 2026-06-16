# Third-party notices

Curio's original source, documentation and demonstration fixtures are licensed under [MIT](LICENSE), copyright 2026 Johan Vaz. This grant does not relicense third-party software, fonts or external service content.

## Fonts

The application selects these fonts through `next/font/google` in `app/layout.tsx`. The build downloads font files from Google Fonts and serves the resulting assets with the app. Each font uses the SIL Open Font License 1.1; retain the copyright and license notices when distributing its files:

- **Bitter** — [upstream](https://github.com/google/fonts/tree/main/ofl/bitter), [retained OFL notice](docs/licenses/Bitter-OFL.txt).
- **IBM Plex Sans** — [upstream](https://github.com/google/fonts/tree/main/ofl/ibmplexsans), [retained OFL notice](docs/licenses/IBM-Plex-Sans-OFL.txt).
- **IBM Plex Mono** — [upstream](https://github.com/google/fonts/tree/main/ofl/ibmplexmono), [retained OFL notice](docs/licenses/IBM-Plex-Mono-OFL.txt).

The notice files were retrieved from those upstream directories on 11 September 2026; only line endings and trailing whitespace were normalized. Copyright holders and any reserved font names are stated in each notice.

## Dependencies and services

Direct dependencies include Next.js/React/Tailwind, Electron, Nano ID, TypeScript, the OpenAI SDK and the Anthropic SDK. They retain their upstream licenses and notices; exact installed versions and transitive dependencies are recorded in `package-lock.json`. Preserve the installed packages' license/notice files when redistributing a build. This summary is not a substitute for that dependency inventory.

OpenAI and Anthropic API access is governed separately by their service terms. No provider credentials or model-generated sample outcomes are bundled with the offline demonstration. Demonstration lesson text, model-response fixtures and annotations are original synthetic examples, not learner records or evidence of model accuracy.
