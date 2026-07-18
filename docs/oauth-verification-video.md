# Record the Google OAuth verification video

Google needs to see the complete OAuth flow and every distinct product use of
the sensitive Google Analytics scope. Record the whole screen so the video
includes Google Cloud Console, the browser consent flow, and the `seo` terminal
commands.

Aim for six to ten minutes. Explain what is happening as you go. Keep the
outputs bounded and readable.

The functionality demonstration only needs to cover Google Analytics. The
`analytics.readonly` scope is sensitive, not restricted. The complete consent
screen still needs to be visible so Google can confirm that the grant matches
the scopes configured for the OAuth client.

Google exposes no narrower user OAuth scope for these features. The Google
Analytics Data API accepts `analytics.readonly` or the broader `analytics`
scope. The Admin API reads used here accept `analytics.readonly` or the broader
`analytics.edit` scope. The video must say this plainly.

## Check the complete demo before recording

The guided runner invokes the globally installed production package and pauses
between scenes for narration. It does not use the uncommitted source build.

From the repository root run:

```sh
node scripts/oauth-verification-demo.mjs --print
```

Check the property, site, and generated change date. Override them when needed:

```sh
node scripts/oauth-verification-demo.mjs \
  --property 123456789 \
  --site sc-domain:seoskill.dev \
  --url https://seoskill.dev \
  --change-date 2026-06-27
```

The runner opens the browser pages and runs the commands. Account selection,
revoking the old grant, expanding the consent screen, and choosing a property
remain manual. Those steps need to be slow and readable on the recording.

The demo covers each distinct use of the scope:

| Google API use | User-facing feature shown |
| --- | --- |
| List account and property summaries | `seo analytics google properties` and project setup |
| List web streams and read their hostnames | Automatic Google Analytics matching in `seo start` |
| Read landing-page sessions, users, and conversions | Main report, direct Analytics report, and priority workflow |
| Read source, date, landing-page, session, event, and user data | AI referral report |
| Read daily sessions, engagement, conversions, and revenue | Before and after SEO test report |

The MCP server and TypeScript library call the same core functions. The CLI
demonstration is enough to show the data access because those alternate
surfaces do not request extra scopes or call different Google methods.

## Prepare the recording

1. Close any private tabs, terminals, and applications you do not want in the
   recording.
2. Turn off notifications.
3. Increase the terminal font size so every command and result is readable.
4. Open Google Cloud Console to the SEO Skill OAuth client.
5. Open [the SEO Skill homepage](https://seoskill.dev/) and
   [privacy policy](https://seoskill.dev/privacy).
6. Revoke the existing SEO Skill connection from
   [Google Account connections](https://myaccount.google.com/connections).
   This forces Google to show the complete consent flow again.
7. Check that the consent screen language is English.
8. Run the guided demo once before recording so a missing property or sparse
   report does not become a surprise halfway through.

Use `Cmd + Shift + 5` on macOS and choose **Record Entire Screen**. Turn on the
microphone. You can upload the finished recording to YouTube as **Unlisted**.

## Show the submitted application

Start in Google Cloud Console. Show these details clearly:

- The Google Cloud project name.
- The SEO Skill application name.
- The OAuth client page.
- The OAuth client ID.
- The configured OAuth scopes.

Do not show a client secret.

Say:

> This is SEO Skill, the application submitted for verification. It is a local
> command-line SEO auditing tool. This is the OAuth client used by the published
> CLI.

## Show the product and privacy policy

Open the SEO Skill homepage and privacy policy.

Say:

> SEO Skill runs locally and connects optional Google Analytics data to SEO
> audits. Tokens and report data remain on the user's computer.

## Run the guided recording

Start the runner from the repository root:

```sh
node scripts/oauth-verification-demo.mjs
```

It prints each command before running it and supplies a short talk-over cue.
The production `seo` command performs all application actions. The repository
script only sequences them.

The remaining sections explain what the reviewer should see during each scene.

## Start from a logged-out command

The runner shows the installed version, opens Google Account connections, and
runs:

```sh
seo auth logout
seo auth status
seo auth login
```

Say:

> I am starting without a stored Google session. Running `seo auth login` opens
> Google's OAuth grant process.

## Show the complete consent flow

Google opens the consent flow in the browser. Show every screen from the account
selection through to approval.

1. Show the SEO Skill application name.
2. Continue through the unverified-app warning if it still appears. This warning
   is expected while verification is pending.
3. Open **See all permissions** or the equivalent control.
4. Pause while the full permission list is visible.
5. Make sure the Search Console and Google Analytics read-only permissions are
   readable.
6. Approve access.

The requested scopes should match the Google Cloud Console configuration:

```txt
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/webmasters.readonly
https://www.googleapis.com/auth/analytics.readonly
```

Say:

> SEO Skill requests read-only access. This video focuses on the sensitive
> Google Analytics scope, which is used to list Google Analytics properties and run reports.
> SEO Skill cannot change Analytics accounts, properties, events, or reports.

## Show the connected account

Return to the terminal and run:

```sh
seo auth whoami
```

Say:

> The OpenID and email scopes identify which Google account is connected. They
> are not used to access Gmail or other Google content.

## Demonstrate Admin API discovery

List the Google Analytics properties available to the connected account:

```sh
seo analytics google properties
```

Run setup to show automatic web stream matching for the SEO Skill site:

```sh
seo start \
  --id oauth-verification-demo \
  --name "OAuth verification demo" \
  --site sc-domain:seoskill.dev \
  --url https://seoskill.dev \
  --skip-mcp \
  --skip-skill \
  --refresh
```

Say:

> The Analytics read-only scope lists the Google Analytics properties available to the user
> and reads web stream names and hostnames during setup. The app uses the web
> stream to match the selected site to the correct Analytics property. It saves
> only the selected numeric property ID in the local project profile.

## Demonstrate Data API reports

The runner next shows the main report, a direct Analytics report, AI referrals,
the priority workflow, and a before and after measurement. Keep each output on
screen long enough for its heading and metrics to be readable.

Say:

> These features read landing-page traffic, engagement, conversions, revenue,
> and measured referral sources from the selected Analytics property. The data
> is used for the report the user requested. The app cannot change Analytics
> accounts, properties, streams, events, or reports.

After the last report say:

> Google exposes `analytics.readonly` as the only read-only user OAuth scope for
> both these Admin API reads and Data API reports. The alternatives allow
> editing or management. SEO Skill requests no Analytics write, edit,
> user-management, provisioning, or deletion scope.

## Finish the recording

Say:

> All OAuth credentials and report results shown here are stored locally. SEO
> Skill does not send this Google data to the project maintainer, use it for
> advertising, or use it to train AI models.

Stop the recording. Upload it to YouTube as **Unlisted** and test the URL in a
private browser window. The Google reviewer must be able to open it without
requesting access.

Before submitting the video check that it shows:

- The same SEO Skill name and branding used in the verification request.
- The OAuth client ID.
- The complete OAuth grant flow.
- The complete permission list in English.
- `seo auth whoami` identifying the connected account.
- Google Analytics property discovery and a real Google Analytics report.
- Google Analytics web stream matching during project setup.
- Landing-page, AI referral, prioritisation, and before and after features.
- A clear explanation of how the sensitive Google Analytics scope is used.
- A clear explanation that Google provides no narrower scope for these reads.
- A clear explanation that access is read-only and data stays local.

Google's current requirements are covered in the
[OAuth demo video guide](https://support.google.com/cloud/answer/13804565?hl=en)
and the
[sensitive scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
Google's
[privacy policy review guide](https://support.google.com/cloud/answer/13806988?hl=en)
lists data protection, retention, and deletion as separate required
disclosures.

## Scope justification for the verification form

Copy this into the scope justification field:

> SEO Skill is a local command-line tool that helps users audit their own
> websites using evidence from Google Search Console and Google Analytics.
>
> The Search Console read-only scope lists the properties the signed-in user can
> access, reads search performance data, and requests URL Inspection results.
> This helps users investigate changes in clicks, impressions, CTR, and position,
> then check Google's recorded indexing status for affected pages.
>
> The Google Analytics read-only scope lists the user's Google Analytics accounts,
> properties, and web streams, then runs reports for the property they select.
> Web stream hostnames let project setup match a Search Console site to the
> correct Analytics property. Data API reports provide landing-page sessions and
> users, engagement, conversions, revenue, and identifiable AI referral
> sessions.
>
> The OpenID and email scopes identify the connected Google account so the CLI
> can show the user which account is active and associate it with the correct
> locally stored OAuth credentials.
>
> SEO Skill requests read-only access because Google does not provide a narrower
> Google Analytics user OAuth scope for Admin API account, property, and web
> stream reads or Data API reporting. The available alternatives grant broader
> edit or management access. The application does not request permission to
> edit Search Console or Analytics data.
>
> SEO Skill runs on the user's computer. OAuth tokens, API responses, reports,
> and caches remain on that computer and are not sent to the project maintainer.
> Google data is used only to run reports requested by the user. It is not used
> for advertising or to train general-purpose AI models.
