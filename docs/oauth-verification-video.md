# Record the Google OAuth verification video

Google needs to see the complete OAuth flow and the product feature that uses
the sensitive Google Analytics scope. Record the whole screen so the video
includes Google Cloud Console, the browser consent flow, and the `seo` terminal
commands.

Aim for three to five minutes. Explain what is happening as you go. A short,
clear recording is easier to review than a polished product demo.

The functionality demonstration only needs to cover Google Analytics. The
`analytics.readonly` scope is sensitive, not restricted. The complete consent
screen still needs to be visible so Google can confirm that the grant matches
the scopes configured for the OAuth client.

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
7. Run `seo auth logout` to remove the locally stored token.
8. Check that the consent screen language is English.

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

## Start from a logged-out CLI

Run:

```sh
seo --version
seo auth status
seo auth logout
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

## Demonstrate Google Analytics access

List the Google Analytics properties available to the connected account:

```sh
seo analytics google properties
```

Run a small landing-page report for the SEO Skill Google Analytics property:

```sh
seo analytics google report \
  --property "123456789" \
  --start-date 28daysAgo \
  --end-date yesterday \
  --dimensions landingPage \
  --metrics sessions,totalUsers \
  --limit 20
```

Say:

> The Analytics read-only scope lists the Google Analytics properties available to the user
> and runs reports for the property they select. The CLI cannot change Analytics
> accounts, properties, or events.

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
- A clear explanation of how the sensitive Google Analytics scope is used.
- A clear explanation that access is read-only and data stays local.

Google's current requirements are covered in the
[OAuth demo video guide](https://support.google.com/cloud/answer/13804565?hl=en)
and the
[sensitive scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

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
> The Google Analytics read-only scope lists the user's Google Analytics accounts and
> properties and runs reports for the property they select. This provides
> evidence such as landing-page traffic, engagement, conversions, and
> identifiable AI referral sessions.
>
> The OpenID and email scopes identify the connected Google account so the CLI
> can show the user which account is active and associate it with the correct
> locally stored OAuth credentials.
>
> SEO Skill requests read-only access because Google does not provide narrower
> scopes containing the Search Console performance, URL Inspection, Google Analytics
> property, and Google Analytics reporting data required by these features. The application
> does not request permission to edit Search Console or Analytics data.
>
> SEO Skill runs on the user's computer. OAuth tokens, API responses, reports,
> and caches remain on that computer and are not sent to the project maintainer.
> Google data is used only to run reports requested by the user. It is not used
> for advertising or to train general-purpose AI models.
