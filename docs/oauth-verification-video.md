# Record the Google OAuth verification video

Google needs to see the complete OAuth flow and every distinct product use of
the sensitive Google Analytics scope. Record the whole screen so the video
includes Google Cloud Console, the browser consent flow, and the `seo` terminal
commands.

Aim for two to four minutes. Keep the narration direct and the outputs bounded
and readable.

The functionality demonstration only needs to cover Google Analytics. The
`analytics.readonly` scope is sensitive, not restricted. The complete consent
screen still needs to be visible so Google can confirm that the grant matches
the scopes configured for the OAuth client.

Google exposes no narrower user OAuth scope for these features. The Google
Analytics Data API accepts `analytics.readonly` or the broader `analytics`
scope. The Admin API reads used here accept `analytics.readonly` or the broader
`analytics.edit` scope. The video must say this plainly.

## Check the complete demo before recording

The guided runner invokes the globally installed production package. It does
not use the uncommitted source build.

From the repository root run:

```sh
node scripts/oauth-verification-demo.mjs --print
```

## Generate the local voiceover

The automated recording can use Qwen3-TTS through MLX-Audio. Both run locally
on Apple Silicon. Ollama is not involved.

Generate all narration clips before recording:

```sh
node scripts/oauth-verification-demo.mjs --generate-voiceover
```

The first run creates an isolated Python environment with `uv` and downloads
the full 1.7 billion parameter bf16 model. This can take several minutes and
uses several gigabytes of local cache space. Later runs reuse the model and any
clips whose narration has not changed.

The default voice is Qwen3-TTS `Aiden`, with a calm and neutral delivery. To
regenerate with the other built-in English voice:

```sh
node scripts/oauth-verification-demo.mjs \
  --generate-voiceover \
  --tts-speaker Ryan
```

Clips and their manifest are stored outside the repository at
`~/Library/Caches/seo/oauth-verification-voiceover`. The narration text remains
reviewable in `scripts/oauth-verification-narration.json`.

Before recording, check the macOS permissions from Ghostty:

```sh
node scripts/oauth-verification-demo.mjs --automation-check
```

macOS may ask whether Ghostty can control Google Chrome, Ghostty, and System
Events. Allow those Automation prompts and enable Ghostty under **System
Settings > Privacy & Security > Accessibility**. Run the check again until it
reports that window automation is ready.

Check the property, site, and generated change date. Override them when needed:

```sh
node scripts/oauth-verification-demo.mjs \
  --property 123456789 \
  --site sc-domain:example.com \
  --url https://example.com \
  --change-date 2026-06-27
```

The runner creates a dedicated Chrome window, opens the Google Cloud Data Access
page, and creates a dedicated Ghostty window. Maximize both windows before
starting the recording. Google's OAuth redirect is the only new browser tab
expected during the run.

Each narration clip starts only after its prepared tab or terminal result is
visible. The runner positions long pages with Home and controlled scrolling.
Account selection, **Select all**, **Show all services**, and OAuth approval
remain manual. The runner waits for Google's local OAuth callback before it
continues.

The demo covers each distinct use of the scope:

| Google API use | User-facing feature shown |
| --- | --- |
| List account and property summaries | `seo analytics google properties` and project setup |
| List web streams and read their hostnames | Automatic Google Analytics matching in `seo start` |
| Read landing-page sessions, users, and conversions | Main report and direct Analytics report |
| Read source, date, landing-page, session, event, and user data | AI referral report |
| Read daily sessions, engagement, conversions, and revenue | Before and after SEO test report |

The MCP server and TypeScript library call the same core functions. The CLI
demonstration is enough to show the data access because those alternate
surfaces do not request extra scopes or call different Google methods.

## Prepare the recording

1. Close any private tabs, terminals, and applications you do not want in the
   recording.
2. Turn off notifications.
3. Check that Chrome and Ghostty are allowed under **System Settings > Privacy
   & Security > Screen & System Audio Recording**.
4. Check that the consent screen language is English.
5. Run the guided demo once without `--record` so a missing property or sparse
   report does not become a surprise halfway through.

The runner removes the local token before the recording starts. The published
OAuth flow already requests `prompt=consent`, so deleting the connection from
Google Account settings is not required to display the complete grant flow.

## Show the configured scope

Start on the Google Cloud Data Access page. Show the complete configured scope
list clearly. This provides the scope-matching evidence requested in the review
email.

The Cloud overview and OAuth client pages do not need to appear in this video.
The final scenes show the submitted Branding links and homepage.

## Run the guided recording

Start the runner from the repository root:

```sh
node scripts/oauth-verification-demo.mjs --launch --voiceover --record
```

It prepares dedicated Chrome and Ghostty windows, then waits. Maximize both
windows and press Return in Ghostty to start recording. It runs the sequence and
adds the local narration to the finished movie with `ffmpeg`. The default output is
`~/Desktop/seo-oauth-verification-YYYY-MM-DD.mov`.

The production `seo` command performs all application actions. The repository
script, local voice clips, and automation helpers only sequence and record
them.

The narrated recording does not print scene headings, narration, URLs, or
planning cues in the terminal. It shows only the real `seo` command and its
output. Use `--print` when you want to review the narration text.

Chrome and Ghostty are prepared before recording. Window creation, tab loading,
manual resizing, and the start prompt are not captured.

The narrated run advances automatically. During consent, choose the Google
account, choose **Select all** if it appears, expand **Show all services**, pause
while every permission is readable, then approve the grant. If setup finds more
than one matching Google Analytics property, choose the demonstration property
in the terminal. Those visible manual steps are part of Google's review
evidence.

The login command waits for Google's OAuth callback, so the next scene starts
only after you approve the grant. Terminal selection prompts also wait for your
choice. Run a rehearsal without recording with:

```sh
node scripts/oauth-verification-demo.mjs \
  --launch \
  --voiceover
```

The remaining sections explain what the reviewer should see during each scene.

## Start from a logged-out command

Before recording, the runner silently removes the local OAuth token. The
recording starts by showing the installed production version, then runs:

```sh
seo --version
seo auth login
```

## Show the complete consent flow

Google opens the consent flow in the browser. Show every screen from the account
selection through to approval.

1. Show the SEO Skill application name.
2. Continue through the unverified-app warning if it still appears. This warning
   is expected while verification is pending.
3. Open **See all permissions** or the equivalent control.
4. Pause while the full permission list is visible.
5. Make sure every requested permission is readable.
6. Approve access.

The requested scopes should match the Google Cloud Console configuration:

```txt
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/webmasters.readonly
https://www.googleapis.com/auth/analytics.readonly
```

The narration stays focused on Google Analytics. The other configured services
remain visible so the reviewer can confirm that the consent screen and Cloud
Console configuration match.

## Show the connected account

Return to the terminal and run:

```sh
seo auth whoami
```

## Demonstrate Admin API discovery

List the Google Analytics properties available to the connected account:

```sh
seo analytics google properties
```

Run setup to show automatic web stream matching for Example Site:

```sh
seo start \
  --id oauth-verification-review \
  --name "Example Site" \
  --site sc-domain:example.com \
  --url https://example.com \
  --skip-mcp \
  --skip-skill
```

The runner accepts the project-profile confirmation automatically. It does not
preselect the Analytics result. The application reads the available web streams
and matches `example.com` to property `123456789` itself.

## Demonstrate Data API reports

The runner next shows compact JSON from the main report, the Google Analytics
report, AI referrals, and a before and after measurement. The commands use
small row and page limits and do not bypass the local cache.

The short narration for each result names the Analytics fields that feature
reads. The final narration names `analytics.readonly` once, explains why no
narrower permission can support the demonstrated reads, and confirms that no
Analytics write or management access is requested.

## Finish the recording

The runner stops recording and saves the finished movie to the Desktop. Upload
it to YouTube as **Unlisted** and test the URL in a private browser window. The
Google reviewer must be able to open it without requesting access.

Before submitting the video check that it shows:

- The configured scope list in Google Cloud Console.
- The complete OAuth grant flow.
- The complete permission list in English.
- `seo auth whoami` identifying the connected account.
- Google Analytics property discovery and a real Google Analytics report.
- Google Analytics web stream matching during project setup.
- Landing-page, AI referral, and before and after features.
- The submitted seoskill.dev homepage, privacy policy, terms, and authorized
  domain on the Branding page.
- A clear explanation of how the sensitive Google Analytics scope is used.
- A clear explanation that Google provides no narrower scope for these reads.
- A clear explanation that the Analytics permission is read-only and cannot
  write or delete source-account data.

Google's current requirements are covered in the
[OAuth demo video guide](https://support.google.com/cloud/answer/13804565?hl=en)
and the
[sensitive scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
Google's
[privacy policy review guide](https://support.google.com/cloud/answer/13806988?hl=en)
lists data protection, retention, and deletion as separate required
disclosures.

## Scope justification for the verification form

Copy this into the Google Analytics scope justification field:

> SEO Skill is a local command-line tool that connects a user's own Google
> Analytics data to reports they request.
>
> The Google Analytics read-only scope lists the user's Google Analytics accounts,
> properties, and web streams, then runs reports for the property they select.
> Web stream hostnames let project setup match a Search Console site to the
> correct Analytics property. Data API reports provide landing-page sessions and
> users, engagement, conversions, revenue, and identifiable AI referral
> sessions.
>
> SEO Skill requests read-only access because Google does not provide a narrower
> Google Analytics user OAuth scope for Admin API account, property, and web
> stream reads or Data API reporting. The available alternatives grant broader
> edit or management access. The application cannot write to or delete Google
> Analytics data.
>
> SEO Skill runs on the user's computer. OAuth tokens, API responses, reports,
> and caches remain on that computer and are not sent to the project maintainer.
> Google data is used only to run reports requested by the user. It is not used
> for advertising or to train general-purpose AI models.
